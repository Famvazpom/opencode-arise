import type { ShadowName } from "../config/schema";
import { extractLastAssistantText } from "./session-output";
import type { AriseContext, AriseToolInfo, ToolContext } from "./types";

const ALLOWED_SHADOWS: ShadowName[] = ["beru", "igris", "bellion", "tusk", "tank", "shadow-sovereign"];

interface SummonInput {
  shadow: ShadowName;
  prompt: string;
  run_in_background: boolean;
  description?: string;
}

export function createCallAriseAgentTool(ctx: AriseContext): AriseToolInfo {
  return {
    name: "arise_summon",
    description: `Invoke a shadow soldier to perform a specific task.

Available shadows:
- beru: Fast codebase scout (exploration, grep, file discovery)
- igris: Precise implementation (code changes, running commands)
- bellion: Strategic planning (architecture, complex analysis)
- tusk: UI/UX specialist (frontend, styling, components)
- tank: External research (docs, web search, examples)
- shadow-sovereign: Deep reasoning (complex debugging, architecture decisions)

Use run_in_background=true for parallel execution (recommended for exploration/research).
Use run_in_background=false when you need the result immediately.`,

    input: {
      type: "object",
      properties: {
        shadow: {
          type: "string",
          enum: ALLOWED_SHADOWS,
          description: "Which shadow to summon",
        },
        prompt: {
          type: "string",
          description: "The task/question for the shadow (be specific)",
        },
        run_in_background: {
          type: "boolean",
          description: "true = async (parallel), false = sync (wait for result)",
        },
        description: {
          type: "string",
          description: "Short description of the task (for tracking)",
        },
      },
      required: ["shadow", "prompt", "run_in_background"],
      additionalProperties: false,
    },

    async execute(rawInput, _context: ToolContext) {
      const { shadow, prompt, run_in_background, description } = rawInput as SummonInput;
      const taskDesc = description ?? `${shadow} task`;

      try {
        const session = await ctx.session.create({
          title: `[arise] ${taskDesc}`,
          agent: shadow,
        });
        const sessionID = session.id;

        if (run_in_background) {
          void ctx.session.prompt({ sessionID, text: prompt }).catch(() => {});

          return {
            content: `[arise] Summoned ${shadow} in background.
Task: ${taskDesc}
Session ID: ${sessionID}

The shadow is working. Continue with your work.`,
          };
        }

        await ctx.session.prompt({ sessionID, text: prompt });
        await ctx.session.wait({ sessionID });

        const messages = await ctx.session.context({ sessionID });
        const text = extractLastAssistantText(messages);

        return {
          content: `[arise] ${shadow} reports:

${text || "(No text response)"}`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: `[arise] Failed to summon ${shadow}: ${message}` };
      }
    },
  };
}
