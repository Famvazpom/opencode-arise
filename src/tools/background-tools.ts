import type { BackgroundManager } from "./background-manager";
import type { ShadowName } from "../config/schema";
import type { AriseToolInfo, ToolContext } from "./types";

const BACKGROUND_SHADOWS: ShadowName[] = ["beru", "tank", "bellion"];

export function createBackgroundTaskTool(manager: BackgroundManager): AriseToolInfo {
  return {
    name: "arise_background",
    description: `Launch a shadow soldier as a background task for parallel execution.

Best for:
- beru: Parallel codebase exploration
- tank: Parallel external research
- bellion: Parallel planning/analysis

Returns a task_id immediately. Use arise_background_output to get results later.`,

    input: {
      type: "object",
      properties: {
        shadow: {
          type: "string",
          enum: BACKGROUND_SHADOWS,
          description: "Which shadow to run in background",
        },
        prompt: {
          type: "string",
          description: "The task for the shadow",
        },
        description: {
          type: "string",
          description: "Short description (3-5 words)",
        },
      },
      required: ["shadow", "prompt", "description"],
      additionalProperties: false,
    },

    async execute(rawInput, context: ToolContext) {
      const { shadow, prompt, description } = rawInput as {
        shadow: string;
        prompt: string;
        description: string;
      };

      try {
        const task = await manager.launch({
          shadow,
          prompt,
          description,
          parentSessionId: context.sessionID,
        });

        return {
          content: `[arise] Shadow ${shadow} launched in background.

Task ID: ${task.id}
Description: ${description}

Use arise_background_output("${task.id}") when you need the result.`,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: `[arise] Failed to launch background task: ${msg}` };
      }
    },
  };
}

export function createBackgroundOutputTool(manager: BackgroundManager): AriseToolInfo {
  return {
    name: "arise_background_output",
    description: `Get the output from a background shadow task.`,

    input: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "The task ID from arise_background",
        },
      },
      required: ["task_id"],
      additionalProperties: false,
    },

    async execute(rawInput) {
      const { task_id } = rawInput as { task_id: string };
      const task = manager.getTask(task_id);

      if (!task) {
        return { content: `[arise] Task not found: ${task_id}` };
      }

      const duration = task.completedAt
        ? Math.round((task.completedAt - task.startedAt) / 1000)
        : Math.round((Date.now() - task.startedAt) / 1000);

      if (task.status === "running") {
        return { content: `[arise] Task still running (${duration}s). Check again later.` };
      }

      if (task.status === "error") {
        return { content: `[arise] Task failed: ${task.error ?? "Unknown error"}` };
      }

      return {
        content: `[arise] ${task.shadow} completed (${duration}s):

${task.result ?? "(No output)"}`,
      };
    },
  };
}

export function createBackgroundStatusTool(manager: BackgroundManager): AriseToolInfo {
  return {
    name: "arise_background_status",
    description: "List all background tasks and their status.",

    input: {
      type: "object",
      properties: {
        current_session_only: {
          type: "boolean",
          description: "Only show tasks from current session",
        },
      },
      additionalProperties: false,
    },

    async execute(rawInput, context: ToolContext) {
      const { current_session_only } = rawInput as { current_session_only?: boolean };
      let tasks = manager.getAllTasks();

      if (current_session_only) {
        tasks = tasks.filter((t) => t.parentSessionId === context.sessionID);
      }

      if (tasks.length === 0) {
        return { content: "[arise] No background tasks." };
      }

      const lines = tasks.map((t) => {
        const duration = t.completedAt
          ? Math.round((t.completedAt - t.startedAt) / 1000)
          : Math.round((Date.now() - t.startedAt) / 1000);

        return `- ${t.id}: ${t.shadow} | ${t.status} | ${t.description} (${duration}s)`;
      });

      return { content: `[arise] Background tasks:\n${lines.join("\n")}` };
    },
  };
}

export function createBackgroundCancelTool(manager: BackgroundManager): AriseToolInfo {
  return {
    name: "arise_background_cancel",
    description: "Cancel a running background task.",

    input: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "The task ID to cancel",
        },
      },
      required: ["task_id"],
      additionalProperties: false,
    },

    async execute(rawInput) {
      const { task_id } = rawInput as { task_id: string };
      const success = await manager.cancelTask(task_id);

      if (success) {
        return { content: `[arise] Task ${task_id} cancelled.` };
      }
      return { content: `[arise] Could not cancel task (not found or already completed).` };
    },
  };
}
