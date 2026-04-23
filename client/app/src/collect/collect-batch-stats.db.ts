import { app } from 'electron';
import fs from 'fs';
import path from 'path';

type SqlJsModule = {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
};

type SqlJsDatabase = {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
  export(): Uint8Array;
};

export interface CollectBatchStats {
  batchId: number;
  totalCollectCount: number;
  totalFavoriteCount: number;
  updatedAt: string;
}

const SQLITE_FILENAME = 'collect-batch-stats.sqlite';

export class CollectBatchStatsDb {
  private db: SqlJsDatabase | null = null;
  private filePath = '';
  private initPromise: Promise<void> | null = null;

  async ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.init();
    }
    return this.initPromise;
  }

  private async init(): Promise<void> {
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
      CREATE TABLE IF NOT EXISTS collect_batch_stats (
        batch_id               INTEGER PRIMARY KEY,
        total_collect_count    INTEGER NOT NULL DEFAULT 0,
        total_favorite_count   INTEGER NOT NULL DEFAULT 0,
        updated_at             TEXT    NOT NULL
      )
    `);
    this.flush();
  }

  get(batchId: number): CollectBatchStats | null {
    const rows = this.db!.exec(
      `SELECT batch_id, total_collect_count, total_favorite_count, updated_at
       FROM collect_batch_stats WHERE batch_id = ?`,
      [batchId],
    );
    const row = rows[0]?.values?.[0];
    return row ? this.rowToStats(row) : null;
  }

  upsert(batchId: number, totalCollectCount: number, totalFavoriteCount: number): void {
    const now = new Date().toISOString();
    this.db!.run(
      `INSERT OR REPLACE INTO collect_batch_stats
         (batch_id, total_collect_count, total_favorite_count, updated_at)
       VALUES (?, ?, ?, ?)`,
      [batchId, totalCollectCount, totalFavoriteCount, now],
    );
    this.flush();
  }

  increment(batchId: number, delta: { collectCount?: number; favoriteCount?: number }): void {
    const stats = this.get(batchId);
    if (!stats) return;
    this.upsert(
      batchId,
      Math.max(0, stats.totalCollectCount + (delta.collectCount ?? 0)),
      Math.max(0, stats.totalFavoriteCount + (delta.favoriteCount ?? 0)),
    );
  }

  private rowToStats(row: unknown[]): CollectBatchStats {
    return {
      batchId: Number(row[0]),
      totalCollectCount: Number(row[1]),
      totalFavoriteCount: Number(row[2]),
      updatedAt: String(row[3]),
    };
  }

  private flush(): void {
    fs.writeFileSync(this.filePath, Buffer.from(this.db!.export()));
  }
}

export const collectBatchStatsDb = new CollectBatchStatsDb();
