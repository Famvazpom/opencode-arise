#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getBanner } from "../hooks";

const PLUGIN_NAME = "opencode-arise";
const OPENCODE_CONFIG_PATHS = [
  join(process.env.HOME ?? "", ".config/opencode/opencode.json"),
  join(process.env.HOME ?? "", ".config/opencode/opencode.jsonc"),
];

function findOpencodeConfig(): string | null {
  for (const path of OPENCODE_CONFIG_PATHS) {
    if (existsSync(path)) return path;
  }
  return null;
}

function parseJsonc(content: string): unknown {
  // More robust JSONC parsing:
  // 1. Remove single-line comments (but not inside strings)
  // 2. Remove multi-line comments
  // 3. Remove trailing commas
  
  let result = "";
  let inString = false;
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  let i = 0;
  
  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (inSingleLineComment) {
      if (char === "\n") {
        inSingleLineComment = false;
        result += char;
      }
      i++;
      continue;
    }
    
    if (inMultiLineComment) {
      if (char === "*" && nextChar === "/") {
        inMultiLineComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    
    if (inString) {
      result += char;
      if (char === "\\") {
        // Skip escaped character
        result += nextChar ?? "";
        i += 2;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      i++;
      continue;
    }
    
    // Not in string or comment
    if (char === '"') {
      inString = true;
      result += char;
      i++;
      continue;
    }
    
    if (char === "/" && nextChar === "/") {
      inSingleLineComment = true;
      i += 2;
      continue;
    }
    
    if (char === "/" && nextChar === "*") {
      inMultiLineComment = true;
      i += 2;
      continue;
    }
    
    result += char;
    i++;
  }
  
  // Remove trailing commas
  result = result.replace(/,(\s*[}\]])/g, "$1");
  
  return JSON.parse(result);
}

function addPluginToConfig(configPath: string): boolean {
  let content: string;
  
  try {
    content = readFileSync(configPath, "utf-8");
  } catch (err) {
    console.error(`✗ Failed to read config file: ${configPath}`);
    console.error(`  Error: ${err instanceof Error ? err.message : err}`);
    return false;
  }
  
  let config: Record<string, unknown>;
  
  try {
    config = parseJsonc(content) as Record<string, unknown>;
  } catch (err) {
    console.error(`✗ Failed to parse config file: ${configPath}`);
    console.error(`  Error: ${err instanceof Error ? err.message : err}`);
    console.error(`\n  Your config file may have invalid JSON syntax.`);
    console.error(`  You can manually add "${PLUGIN_NAME}" to the "plugins" array.`);
    return false;
  }

  try {
    // V2 uses "plugins". Legacy V1 configs used "plugin"; if the package is only
    // registered there, keep it and report success instead of duplicating it.
    const legacyPlugins = config.plugin;
    if (Array.isArray(legacyPlugins) && isPluginEntry(legacyPlugins, PLUGIN_NAME)) {
      console.log(`✓ ${PLUGIN_NAME} already registered in OpenCode config (legacy "plugin")`);
      return true;
    }

    if (!config.plugins) {
      config.plugins = [];
    }

    if (!Array.isArray(config.plugins)) {
      console.error(`✗ Existing "plugins" value is not an array; leaving config untouched.`);
      return false;
    }

    const plugins = config.plugins as unknown[];
    if (isPluginEntry(plugins, PLUGIN_NAME)) {
      console.log(`✓ ${PLUGIN_NAME} already registered in OpenCode config`);
      return true;
    }

    plugins.push(PLUGIN_NAME);

    const newContent = JSON.stringify(config, null, 2);
    writeFileSync(configPath, newContent, "utf-8");

    console.log(`✓ Added ${PLUGIN_NAME} to ${configPath}`);
    return true;
  } catch (err) {
    console.error(`✗ Failed to update config:`, err);
    return false;
  }
}

/** V2 `plugins` entries are either a package name or an object with a `package` field. */
function isPluginEntry(plugins: unknown[], name: string): boolean {
  return plugins.some((entry) => {
    if (typeof entry === "string") return entry === name;
    if (entry && typeof entry === "object" && "package" in entry) {
      return (entry as { package?: unknown }).package === name;
    }
    return false;
  });
}

function createDefaultAriseConfig(): void {
  const configDir = join(process.env.HOME ?? "", ".config/opencode");
  const configPath = join(configDir, "opencode-arise.json");

  if (existsSync(configPath)) {
    console.log(`✓ opencode-arise.json already exists`);
    return;
  }

  const defaultConfig = {
    show_banner: true,
    disabled_shadows: [],
    disabled_hooks: [],
  };

  try {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), "utf-8");
    console.log(`✓ Created default config at ${configPath}`);
  } catch (err) {
    console.error(`✗ Failed to create config:`, err);
  }
}

function install(): void {
  console.log(getBanner());
  console.log("\n🌑 Installing opencode-arise...\n");

  const configPath = findOpencodeConfig();
  if (!configPath) {
    console.error("✗ OpenCode config not found. Is OpenCode installed?");
    console.error("  Expected: ~/.config/opencode/opencode.json");
    process.exit(1);
  }

  const success = addPluginToConfig(configPath);
  if (!success) {
    process.exit(1);
  }

  createDefaultAriseConfig();

  console.log("\n⚔️  Installation complete!");
  console.log("\n  The Shadow Army awaits. Run 'opencode' to begin.\n");
  console.log("  Shadows available:");
  console.log("    @beru      - Fast codebase scout (Ant King)");
  console.log("    @igris     - Precise implementation (Loyal Knight)");
  console.log("    @bellion   - Strategic planning (Grand Marshal)");
  console.log("    @tusk      - UI/UX specialist");
  console.log("    @tank      - External research");
  console.log("    @shadow-sovereign - Deep reasoning (Full Power)");
  console.log("");
}

function doctor(): void {
  console.log("🔍 Checking opencode-arise installation...\n");

  const configPath = findOpencodeConfig();
  if (!configPath) {
    console.log("✗ OpenCode config not found");
    process.exit(1);
  }
  console.log(`✓ OpenCode config: ${configPath}`);

  try {
    const content = readFileSync(configPath, "utf-8");
    const config = parseJsonc(content) as Record<string, unknown>;
    const plugins = Array.isArray(config.plugins) ? (config.plugins as unknown[]) : [];
    const legacyPlugins = Array.isArray(config.plugin) ? (config.plugin as unknown[]) : [];

    if (isPluginEntry(plugins, PLUGIN_NAME)) {
      console.log(`✓ ${PLUGIN_NAME} is registered (plugins)`);
    } else if (isPluginEntry(legacyPlugins, PLUGIN_NAME)) {
      console.log(`○ ${PLUGIN_NAME} is registered via legacy "plugin" entry`);
      console.log(`  V2 uses "plugins". Run: bunx ${PLUGIN_NAME} install to migrate it.`);
    } else {
      console.log(`✗ ${PLUGIN_NAME} is NOT registered`);
      console.log(`  Run: bunx ${PLUGIN_NAME} install`);
    }
  } catch (err) {
    console.log(`✗ Failed to read config:`, err instanceof Error ? err.message : err);
  }

  const ariseConfigPath = join(process.env.HOME ?? "", ".config/opencode/opencode-arise.json");
  if (existsSync(ariseConfigPath)) {
    console.log(`✓ opencode-arise.json exists`);
  } else {
    console.log(`○ opencode-arise.json not found (optional)`);
  }

  console.log("\n✅ Doctor check complete");
}

function showHelp(): void {
  console.log(`
${getBanner()}
Usage: opencode-arise <command>

Commands:
  install   Register plugin with OpenCode and create default config
  doctor    Check installation status
  help      Show this help message

Examples:
  bunx opencode-arise install
  npx opencode-arise install
`);
}

// Main
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "install":
    install();
    break;
  case "doctor":
    doctor();
    break;
  case "help":
  case "--help":
  case "-h":
    showHelp();
    break;
  default:
    if (command) {
      console.error(`Unknown command: ${command}`);
    }
    showHelp();
    process.exit(command ? 1 : 0);
}
