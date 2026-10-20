import { describe, expect, test } from "bun:test";
import { SHADOW_AGENTS, OPENCODE_OVERRIDES } from "./shadows";

describe("Shadow Agents", () => {
  test("has all expected shadows", () => {
    const expectedShadows = [
      "monarch",
      "beru",
      "igris",
      "bellion",
      "tusk",
      "tank",
      "shadow-sovereign",
    ];
    for (const name of expectedShadows) {
      expect(SHADOW_AGENTS[name]).toBeDefined();
    }
  });

  test("monarch is primary mode", () => {
    expect(SHADOW_AGENTS.monarch.mode).toBe("primary");
  });

  test("all other shadows are subagent mode", () => {
    const subagents = ["beru", "igris", "bellion", "tusk", "tank", "shadow-sovereign"];
    for (const name of subagents) {
      expect(SHADOW_AGENTS[name].mode).toBe("subagent");
    }
  });

  test("beru and bellion deny edits via V2 permission rules", () => {
    for (const name of ["beru", "bellion"]) {
      const rules = SHADOW_AGENTS[name].permissions ?? [];
      expect(rules).toContainEqual({ action: "edit", resource: "*", effect: "deny" });
    }
  });

  test("bellion requires approval for shell commands", () => {
    const rules = SHADOW_AGENTS.bellion.permissions ?? [];
    expect(rules).toContainEqual({ action: "shell", resource: "*", effect: "ask" });
  });

  test("shadow-sovereign has high reasoning effort", () => {
    expect(SHADOW_AGENTS["shadow-sovereign"].request?.body?.reasoningEffort).toBe("high");
  });

  test("all shadows have system prompts", () => {
    for (const [, agent] of Object.entries(SHADOW_AGENTS)) {
      expect(agent.system).toBeDefined();
      expect(agent.system?.length).toBeGreaterThan(50);
    }
  });
});

describe("OpenCode Overrides", () => {
  test("build has mode all", () => {
    expect(OPENCODE_OVERRIDES.build.mode).toBe("all");
  });

  test("plan has mode all", () => {
    expect(OPENCODE_OVERRIDES.plan.mode).toBe("all");
  });

  test("explore and general are hidden", () => {
    expect(OPENCODE_OVERRIDES.explore.hidden).toBe(true);
    expect(OPENCODE_OVERRIDES.general.hidden).toBe(true);
  });
});
