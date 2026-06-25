import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { TaobaoFreightTemplateOption } from '../types/publish-task';

type SqlJsModule = {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
};

type SqlJsDatabase = {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
  export(): Uint8Array;
};

export interface FreightTemplateCacheRecord {
  shopId: number;
  templates: TaobaoFreightTemplateOption[];
  templateCount: number;
  updatedAt: string;
}

const SQLITE_FILENAME = 'publish-freight-template-cache.sqlite';

export class FreightTemplateCacheDb {
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
      CREATE TABLE IF NOT EXISTS publish_freight_template_cache (
        shop_id        INTEGER PRIMARY KEY,
        templates_json TEXT    NOT NULL,
        template_count INTEGER NOT NULL DEFAULT 0,
        updated_at     TEXT    NOT NULL
      )
    `);
    this.flush();
  }

  get(shopId: number): FreightTemplateCacheRecord | null {
    const rows = this.db!.exec(
      `SELECT shop_id, templates_json, template_count, updated_at
       FROM publish_freight_template_cache WHERE shop_id = ?`,
      [shopId],
    );
    const row = rows[0]?.values?.[0];
    return row ? this.rowToRecord(row) : null;
  }

  upsert(shopId: number, templates: TaobaoFreightTemplateOption[]): FreightTemplateCacheRecord {
    const now = new Date().toISOString();
    const normalizedTemplates = templates
      .map(template => ({
        templateId: String(template.templateId ?? '').trim(),
        name: String(template.name ?? '').trim(),
      }))
      .filter(template => template.templateId !== '');

    this.db!.run(
      `INSERT OR REPLACE INTO publish_freight_template_cache
         (shop_id, templates_json, template_count, updated_at)
       VALUES (?, ?, ?, ?)`,
      [shopId, JSON.stringify(normalizedTemplates), normalizedTemplates.length, now],
    );
    this.flush();
    return {
      shopId,
      templates: normalizedTemplates,
      templateCount: normalizedTemplates.length,
      updatedAt: now,
    };
  }

  private rowToRecord(row: unknown[]): FreightTemplateCacheRecord {
    let templates: TaobaoFreightTemplateOption[] = [];
    try {
      const parsed = JSON.parse(String(row[1] || '[]')) as TaobaoFreightTemplateOption[];
      templates = Array.isArray(parsed)
        ? parsed
          .map(template => ({
            templateId: String(template.templateId ?? '').trim(),
            name: String(template.name ?? '').trim(),
          }))
          .filter(template => template.templateId !== '')
        : [];
    } catch {
      templates = [];
    }

    return {
      shopId: Number(row[0]),
      templates,
      templateCount: Number(row[2] ?? templates.length),
      updatedAt: String(row[3] ?? ''),
    };
  }

  private flush(): void {
    fs.writeFileSync(this.filePath, Buffer.from(this.db!.export()));
  }
}

export const freightTemplateCacheDb = new FreightTemplateCacheDb();
