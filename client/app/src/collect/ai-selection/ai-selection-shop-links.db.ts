import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { AiSelectionShopLinkRecord } from '@eleapi/collect/collect.api';

type SqlJsModule = {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
};

type SqlJsDatabase = {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
  export(): Uint8Array;
};

const SQLITE_FILENAME = 'ai-selection-shop-links.sqlite';

export class AiSelectionShopLinksDb {
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
      CREATE TABLE IF NOT EXISTS ai_selection_shop_links (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        collect_batch_id  INTEGER NOT NULL,
        strategy_id       INTEGER NOT NULL,
        shop_url          TEXT    NOT NULL,
        status            TEXT    NOT NULL DEFAULT 'PENDING',
        created_at        TEXT    NOT NULL,
        updated_at        TEXT    NOT NULL,
        UNIQUE(collect_batch_id, strategy_id, shop_url)
      )
    `);
    this.flush();
  }

  importLinks(batchId: number, strategyId: number, urls: string[]): { importedCount: number; skippedCount: number; totalCount: number; data: AiSelectionShopLinkRecord[] } {
    const normalizedUrls = Array.from(new Set(urls.map((url) => String(url || '').trim()).filter(Boolean)));
    let importedCount = 0;
    let skippedCount = 0;

    for (const url of normalizedUrls) {
      const now = new Date().toISOString();
      this.db!.run(
        `INSERT OR IGNORE INTO ai_selection_shop_links
           (collect_batch_id, strategy_id, shop_url, status, created_at, updated_at)
         VALUES (?, ?, ?, 'PENDING', ?, ?)`,
        [batchId, strategyId, url, now, now],
      );
      const changes = Number(this.db!.exec('SELECT changes()')[0]?.values?.[0]?.[0] || 0);
      if (changes > 0) {
        importedCount += 1;
      } else {
        skippedCount += 1;
      }
    }

    this.flush();
    return {
      importedCount,
      skippedCount,
      totalCount: normalizedUrls.length,
      data: this.list(batchId, strategyId),
    };
  }

  list(batchId: number, strategyId: number): AiSelectionShopLinkRecord[] {
    const rows = this.db!.exec(
      `SELECT id, collect_batch_id, strategy_id, shop_url, status, created_at, updated_at
       FROM ai_selection_shop_links
       WHERE collect_batch_id = ? AND strategy_id = ?
       ORDER BY id DESC`,
      [batchId, strategyId],
    );
    return (rows[0]?.values ?? []).map((row) => this.rowToRecord(row));
  }

  updateStatus(id: number, status: string): void {
    this.db!.run(
      `UPDATE ai_selection_shop_links SET status = ?, updated_at = ? WHERE id = ?`,
      [status, new Date().toISOString(), id],
    );
    this.flush();
  }

  private rowToRecord(row: unknown[]): AiSelectionShopLinkRecord {
    return {
      id: Number(row[0]),
      collectBatchId: Number(row[1]),
      strategyId: Number(row[2]),
      shopUrl: String(row[3]),
      status: String(row[4]),
      createdAt: String(row[5]),
      updatedAt: String(row[6]),
    };
  }

  private flush(): void {
    fs.writeFileSync(this.filePath, Buffer.from(this.db!.export()));
  }
}

export const aiSelectionShopLinksDb = new AiSelectionShopLinksDb();
