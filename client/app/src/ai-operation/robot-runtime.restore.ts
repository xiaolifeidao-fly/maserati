import log from "electron-log";
import type { PageResult, RobotRunRecord } from "@eleapi/ai-operation/ai-operation.api";
import { robotRuntimeRegistry } from "@src/ai-operation/robot-runtime.registry";
import { robotRunOverviewCacheDb } from "@src/ai-operation/robot-run-overview-cache.db";
import { robotTaskRuntime } from "@src/ai-operation/robot-task-runtime";
import { requestBackend } from "@src/impl/shared/backend";

const RESTORE_PAGE_SIZE = 200;

/**
 * 新实例启动时，将服务端所有残留的 running run 全部停止。
 * 不再自动续跑旧实例的任务，避免多实例并发或重启后意外接管旧队列数据。
 */
export async function restoreActiveRobotTaskRuntimes(): Promise<void> {
  robotTaskRuntime.configure(requestBackend);

  const result = await requestBackend<PageResult<RobotRunRecord>>("GET", "/ai-operation/runs", {
    params: {
      pageIndex: 1,
      pageSize: RESTORE_PAGE_SIZE,
      status: "running",
    },
  });

  const runs = Array.isArray(result.data) ? result.data : [];
  let stoppedCount = 0;

  for (const run of runs) {
    if (!run.runId || run.status !== "running") {
      continue;
    }
    try {
      const stopped = await requestBackend<RobotRunRecord>("POST", `/ai-operation/runs/${run.runId}/stop`, {
        data: { reason: "new_instance_started" },
      });
      robotRuntimeRegistry.markStopped(stopped);
      await robotRunOverviewCacheDb.mergeRun(stopped);
      stoppedCount++;
      log.info("[ai-operation] stopped stale run from previous instance", { runId: run.runId });
    } catch (error) {
      log.warn("[ai-operation] failed to stop stale run", {
        runId: run.runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  log.info("[ai-operation] cleared stale robot runs on startup", { total: runs.length, stopped: stoppedCount });
}

export function restoreActiveRobotTaskRuntimesInBackground(): void {
  restoreActiveRobotTaskRuntimes().catch((error) => {
    log.warn("[ai-operation] failed to restore active robot task runtimes", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
