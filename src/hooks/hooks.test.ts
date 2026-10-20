import { describe, expect, it } from "bun:test";
import { createAriseBannerHook, getBanner, BANNER_TOAST_MESSAGE } from "./arise-banner";
import { createCompactionPreserverHook } from "./compaction-preserver";
import { createTodoEnforcerHook } from "./todo-enforcer";

describe("arise-banner hook", () => {
  it("getBanner returns ASCII art", () => {
    const banner = getBanner();

    expect(banner).toContain("A R I S E");
    expect(banner).toContain("Shadow Army");
    expect(banner).toContain("Monarch");
  });

  it("exposes a toast message for the TUI plugin", () => {
    expect(BANNER_TOAST_MESSAGE).toContain("ARISE");
  });

  it("creates hook with onSessionCreated", () => {
    const hook = createAriseBannerHook();

    expect(hook).toBeDefined();
    expect(hook.onSessionCreated).toBeDefined();
    expect(typeof hook.onSessionCreated).toBe("function");
  });

  it("prints the banner at most once per process", async () => {
    const hook = createAriseBannerHook();
    const original = console.log;
    let calls = 0;
    console.log = () => {
      calls++;
    };
    try {
      await hook.onSessionCreated();
      const afterFirst = calls;
      await hook.onSessionCreated();
      // Second call must not print again regardless of process-level state.
      expect(calls).toBe(afterFirst);
      // And the flag is process-wide, so it never prints more than once.
      expect(afterFirst).toBeLessThanOrEqual(1);
    } finally {
      console.log = original;
    }
  });
});

describe("compaction-preserver hook", () => {
  it("creates hook with getPreservationContext", () => {
    const hook = createCompactionPreserverHook();

    expect(hook).toBeDefined();
    expect(hook.getPreservationContext).toBeDefined();
    expect(typeof hook.getPreservationContext).toBe("function");
  });

  it("returns context with preservation rules", () => {
    const hook = createCompactionPreserverHook();
    const context = hook.getPreservationContext();

    expect(context).toContain("PRESERVE");
    expect(context).toContain("TODO");
    expect(context).toContain("PRUNE");
  });
});

describe("todo-enforcer hook", () => {
  it("creates hook with checkCompletion", () => {
    const hook = createTodoEnforcerHook();

    expect(hook).toBeDefined();
    expect(hook.checkCompletion).toBeDefined();
    expect(typeof hook.checkCompletion).toBe("function");
  });

  it("detects pending todos", async () => {
    const hook = createTodoEnforcerHook();

    const result = await hook.checkCompletion([
      { content: "1. [pending] Fix the bug" },
      { content: "2. [completed] Write tests" },
    ]);

    expect(result.hasIncompleteTodos).toBe(true);
    expect(result.reminderMessage).toBeDefined();
  });

  it("detects in_progress todos", async () => {
    const hook = createTodoEnforcerHook();

    const result = await hook.checkCompletion([
      { content: "1. [in_progress] Working on feature" },
    ]);

    expect(result.hasIncompleteTodos).toBe(true);
  });

  it("returns false when all complete", async () => {
    const hook = createTodoEnforcerHook();

    const result = await hook.checkCompletion([
      { content: "1. [completed] Done" },
      { content: "2. [completed] Also done" },
    ]);

    expect(result.hasIncompleteTodos).toBe(false);
  });

  it("returns false when no todos", async () => {
    const hook = createTodoEnforcerHook();

    const result = await hook.checkCompletion([
      { content: "Just some regular text without todos" },
    ]);

    expect(result.hasIncompleteTodos).toBe(false);
  });

  it("detects markdown checkbox todos", async () => {
    const hook = createTodoEnforcerHook();

    const result = await hook.checkCompletion([{ content: "- [ ] Unchecked item" }]);

    expect(result.hasIncompleteTodos).toBe(true);
  });
});
