import { describe, expect, it } from "bun:test";
import { createCallAriseAgentTool } from "./call-arise-agent";
import {
  createBackgroundTaskTool,
  createBackgroundOutputTool,
  createBackgroundStatusTool,
  createBackgroundCancelTool,
} from "./background-tools";
import { BackgroundManager } from "./background-manager";
import { extractLastAssistantText, recentAssistantText } from "./session-output";
import { createMockContext } from "../testing/mock-context";

const TOOL_CONTEXT = {
  sessionID: "parent-session",
  agent: "monarch",
  messageID: "msg-1",
  id: "call-1",
  signal: new AbortController().signal,
  progress: async () => {},
};

describe("arise_summon tool", () => {
  it("has correct structure", () => {
    const { ctx } = createMockContext();
    const tool = createCallAriseAgentTool(ctx);

    expect(tool.name).toBe("arise_summon");
    expect(tool.description).toContain("shadow");
    expect(tool.input.type).toBe("object");
    expect(typeof tool.execute).toBe("function");
  });

  it("has all required inputs", () => {
    const { ctx } = createMockContext();
    const tool = createCallAriseAgentTool(ctx);
    const properties = tool.input.properties as Record<string, unknown>;

    expect(properties.shadow).toBeDefined();
    expect(properties.prompt).toBeDefined();
    expect(properties.run_in_background).toBeDefined();
    expect(properties.description).toBeDefined();
    expect(tool.input.required).toContain("shadow");
  });

  it("lists all shadows in description", () => {
    const { ctx } = createMockContext();
    const tool = createCallAriseAgentTool(ctx);

    for (const shadow of ["beru", "igris", "bellion", "tusk", "tank", "shadow-sovereign"]) {
      expect(tool.description).toContain(shadow);
    }
  });

  it("waits for the shadow and returns its report synchronously", async () => {
    const mock = createMockContext({
      messages: [{ type: "assistant", content: [{ type: "text", text: "All clear, Monarch." }] }],
    });
    const tool = createCallAriseAgentTool(mock.ctx);

    const result = await tool.execute(
      { shadow: "beru", prompt: "scout", run_in_background: false },
      TOOL_CONTEXT,
    );

    expect(result.content).toContain("All clear, Monarch.");
    expect(mock.waitCalls.length).toBe(1);
    expect(mock.promptCalls[0].text).toBe("scout");
  });

  it("does not wait when run in background", async () => {
    const mock = createMockContext();
    const tool = createCallAriseAgentTool(mock.ctx);

    const result = await tool.execute(
      { shadow: "tank", prompt: "research", run_in_background: true },
      TOOL_CONTEXT,
    );

    expect(result.content).toContain("background");
    expect(mock.waitCalls.length).toBe(0);
  });

  it("reports failures as content instead of throwing", async () => {
    const mock = createMockContext();
    mock.ctx.session.create = async () => {
      throw new Error("boom");
    };
    const tool = createCallAriseAgentTool(mock.ctx);

    const result = await tool.execute(
      { shadow: "beru", prompt: "scout", run_in_background: false },
      TOOL_CONTEXT,
    );

    expect(result.content).toContain("Failed to summon beru");
  });
});

describe("Background tools", () => {
  it("arise_background has correct structure", () => {
    const { ctx } = createMockContext();
    const tool = createBackgroundTaskTool(new BackgroundManager(ctx));

    expect(tool.name).toBe("arise_background");
    expect(tool.description).toContain("background");
    expect(tool.input.required).toContain("shadow");
  });

  it("arise_background_output returns not found for invalid task_id", async () => {
    const { ctx } = createMockContext();
    const tool = createBackgroundOutputTool(new BackgroundManager(ctx));

    const result = await tool.execute({ task_id: "invalid-id" }, TOOL_CONTEXT);
    expect(result.content).toContain("not found");
  });

  it("arise_background_status reports empty state", async () => {
    const { ctx } = createMockContext();
    const tool = createBackgroundStatusTool(new BackgroundManager(ctx));

    const result = await tool.execute({ current_session_only: false }, TOOL_CONTEXT);
    expect(result.content).toContain("No background tasks");
  });

  it("arise_background_cancel fails for invalid task_id", async () => {
    const { ctx } = createMockContext();
    const tool = createBackgroundCancelTool(new BackgroundManager(ctx));

    const result = await tool.execute({ task_id: "invalid-id" }, TOOL_CONTEXT);
    expect(result.content).toContain("Could not cancel");
  });
});

describe("BackgroundManager", () => {
  it("generates unique task IDs", () => {
    const { ctx } = createMockContext();
    const manager = new BackgroundManager(ctx);

    const id1 = manager.generateTaskId();
    const id2 = manager.generateTaskId();

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^arise_/);
    expect(id2).toMatch(/^arise_/);
  });

  it("returns undefined for non-existent task", () => {
    const { ctx } = createMockContext();
    const manager = new BackgroundManager(ctx);
    expect(manager.getTask("non-existent")).toBeUndefined();
  });

  it("returns empty array when no tasks", () => {
    const { ctx } = createMockContext();
    const manager = new BackgroundManager(ctx);
    expect(manager.getAllTasks()).toEqual([]);
  });

  it("launches a task in a V2 session with the shadow as agent", async () => {
    const mock = createMockContext();
    const manager = new BackgroundManager(mock.ctx);

    const task = await manager.launch({
      shadow: "beru",
      prompt: "scout",
      description: "scout task",
      parentSessionId: "parent",
    });

    expect(task.status).toBe("running");
    expect(mock.sessions.get(task.sessionId)?.agent).toBe("beru");
    expect(manager.getTasksForSession("parent").length).toBe(1);
  });

  it("marks a task as an error when cancelled", async () => {
    const mock = createMockContext();
    const manager = new BackgroundManager(mock.ctx);

    const task = await manager.launch({
      shadow: "tank",
      prompt: "research",
      description: "research task",
      parentSessionId: "parent",
    });

    const cancelled = await manager.cancelTask(task.id);

    expect(cancelled).toBe(true);
    expect(manager.getTask(task.id)?.error).toBe("Cancelled");
    expect(mock.interruptCalls).toContain(task.sessionId);
  });
});

describe("session-output helpers", () => {
  it("extracts the last assistant text", () => {
    const messages = [
      { type: "assistant", content: [{ type: "text", text: "first" }] },
      { type: "assistant", content: [{ type: "text", text: "second" }] },
    ];
    expect(extractLastAssistantText(messages)).toBe("second");
  });

  it("ignores non-text and non-assistant messages", () => {
    const messages = [
      { type: "user", content: [{ type: "text", text: "hello" }] },
      { type: "assistant", content: [{ type: "reasoning", text: "thinking" }] },
    ];
    expect(extractLastAssistantText(messages)).toBe("");
  });

  it("returns the most recent assistant texts for the todo enforcer", () => {
    const messages = [
      { type: "assistant", content: [{ type: "text", text: "one" }] },
      { type: "assistant", content: [{ type: "text", text: "two" }] },
      { type: "assistant", content: [{ type: "text", text: "three" }] },
    ];
    expect(recentAssistantText(messages, 2)).toEqual([{ content: "two" }, { content: "three" }]);
  });
});
