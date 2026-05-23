import { app } from "electron";
import fs from "fs";
import path from "path";
import {
  RobotRunRecord,
  type AiOperationWorkerType,
  type RunDetailResult,
  type RunStageStats,
} from "@eleapi/ai-operation/ai-operation.api";

type SqlJsModule = {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
};

type SqlJsDatabase = {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
  export(): Uint8Array;
};

const SQLITE_FILENAME = "ai-operation-overview-cache.sqlite";

class RobotRunOverviewCacheDb {
  private db: SqlJsDatabase | null = null;
  private filePath = "";
  private initPromise: Promise<void> | null = null;

  ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.init();
    }
    return this.initPromise;
  }

  async get(runId: string): Promise<RunDetailResult | null> {
    await this.ensureInit();
    const rows = this.db!.exec(
      `SELECT detail_json, updated_at FROM ai_operation_run_overview_cache WHERE run_id = ?`,
      [runId],
    );
    const row = rows[0]?.values?.[0];
    if (!row) {
      return null;
    }
    try {
      const detail = JSON.parse(String(row[0] || "")) as RunDetailResult;
      return {
        ...detail,
        cacheUpdatedAt: String(row[1] || ""),
        source: "cache",
      };
    } catch {
      return null;
    }
  }

  async upsertServerDetail(detail: RunDetailResult): Promise<RunDetailResult> {
    await this.ensureInit();
    const normalized = normalizeDetail(detail, "server");
    this.upsert(normalized);
    return normalized;
  }

  async mergeRun(run: RobotRunRecord): Promise<void> {
    if (!run.runId) {
      return;
    }
    await this.ensureInit();
    const previous = await this.get(run.runId);
    const next = normalizeDetail({
      ...previous,
      run: {
        ...(previous?.run || {}),
        ...run,
      },
      queueDepths: previous?.queueDepths,
      collect: previous?.collect,
      publish: previous?.publish,
    } as RunDetailResult, "cache");
    this.upsert(next);
  }

  async markWorkerLease(runId: string, activeLeases: number): Promise<void> {
    await this.ensureInit();
    const previous = await this.get(runId);
    if (!previous) {
      return;
    }
    const next = normalizeDetail({
      ...previous,
      queueDepths: previous.queueDepths
        ? { ...previous.queueDepths, activeLeases }
        : undefined,
    }, "cache");
    this.upsert(next);
  }

  async recordTaskOutcome(
    taskId: string,
    runId: string,
    workerType: AiOperationWorkerType,
    success: boolean,
  ): Promise<void> {
    if (!taskId || !runId || (workerType !== "collect" && workerType !== "publish")) {
      return;
    }
    await this.ensureInit();
    const applied = this.db!.exec(
      `SELECT 1 FROM ai_operation_run_overview_events WHERE task_id = ? AND outcome = ?`,
      [taskId, success ? "success" : "failed"],
    );
    if (applied[0]?.values?.length) {
      return;
    }

    this.db!.run(
      `INSERT INTO ai_operation_run_overview_events (task_id, run_id, worker_type, outcome, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [taskId, runId, workerType, success ? "success" : "failed", new Date().toISOString()],
    );

    const previous = await this.get(runId);
    if (!previous) {
      this.flush();
      return;
    }
    const stageKey = workerType === "collect" ? "collect" : "publish";
    const stage = bumpStage(previous[stageKey], success);
    const run = { ...previous.run };
    if (workerType === "collect" && success) {
      run.collectedCount = Number(run.collectedCount || 0) + 1;
      run.lastCollectAt = new Date().toISOString();
    }
    if (workerType === "publish" && success) {
      run.publishedCount = Number(run.publishedCount || 0) + 1;
      run.lastPublishAt = new Date().toISOString();
    }
    const next = normalizeDetail({ ...previous, run, [stageKey]: stage }, "cache");
    this.upsert(next);
  }

  private async init(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sqlJsFactory = require("sql.js/dist/sql-asm.js") as unknown;
    const factory = sqlJsFactory as { default?: () => Promise<SqlJsModule> } | (() => Promise<SqlJsModule>);
    const SQL: SqlJsModule = typeof factory === "function"
      ? await factory()
      : await factory.default!();

    this.filePath = path.join(app.getPath("userData"), "storage", SQLITE_FILENAME);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const raw = fs.existsSync(this.filePath)
      ? new Uint8Array(fs.readFileSync(this.filePath))
      : undefined;

    this.db = new SQL.Database(raw);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS ai_operation_run_overview_cache (
        run_id      TEXT PRIMARY KEY,
        detail_json TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS ai_operation_run_overview_events (
        task_id     TEXT NOT NULL,
        run_id      TEXT NOT NULL,
        worker_type TEXT NOT NULL,
        outcome     TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        PRIMARY KEY (task_id, outcome)
      )
    `);
    this.flush();
  }

  private upsert(detail: RunDetailResult): void {
    const now = new Date().toISOString();
    const storable = {
      ...detail,
      cacheUpdatedAt: now,
      source: detail.source || "cache",
    };
    this.db!.run(
      `INSERT INTO ai_operation_run_overview_cache (run_id, detail_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET detail_json = excluded.detail_json, updated_at = excluded.updated_at`,
      [storable.run.runId, JSON.stringify(storable), now],
    );
    this.flush();
  }

  private flush(): void {
    fs.writeFileSync(this.filePath, Buffer.from(this.db!.export()));
  }
}

function normalizeDetail(detail: RunDetailResult, source: "server" | "cache"): RunDetailResult {
  const run = detail.run || new RobotRunRecord();
  return {
    ...detail,
    run,
    collect: detail.collect || { success: Number(run.collectedCount || 0), failed: 0 },
    publish: detail.publish || { success: Number(run.publishedCount || 0), failed: 0 },
    cacheUpdatedAt: new Date().toISOString(),
    source,
  };
}

function bumpStage(stage: RunStageStats | undefined, success: boolean): RunStageStats {
  return {
    success: Number(stage?.success || 0) + (success ? 1 : 0),
    failed: Number(stage?.failed || 0) + (success ? 0 : 1),
  };
}

export const robotRunOverviewCacheDb = new RobotRunOverviewCacheDb();
