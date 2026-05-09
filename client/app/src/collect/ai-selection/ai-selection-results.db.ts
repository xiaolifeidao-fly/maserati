import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type {
  AiSelectionShopProductListQuery,
  AiSelectionShopProductRecord,
  PageResult,
} from '@eleapi/collect/collect.api';

type SqlJsModule = {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
};

type SqlJsDatabase = {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
  export(): Uint8Array;
};

const SQLITE_FILENAME = 'ai-selection-results.sqlite';

export class AiSelectionResultsDb {
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
      CREATE TABLE IF NOT EXISTS ai_selection_results (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        collect_batch_id  INTEGER NOT NULL,
        strategy_id       INTEGER NOT NULL,
        platform          TEXT    NOT NULL,
        platform_shop_id  TEXT    NOT NULL,
        shop_url          TEXT    NOT NULL,
        item_id           TEXT    NOT NULL,
        title             TEXT    NOT NULL,
        price             TEXT    NOT NULL DEFAULT '',
        vague_sold365     TEXT    NOT NULL DEFAULT '',
        image             TEXT    NOT NULL DEFAULT '',
        item_url          TEXT    NOT NULL DEFAULT '',
        sku_json          TEXT    NOT NULL DEFAULT '[]',
        created_at        TEXT    NOT NULL,
        updated_at        TEXT    NOT NULL,
        UNIQUE(collect_batch_id, strategy_id, platform_shop_id, item_id)
      )
    `);
    this.flush();
  }

  upsertMany(records: AiSelectionShopProductRecord[]): number {
    let insertedCount = 0;
    for (const record of records) {
      const now = new Date().toISOString();
      this.db!.run(
        `INSERT OR IGNORE INTO ai_selection_results
          (collect_batch_id, strategy_id, platform, platform_shop_id, shop_url, item_id, title, price, vague_sold365, image, item_url, sku_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.collectBatchId,
          record.strategyId,
          record.platform,
          record.platformShopId,
          record.shopUrl,
          record.itemId,
          record.title,
          record.price,
          record.vagueSold365,
          record.image,
          record.itemUrl,
          JSON.stringify(record.skuInfoList || []),
          record.createdAt || now,
          now,
        ],
      );
      const changes = Number(this.db!.exec('SELECT changes()')[0]?.values?.[0]?.[0] || 0);
      insertedCount += changes > 0 ? 1 : 0;
    }
    this.flush();
    return insertedCount;
  }

  list(query: AiSelectionShopProductListQuery): PageResult<AiSelectionShopProductRecord> {
    const pageIndex = Math.max(1, Number(query.pageIndex || 1));
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize || 20)));
    const where: string[] = ['1 = 1'];
    const params: unknown[] = [];
    if (Number(query.batchId || 0) > 0) {
      where.push('collect_batch_id = ?');
      params.push(Number(query.batchId));
    }
    if (Number(query.strategyId || 0) > 0) {
      where.push('strategy_id = ?');
      params.push(Number(query.strategyId));
    }
    if (String(query.platformShopId || '').trim()) {
      where.push('platform_shop_id = ?');
      params.push(String(query.platformShopId).trim());
    }
    if (String(query.itemId || '').trim()) {
      where.push('item_id = ?');
      params.push(String(query.itemId).trim());
    }
    const whereSql = where.join(' AND ');
    const total = Number(this.db!.exec(`SELECT COUNT(1) FROM ai_selection_results WHERE ${whereSql}`, params)[0]?.values?.[0]?.[0] || 0);
    const rows = this.db!.exec(
      `SELECT id, collect_batch_id, strategy_id, platform, platform_shop_id, shop_url, item_id, title, price, vague_sold365, image, item_url, sku_json, created_at, updated_at
       FROM ai_selection_results
       WHERE ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (pageIndex - 1) * pageSize],
    );
    return {
      total,
      data: (rows[0]?.values ?? []).map((row) => this.rowToRecord(row)),
    };
  }

  delete(id: number): boolean {
    this.db!.run('DELETE FROM ai_selection_results WHERE id = ?', [id]);
    const changed = Number(this.db!.exec('SELECT changes()')[0]?.values?.[0]?.[0] || 0) > 0;
    this.flush();
    return changed;
  }

  private rowToRecord(row: unknown[]): AiSelectionShopProductRecord {
    let skuInfoList = [];
    try {
      skuInfoList = JSON.parse(String(row[12] || '[]'));
    } catch {
      skuInfoList = [];
    }
    return {
      id: Number(row[0]),
      collectBatchId: Number(row[1]),
      strategyId: Number(row[2]),
      platform: String(row[3]),
      platformShopId: String(row[4]),
      shopUrl: String(row[5]),
      itemId: String(row[6]),
      title: String(row[7]),
      price: String(row[8]),
      vagueSold365: String(row[9]),
      image: String(row[10]),
      itemUrl: String(row[11]),
      skuInfoList,
      createdAt: String(row[13]),
      updatedAt: String(row[14]),
    };
  }

  private flush(): void {
    fs.writeFileSync(this.filePath, Buffer.from(this.db!.export()));
  }
}

export const aiSelectionResultsDb = new AiSelectionResultsDb();
