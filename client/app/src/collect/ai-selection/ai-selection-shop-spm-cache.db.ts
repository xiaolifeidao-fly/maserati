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

const SQLITE_FILENAME = 'ai-selection-shop-spm-cache.sqlite';

export interface AiSelectionShopSpmCacheRecord {
  platform: string;
  platformShopId: string;
  shopUrl: string;
  spmPrefix: string;
  diagnostics?: unknown;
  createdAt?: string;
  updatedAt?: string;
}

export class AiSelectionShopSpmCacheDb {
  private db: SqlJsDatabase | null = null;
  private filePath = '';
  private initPromise: Promise<void> | null = null;

  async ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.init();
    }
    return this.initPromise;
  }

  upsert(record: AiSelectionShopSpmCacheRecord): void {
    const now = new Date().toISOString();
    this.db!.run(
      `INSERT INTO ai_selection_shop_spm_cache
        (platform, platform_shop_id, shop_url, spm_prefix, diagnostics_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(platform, platform_shop_id) DO UPDATE SET
        shop_url = excluded.shop_url,
        spm_prefix = excluded.spm_prefix,
        diagnostics_json = excluded.diagnostics_json,
        updated_at = excluded.updated_at`,
      [
        record.platform,
        record.platformShopId,
        record.shopUrl,
        record.spmPrefix,
        JSON.stringify(record.diagnostics || null),
        record.createdAt || now,
        now,
      ],
    );
    this.flush();
  }

  findBest(options: { platform: string; platformShopId?: string; shopUrl?: string }): AiSelectionShopSpmCacheRecord | null {
    const platform = String(options.platform || '').trim();
    const platformShopId = String(options.platformShopId || '').trim();
    const shopUrl = String(options.shopUrl || '').trim();
    if (!platform || (!platformShopId && !shopUrl)) {
      return null;
    }

    const where: string[] = ['platform = ?'];
    const params: unknown[] = [platform];
    if (platformShopId) {
      where.push('platform_shop_id = ?');
      params.push(platformShopId);
    } else {
      where.push('shop_url = ?');
      params.push(shopUrl);
    }

    const rows = this.db!.exec(
      `SELECT platform, platform_shop_id, shop_url, spm_prefix, diagnostics_json, created_at, updated_at
       FROM ai_selection_shop_spm_cache
       WHERE ${where.join(' AND ')}
       ORDER BY updated_at DESC
       LIMIT 1`,
      params,
    );
    const row = rows[0]?.values?.[0];
    return row ? this.rowToRecord(row) : null;
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
      CREATE TABLE IF NOT EXISTS ai_selection_shop_spm_cache (
        platform          TEXT NOT NULL,
        platform_shop_id  TEXT NOT NULL,
        shop_url          TEXT NOT NULL DEFAULT '',
        spm_prefix        TEXT NOT NULL DEFAULT '',
        diagnostics_json  TEXT NOT NULL DEFAULT 'null',
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        PRIMARY KEY(platform, platform_shop_id)
      )
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_ai_selection_shop_spm_cache_shop_url
      ON ai_selection_shop_spm_cache(platform, shop_url)
    `);
    this.flush();
  }

  private rowToRecord(row: unknown[]): AiSelectionShopSpmCacheRecord {
    let diagnostics: unknown = null;
    try {
      diagnostics = JSON.parse(String(row[4] || 'null'));
    } catch {
      diagnostics = null;
    }
    return {
      platform: String(row[0] || ''),
      platformShopId: String(row[1] || ''),
      shopUrl: String(row[2] || ''),
      spmPrefix: String(row[3] || ''),
      diagnostics,
      createdAt: String(row[5] || ''),
      updatedAt: String(row[6] || ''),
    };
  }

  private flush(): void {
    fs.writeFileSync(this.filePath, Buffer.from(this.db!.export()));
  }
}

export const aiSelectionShopSpmCacheDb = new AiSelectionShopSpmCacheDb();
