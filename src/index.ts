import { Agent, Model, Plugin } from "@opencode/plugin";
import { AriseConfigSchema, DEFAULT_CONFIG, type AriseConfig, type HookName, type ShadowName } from "./config/schema";
import { SHADOW_AGENTS, OPENCODE_OVERRIDES } from "./agents";
import {
  createAriseBannerHook,
  createOutputShaperHook,
  createCompactionPreserverHook,
  createTodoEnforcerHook,
} from "./hooks";
import {
  createCallAriseAgentTool,
  BackgroundManager,
  recentAssistantText,
  createBackgroundTaskTool,
  createBackgroundOutputTool,
  createBackgroundStatusTool,
  createBackgroundCancelTool,
} from "./tools";

type JsonObject = Record<string, unknown>;

const CONFIG_FILENAME = "opencode-arise.json";

async function loadAriseConfig(ctx: Plugin.Context): Promise<AriseConfig> {
  const paths = [
    `${ctx.location.directory}/.opencode/${CONFIG_FILENAME}`,
    `${process.env.HOME}/.config/opencode/${CONFIG_FILENAME}`,
  ];

  let merged: JsonObject = { ...DEFAULT_CONFIG };

  for (const path of paths.reverse()) {
    try {
      const file = Bun.file(path);
      if (await file.exists()) {
        const content = await file.text();
        const parsed = JSON.parse(content);
        merged = deepMerge(merged, parsed);
      }
    } catch {
      // Config file doesn't exist or is invalid, continue
    }
  }

  const result = AriseConfigSchema.safeParse(merged);
  if (!result.success) {
    console.warn("[opencode-arise] Invalid config, using defaults:", result.error.message);
    return DEFAULT_CONFIG;
  }

  return result.data;
}

function deepMerge(base: JsonObject, override: JsonObject): JsonObject {
  const result: JsonObject = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key] as JsonObject, value as JsonObject);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isHookEnabled(config: AriseConfig, hookName: HookName): boolean {
  return !(config.disabled_hooks ?? []).includes(hookName);
}

type AgentEditor = Parameters<Parameters<Plugin.Context["agent"]["transform"]>[0]>[0];

function applyShadowAgents(editor: AgentEditor, config: AriseConfig): void {
  editor.default("monarch");

  const disabledShadows = new Set(config.disabled_shadows ?? []);
  for (const [shadowId, shadow] of Object.entries(SHADOW_AGENTS)) {
    if (disabledShadows.has(shadowId as ShadowName)) continue;

    const userOverride = config.agents?.[shadowId as ShadowName];
    if (userOverride?.disabled) continue;

    const model = Model.Ref.parse(userOverride?.model ?? shadow.model);

    editor.update(shadowId, (agent) => {
      agent.name = Agent.Name.make(shadow.name);
      agent.description = shadow.description;
      agent.mode = shadow.mode;
      agent.model = model;
      agent.steps = shadow.steps;
      if (shadow.system) agent.system = shadow.system;
      if (shadow.request?.body) {
        Object.assign(agent.request.body, shadow.request.body);
      }
      for (const rule of shadow.permissions ?? []) {
        agent.permissions.push(rule);
      }
    });
  }

  // V2 keeps built-in agents but lets plugins adjust them (mode/model/visibility).
  for (const [agentId, override] of Object.entries(OPENCODE_OVERRIDES)) {
    editor.update(agentId, (agent) => {
      if (override.mode) agent.mode = override.mode;
      if (override.hidden !== undefined) agent.hidden = override.hidden;
      if (override.model) agent.model = Model.Ref.parse(override.model);
    });
  }
}

const OpencodeArise = Plugin.define({
  id: "opencode-arise",
  async setup(ctx) {
    const config = await loadAriseConfig(ctx);
    const backgroundManager = new BackgroundManager(ctx);

    const bannerHook = isHookEnabled(config, "arise-banner") && config.show_banner
      ? createAriseBannerHook()
      : null;

    const outputShaper = isHookEnabled(config, "output-shaper")
      ? createOutputShaperHook(config)
      : null;

    const compactionPreserver = isHookEnabled(config, "compaction-preserver")
      ? createCompactionPreserverHook()
      : null;

    const todoEnforcer = isHookEnabled(config, "todo-enforcer")
      ? createTodoEnforcerHook()
      : null;

    // Agents: create the shadow army and adjust built-in agents.
    await ctx.agent.transform((editor) => {
      applyShadowAgents(editor, config);
    });

    // Tools: V2 registers definitions through a replayable transform.
    await ctx.tool.transform((editor) => {
      editor.add(createCallAriseAgentTool(ctx));
      editor.add(createBackgroundTaskTool(backgroundManager));
      editor.add(createBackgroundOutputTool(backgroundManager));
      editor.add(createBackgroundStatusTool(backgroundManager));
      editor.add(createBackgroundCancelTool(backgroundManager));
    });

    if (outputShaper) {
      await ctx.tool.hook("execute.after", async (event) => {
        if (event.status !== "completed") return;

        const result = event.result;
        const metadata = result.metadata as Record<string, unknown> | undefined;
        if (typeof result.content === "string") {
          event.result = {
            ...result,
            content: outputShaper.shapeOutput(event.tool, result.content, metadata),
          };
        } else if (Array.isArray(result.content)) {
          event.result = {
            ...result,
            content: result.content.map((part) =>
              part.type === "text"
                ? { ...part, text: outputShaper.shapeOutput(event.tool, part.text, metadata) }
                : part,
            ),
          };
        }
      });
    }

    if (compactionPreserver) {
      await ctx.session.hook("compaction", (event) => {
        event.system.push({
          type: "text",
          text: compactionPreserver.getPreservationContext(),
        });
      });
    }

    // Events: V2 exposes one subscription instead of a returned `event` hook.
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          await handleEvent(event as { type: string; data?: { sessionID?: string } });
        }
      } catch {
        // Subscription aborted on plugin unload.
      }
    })();

    async function handleEvent(event: { type: string; data?: { sessionID?: string } }): Promise<void> {
      try {
        if (event.type === "session.execution.started" && bannerHook) {
          await bannerHook.onSessionCreated();
          return;
        }

        if (
          todoEnforcer &&
          (event.type === "session.execution.succeeded" ||
            event.type === "session.execution.failed" ||
            event.type === "session.execution.interrupted")
        ) {
          const sessionID = event.data?.sessionID;
          if (!sessionID) return;

          const messages = await ctx.session.context({ sessionID });
          const result = await todoEnforcer.checkCompletion(recentAssistantText(messages));

          if (result.hasIncompleteTodos && result.reminderMessage) {
            // V2 server plugins have no TUI toast API; surface the reminder in the log.
            console.warn(result.reminderMessage);
          }
        }
      } catch {
        // Ignore errors in event handling
      }
    }

    return () => controller.abort();
  },
});

export default OpencodeArise;

// NOTE: Do NOT export non-type values from main index.ts!
// OpenCode treats ALL exports as plugin instances and tries to call them.
export type { AriseConfig } from "./config/schema";
export type { ShadowAgent } from "./agents/shadows";
