import { describe, expect, it } from "bun:test";

describe("Plugin exports", () => {
  it("only exports default (plugin definition)", async () => {
    const module = await import("./index");
    const exportNames = Object.keys(module);

    // OpenCode treats every export of the plugin entry as a plugin instance.
    expect(exportNames).toEqual(["default"]);
  });

  it("default export is a V2 plugin definition", async () => {
    const module = await import("./index");

    expect(module.default).toBeDefined();
    expect(module.default.id).toBe("opencode-arise");
    expect(typeof module.default.setup).toBe("function");
  });
});
