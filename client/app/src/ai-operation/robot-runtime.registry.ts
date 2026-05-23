import type { AiOperationWorkerType, LocalRobotRuntimeState, RobotRunRecord } from "@eleapi/ai-operation/ai-operation.api";

class RobotRuntimeRegistry {
  private readonly runs = new Map<string, LocalRobotRuntimeState>();

  upsert(run: RobotRunRecord): LocalRobotRuntimeState {
    const previous = this.runs.get(run.runId);
    const next: LocalRobotRuntimeState = {
      runId: run.runId,
      robotConfigId: run.robotConfigId,
      status: run.status,
      queueNamespace: run.queueNamespace,
      workerLocks: previous?.workerLocks ?? {},
      updatedAt: new Date().toISOString(),
    };
    this.runs.set(run.runId, next);
    return next;
  }

  markStopped(run: RobotRunRecord): void {
    const next = this.upsert(run);
    next.workerLocks = {};
    this.runs.set(run.runId, next);
  }

  updateStatus(runId: string, status: string): void {
    const previous = this.runs.get(runId);
    if (!previous) return;
    this.runs.set(runId, {
      ...previous,
      status,
      updatedAt: new Date().toISOString(),
    });
  }

  acquireWorker(runId: string, workerType: AiOperationWorkerType, leaseId: string): boolean {
    const previous = this.runs.get(runId);
    if (!previous || previous.workerLocks[workerType]) {
      return false;
    }
    this.runs.set(runId, {
      ...previous,
      workerLocks: {
        ...previous.workerLocks,
        [workerType]: leaseId,
      },
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  releaseWorker(runId: string, workerType: AiOperationWorkerType, leaseId?: string): void {
    const previous = this.runs.get(runId);
    if (!previous) return;
    if (leaseId && previous.workerLocks[workerType] !== leaseId) {
      return;
    }
    const workerLocks = { ...previous.workerLocks };
    delete workerLocks[workerType];
    this.runs.set(runId, {
      ...previous,
      workerLocks,
      updatedAt: new Date().toISOString(),
    });
  }

  list(): LocalRobotRuntimeState[] {
    return Array.from(this.runs.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(runId: string): LocalRobotRuntimeState | null {
    const run = this.runs.get(runId);
    return run ? { ...run, workerLocks: { ...run.workerLocks } } : null;
  }

  getByRobotConfigId(robotConfigId: number): LocalRobotRuntimeState | null {
    const runs = this.list().filter((run) => run.robotConfigId === robotConfigId);
    return runs[0] ? { ...runs[0], workerLocks: { ...runs[0].workerLocks } } : null;
  }

  getWorkerLocks(runId: string): Record<string, string> {
    return { ...this.runs.get(runId)?.workerLocks ?? {} };
  }
}

export const robotRuntimeRegistry = new RobotRuntimeRegistry();
