import { describe, expect, it } from "bun:test";
import OpencodeArise from "./index";
import { createMockContext } from "./testing/mock-context";

const TOOL_NAMES = [
  "arise_summon",
  "arise_background",
  "arise_background_output",
  "arise_background_status",
  "arise_background_cancel",
];

async function setup() {
  const mock = createMockContext();
  const cleanup = await OpencodeArise.setup(mock.ctx);
  return { ...mock, cleanup };
}

describe("Plugin setup (V2)", () => {
  it("returns a cleanup function", async () => {
    const mock = createMockContext();
    const cleanup = await OpencodeArise.setup(mock.ctx);
    expect(typeof cleanup).toBe("function");
  });

  it("registers all 5 custom tools", async () => {
    const mock = await setup();
    expect(Array.from(mock.tools.keys()).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it("sets the default agent to monarch", async () => {
    const mock = await setup();
    expect(mock.defaultAgent.value).toBe("monarch");
  });

  it("creates all shadow agents", async () => {
    const mock = await setup();
    for (const name of [
      "monarch",
      "beru",
      "igris",
      "bellion",
      "tusk",
      "tank",
      "shadow-sovereign",
    ]) {
      expect(mock.agents.get(name)).toBeDefined();
    }
  });

  it("sets correct modes for agents", async () => {
    const mock = await setup();
    expect(mock.agents.get("monarch").mode).toBe("primary");
    expect(mock.agents.get("beru").mode).toBe("subagent");
    expect(mock.agents.get("bellion").mode).toBe("subagent");
  });

  it("applies edit denial permissions to read-only shadows", async () => {
    const mock = await setup();

    const beruRules = mock.agents.get("beru").permissions as Array<{ action: string; effect: string }>;
    expect(beruRules).toContainEqual({ action: "edit", resource: "*", effect: "deny" });

    const bellionRules = mock.agents.get("bellion").permissions as Array<{ action: string; effect: string }>;
    expect(bellionRules).toContainEqual({ action: "edit", resource: "*", effect: "deny" });
    expect(bellionRules).toContainEqual({ action: "shell", resource: "*", effect: "ask" });
  });

  it("applies built-in agent overrides", async () => {
    const mock = await setup();
    expect(mock.agents.get("build").mode).toBe("all");
    expect(mock.agents.get("plan").mode).toBe("all");
    expect(mock.agents.get("explore").hidden).toBe(true);
    expect(mock.agents.get("general").hidden).toBe(true);
  });

  it("honors disabled_shadows config", async () => {
    const { writeFileSync, mkdirSync, rmSync } = await import("fs");
    const dir = "/tmp/opencode/arise-test-disabled";
    mkdirSync(`${dir}/.opencode`, { recursive: true });
    writeFileSync(
      `${dir}/.opencode/opencode-arise.json`,
      JSON.stringify({ disabled_shadows: ["tank"] }),
    );

    try {
      const mock = createMockContext({ directory: dir });
      await OpencodeArise.setup(mock.ctx);
      expect(mock.agents.get("tank")).toBeUndefined();
      expect(mock.agents.get("beru")).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("registers the compaction hook and injects context", async () => {
    const mock = await setup();
    expect(mock.sessionHooks.length).toBeGreaterThan(0);

    const event = { sessionID: "test", system: [] as Array<{ type: string; text: string }>, messages: [] };
    await mock.sessionHooks[0](event);

    expect(event.system.length).toBeGreaterThan(0);
    expect(event.system[0].text).toContain("PRESERVE");
  });

  it("shapes long tool output through the execute.after hook", async () => {
    const mock = await setup();
    expect(mock.toolHooks.length).toBeGreaterThan(0);

    const longOutput = "x".repeat(20000);
    const event = {
      tool: "bash",
      sessionID: "test",
      callID: "test",
      status: "completed" as const,
      result: { content: longOutput, metadata: {} },
    };
    await mock.toolHooks[0](event);

    expect(typeof event.result.content).toBe("string");
    expect((event.result.content as string).length).toBeLessThan(longOutput.length);
  });

  it("does not shape output for failed tool calls", async () => {
    const mock = await setup();
    const longOutput = "x".repeat(20000);
    const event = {
      tool: "bash",
      sessionID: "test",
      callID: "test",
      status: "error" as const,
      result: { content: longOutput, metadata: {} },
    };
    await mock.toolHooks[0](event);

    expect(event.result.content).toBe(longOutput);
  });
});

describe("Event handling", () => {
  it("handles session lifecycle events without throwing", async () => {
    const mock = await setup();

    await expect(
      mock.emit({ type: "session.execution.started", data: { sessionID: "s1" } }),
    ).resolves.toBeUndefined();
    await expect(
      mock.emit({ type: "session.execution.succeeded", data: { sessionID: "s1" } }),
    ).resolves.toBeUndefined();
    await expect(mock.emit({ type: "unknown.event" })).resolves.toBeUndefined();
  });

  it("checks the transcript on execution completion", async () => {
    const mock = await setup();
    mock.setNextMessages([
      { type: "assistant", content: [{ type: "text", text: "1. [pending] unfinished task" }] },
    ]);

    await expect(
      mock.emit({ type: "session.execution.succeeded", data: { sessionID: "s1" } }),
    ).resolves.toBeUndefined();
  });
});
