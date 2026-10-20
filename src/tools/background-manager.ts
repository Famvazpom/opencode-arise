import { extractLastAssistantText } from "./session-output";
import type { AriseContext } from "./types";

export interface BackgroundTask {
  id: string;
  sessionId: string;
  parentSessionId: string;
  shadow: string;
  description: string;
  status: "running" | "completed" | "error";
  startedAt: number;
  completedAt?: number;
  result?: string;
  error?: string;
}

export class BackgroundManager {
  private tasks: Map<string, BackgroundTask> = new Map();

  constructor(private readonly ctx: AriseContext) {}

  generateTaskId(): string {
    return `arise_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  async launch(opts: {
    shadow: string;
    prompt: string;
    description: string;
    parentSessionId: string;
  }): Promise<BackgroundTask> {
    const taskId = this.generateTaskId();

    const session = await this.ctx.session.create({
      title: `[arise:${taskId}] ${opts.description}`,
      agent: opts.shadow,
    });

    const task: BackgroundTask = {
      id: taskId,
      sessionId: session.id,
      parentSessionId: opts.parentSessionId,
      shadow: opts.shadow,
      description: opts.description,
      status: "running",
      startedAt: Date.now(),
    };

    this.tasks.set(taskId, task);

    void this.run(task, opts.prompt);
    return task;
  }

  private async run(task: BackgroundTask, prompt: string): Promise<void> {
    try {
      await this.ctx.session.prompt({ sessionID: task.sessionId, text: prompt });
      // V2 replaced session.status polling with a blocking wait.
      await this.ctx.session.wait({ sessionID: task.sessionId });

      const messages = await this.ctx.session.context({ sessionID: task.sessionId });
      task.result = extractLastAssistantText(messages) || "(No response)";
      task.status = "completed";
      task.completedAt = Date.now();
      this.notifyParent(task);
    } catch (err) {
      task.status = "error";
      task.error = err instanceof Error ? err.message : String(err);
      task.completedAt = Date.now();
    }
  }

  private notifyParent(task: BackgroundTask): void {
    const duration = task.completedAt
      ? Math.round((task.completedAt - task.startedAt) / 1000)
      : 0;

    // V2 server plugins cannot show TUI toasts; log so the completion is observable.
    console.log(
      `[opencode-arise] ${task.shadow} finished: ${task.description} (${duration}s)`,
    );
  }

  getTask(taskId: string): BackgroundTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values());
  }

  getTasksForSession(sessionId: string): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.parentSessionId === sessionId,
    );
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "running") return false;

    try {
      await this.ctx.session.interrupt({ sessionID: task.sessionId });
    } catch {
      // Ignore interrupt errors
    }

    task.status = "error";
    task.error = "Cancelled";
    task.completedAt = Date.now();
    return true;
  }
}
