import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type {
  PublishBatchJob,
  PublishBatchJobStatus,
  CreatePublishBatchJobPayload,
} from './publish-batch-job.types';

// ─── sql.js 类型 ───────────────────────────────────────────────────────────────

type SqlJsModule = {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
};

type SqlJsDatabase = {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
  export(): Uint8Array;
};

const SQLITE_FILENAME = 'publish-batch-jobs.sqlite';

/**
 * PublishBatchJobDb — 发布批次任务 SQLite 数据层
 *
 * 复用项目已有的 sql.js 依赖，在独立文件中维护 publish_batch_jobs 表。
 * 重启后从磁盘加载，保证数据持久化。
 */
export class PublishBatchJobDb {
  private db: SqlJsDatabase | null = null;
  private filePath = '';

  async init(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sqlJsFactory = require('sql.js/dist/sql-asm.js') as any;
    const SQL: SqlJsModule = sqlJsFactory.default
      ? await (sqlJsFactory.default as () => Promise<SqlJsModule>)()
      : await (sqlJsFactory as () => Promise<SqlJsModule>)();

    this.filePath = path.join(app.getPath('userData'), 'storage', SQLITE_FILENAME);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    const raw = fs.existsSync(this.filePath)
      ? new Uint8Array(fs.readFileSync(this.filePath))
      : undefined;

    this.db = new SQL.Database(raw);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS publish_batch_jobs (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        collect_batch_id INTEGER NOT NULL,
        shop_id          INTEGER NOT NULL,
        status           TEXT    NOT NULL DEFAULT 'NOT_STARTED',
        total_count      INTEGER NOT NULL DEFAULT 0,
        completed_count  INTEGER NOT NULL DEFAULT 0,
        failed_count     INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT    NOT NULL,
        updated_at       TEXT    NOT NULL
      )
    `);
    this.flush();
  }

  // ─── 写操作 ────────────────────────────────────────────────────────────────

  create(payload: CreatePublishBatchJobPayload): PublishBatchJob {
    const now = new Date().toISOString();
    this.db!.run(
      `INSERT INTO publish_batch_jobs
         (collect_batch_id, shop_id, status, total_count, completed_count, failed_count, created_at, updated_at)
       VALUES (?, ?, 'NOT_STARTED', ?, 0, 0, ?, ?)`,
      [payload.collectBatchId, payload.shopId, payload.totalCount, now, now],
    );
    const rows = this.db!.exec('SELECT last_insert_rowid()');
    const id = Number(rows[0]?.values?.[0]?.[0] ?? 0);
    this.flush();
    return this.getById(id)!;
  }

  update(id: number, fields: {
    status?: PublishBatchJobStatus;
    completedCount?: number;
    failedCount?: number;
  }): void {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (fields.status !== undefined)         { sets.push('status = ?');          params.push(fields.status); }
    if (fields.completedCount !== undefined) { sets.push('completed_count = ?');  params.push(fields.completedCount); }
    if (fields.failedCount !== undefined)    { sets.push('failed_count = ?');     params.push(fields.failedCount); }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    this.db!.run(`UPDATE publish_batch_jobs SET ${sets.join(', ')} WHERE id = ?`, params);
    this.flush();
  }

  // ─── 读操作 ────────────────────────────────────────────────────────────────

  getById(id: number): PublishBatchJob | null {
    const rows = this.db!.exec(
      `SELECT id, collect_batch_id, shop_id, status, total_count,
              completed_count, failed_count, created_at, updated_at
       FROM publish_batch_jobs WHERE id = ?`,
      [id],
    );
    const row = rows[0]?.values?.[0];
    return row ? this.rowToJob(row) : null;
  }

  list(): PublishBatchJob[] {
    const rows = this.db!.exec(
      `SELECT id, collect_batch_id, shop_id, status, total_count,
              completed_count, failed_count, created_at, updated_at
       FROM publish_batch_jobs ORDER BY id DESC`,
    );
    return (rows[0]?.values ?? []).map((row) => this.rowToJob(row));
  }

  // ─── 内部工具 ──────────────────────────────────────────────────────────────

  private rowToJob(row: unknown[]): PublishBatchJob {
    return {
      id:             Number(row[0]),
      collectBatchId: Number(row[1]),
      shopId:         Number(row[2]),
      status:         String(row[3]) as PublishBatchJobStatus,
      totalCount:     Number(row[4]),
      completedCount: Number(row[5]),
      failedCount:    Number(row[6]),
      createdAt:      String(row[7]),
      updatedAt:      String(row[8]),
    };
  }

  private flush(): void {
    fs.writeFileSync(this.filePath, Buffer.from(this.db!.export()));
  }
}
