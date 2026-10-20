/**
 * Minimal in-memory implementation of the OpenCode V2 `Plugin.Context` used by
 * tests. This directory is excluded from `tsc` (see tsconfig.json) so the mocks
 * do not need to match the full generated client types.
 */
import type { Plugin } from "@opencode/plugin";

type AnyFn = (...args: any[]) => any;

export interface MockTool {
  name: string;
  description: string;
  input: unknown;
  execute: (input: any, context: any) => Promise<{ content: unknown }>;
}

export interface MockToolAfterEvent {
  tool: string;
  sessionID: string;
  callID: string;
  status: "completed" | "error";
  result: { content: unknown; metadata?: Record<string, unknown> };
}

export interface MockCompactionEvent {
  sessionID: string;
  system: Array<{ type: string; text: string }>;
  messages: unknown[];
}

export interface MockContext {
  ctx: Plugin.Context;
  tools: Map<string, MockTool>;
  agents: Map<string, any>;
  defaultAgent: { value?: string };
  toolHooks: Array<(event: FakeToolAfterEvent) => unknown>;
  sessionHooks: Array<(event: MockCompactionEvent) => unknown>;
  sessions: Map<string, { id: string; title?: string; agent?: string; messages: unknown[] }>;
  emit(event: { type: string; data?: { sessionID?: string } }): Promise<void>;
  setNextMessages(messages: unknown[]): void;
  promptCalls: Array<{ sessionID: string; text: string }>;
  interruptCalls: string[];
  waitCalls: string[];
}

type FakeToolAfterEvent = {
  tool: string;
  sessionID: string;
  callID: string;
  status: "completed" | "error";
  result: { content: unknown; metadata?: Record<string, unknown> };
};

export function createMockContext(
  options: {
    directory?: string;
    messages?: unknown[];
    locationExists?: (path: string) => boolean;
    fileText?: (path: string) => string;
  } = {},
): MockContext {
  const tools = new Map<string, MockTool>();
  const agents = new Map<string, any>();
  const defaultAgent: { value?: string } = {};
  const toolHooks: Array<(event: FakeToolAfterEvent) => unknown> = [];
  const sessionHooks: Array<(event: MockCompactionEvent) => unknown> = [];
  const sessions = new Map<
    string,
    { id: string; title?: string; agent?: string; messages: unknown[] }
  >();
  const promptCalls: Array<{ sessionID: string; text: string }> = [];
  const interruptCalls: string[] = [];
  const waitCalls: string[] = [];

  let sessionCounter = 0;
  let nextMessages: unknown[] = options.messages ?? [];

  const subscribers = new Set<(event: { type: string; data?: { sessionID?: string } }) => void>();

  const registration = { dispose: async () => {} };

  const agentEditor = {
    list: () => Array.from(agents.values()),
    get: (id: string) => agents.get(id),
    default: (id: string | undefined) => {
      defaultAgent.value = id;
    },
    update: (id: string, update: (agent: any) => void) => {
      const current = agents.get(id) ?? {
        id,
        name: id,
        permissions: [] as any[],
        request: { body: {} },
      };
      if (!agents.has(id)) agents.set(id, current);
      update(current);
    },
    remove: (id: string) => {
      agents.delete(id);
    },
  };

  const toolEditor = {
    add: (tool: MockTool) => {
      tools.set(tool.name, tool);
      return tool;
    },
    addMany: (list: MockTool[]) => list.forEach((t) => tools.set(t.name, t)),
    list: () => Array.from(tools.values()),
    get: (name: string) => tools.get(name),
    remove: (name: string) => {
      tools.delete(name);
    },
  };

  const ctx = {
    app: { name: "opencode", version: "2.1.1", channel: "local" },
    options: {},
    location: {
      directory: options.directory ?? "/tmp/test-project",
      project: {
        id: "test-project",
        directory: options.directory ?? "/tmp/test-project",
      },
    },
    agent: {
      list: async () => Array.from(agents.values()),
      get: async (id: string) => agents.get(id),
      reload: async () => {},
      transform: async (callback: (editor: typeof agentEditor) => void) => {
        callback(agentEditor);
        return registration;
      },
    },
    tool: {
      list: async () => Array.from(tools.values()),
      get: async (name: string) => tools.get(name),
      reload: async () => {},
      transform: async (callback: (editor: typeof toolEditor) => void) => {
        callback(toolEditor);
        return registration;
      },
      hook: async (_name: string, callback: AnyFn) => {
        toolHooks.push(callback as any);
        return registration;
      },
    },
    session: {
      create: async (input: any) => {
        const id = `test-session-${++sessionCounter}`;
        const session = { id, title: input?.title, agent: input?.agent, messages: [] as unknown[] };
        sessions.set(id, session);
        return session;
      },
      prompt: async (input: any) => {
        promptCalls.push({ sessionID: input.sessionID, text: input.text });
        return {};
      },
      wait: async (input: any) => {
        waitCalls.push(input.sessionID);
        return {};
      },
      context: async (input: any) => nextMessages,
      interrupt: async (input: any) => {
        interruptCalls.push(input.sessionID);
        return {};
      },
      hook: async (_name: string, callback: AnyFn) => {
        sessionHooks.push(callback as any);
        return registration;
      },
    },
    event: {
      subscribe: (_input?: { signal?: AbortSignal }) => {
        return {
          async *[Symbol.asyncIterator]() {
            const queue: Array<{ type: string; data?: { sessionID?: string } }> = [];
            const notify = () => {};
            const handler = (event: { type: string; data?: { sessionID?: string } }) => {
              queue.push(event);
              notify();
            };
            subscribers.add(handler);
            try {
              while (true) {
                if (queue.length === 0) {
                  await new Promise((resolve) => setTimeout(resolve, 0));
                  continue;
                }
                yield queue.shift()!;
              }
            } finally {
              subscribers.delete(handler);
            }
          },
        } as AsyncIterable<{ type: string; data?: { sessionID?: string } }>;
      },
    },
    shell: {
      hook: async () => registration,
    },
    storage: {
      get: async () => undefined,
      set: async () => {},
      delete: async () => {},
    },
  } as unknown as Plugin.Context;

  return {
    ctx,
    tools,
    agents,
    defaultAgent,
    toolHooks,
    sessionHooks,
    sessions,
    promptCalls,
    interruptCalls,
    waitCalls,
    async emit(event) {
      for (const handler of subscribers) handler(event);
      // Allow the subscription loop to dequeue and process.
      await new Promise((resolve) => setTimeout(resolve, 5));
    },
    setNextMessages(messages: unknown[]) {
      nextMessages = messages;
    },
  };
}
