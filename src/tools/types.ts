import type { Plugin } from "@opencode/plugin";

export interface ToolContext {
  sessionID: string;
  agent: string;
  messageID: string;
  id: string;
  signal: AbortSignal;
  progress: (update: Record<string, unknown>) => Promise<void>;
}

export interface ToolResult {
  content: string;
}

export interface JsonObjectSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface AriseToolInfo {
  name: string;
  description: string;
  input: JsonObjectSchema;
  execute: (input: unknown, context: ToolContext) => Promise<ToolResult>;
}

export type AriseContext = Plugin.Context;
