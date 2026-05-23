import { app } from "electron";
import fs from "fs";
import path from "path";
import type { RobotMonitorShopLinkRecord } from "@eleapi/ai-operation/ai-operation.api";

type SqlJsModule = {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
};

type SqlJsDatabase = {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
  export(): Uint8Array;
};

const SQLITE_FILENAME = "robot-monitor-shop-links.sqlite";

export interface RobotMonitorShopMtopContextRecord {
  shopUrl: string;
  platformShopId: string;
  /** 产生此上下文的 monitor 任务 ID，用于 collect 任务精准反查 */
  taskId: string;
  jsv: string;
  appKey: string;
  ttid: string;
  cookie: string;
  userAgent: string;
  referer: string;
  createdAt?: string;
  updatedAt?: string;
}

export class RobotMonitorShopLinksDb {
  private db: SqlJsDatabase | null = null;
  private filePath = "";
  private initPromise: Promise<void> | null = null;

  async ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.init();
    }
    return this.initPromise;
  }

  private async init(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sqlJsFactory = require("sql.js/dist/sql-asm.js") as any;
    const SQL: SqlJsModule = sqlJsFactory.default
      ? await (sqlJsFactory.default as () => Promise<SqlJsModule>)()
      : await (sqlJsFactory as () => Promise<SqlJsModule>)();

    this.filePath = path.join(app.getPath("userData"), "storage", SQLITE_FILENAME);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    const raw = fs.existsSync(this.filePath)
      ? new Uint8Array(fs.readFileSync(this.filePath))
      : undefined;

    this.db = new SQL.Database(raw);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS robot_monitor_shop_links (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        robot_config_id   INTEGER NOT NULL,
        shop_url          TEXT    NOT NULL,
        status            TEXT    NOT NULL DEFAULT 'active',
        created_at        TEXT    NOT NULL,
        updated_at        TEXT    NOT NULL,
        UNIQUE(robot_config_id, shop_url)
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS robot_monitor_shop_mtop_context (
        shop_url          TEXT PRIMARY KEY,
        platform_shop_id  TEXT NOT NULL DEFAULT '',
        jsv               TEXT NOT NULL DEFAULT '',
        app_key           TEXT NOT NULL DEFAULT '',
        ttid              TEXT NOT NULL DEFAULT '',
        cookie            TEXT NOT NULL DEFAULT '',
        user_agent        TEXT NOT NULL DEFAULT '',
        referer           TEXT NOT NULL DEFAULT '',
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
      )
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_robot_monitor_shop_mtop_context_platform_shop
      ON robot_monitor_shop_mtop_context(platform_shop_id)
    `);
    // 迁移：为已有表添加 task_id 列（ADD COLUMN 在列已存在时会抛错，用 try 忽略）
    try {
      this.db.run(`ALTER TABLE robot_monitor_shop_mtop_context ADD COLUMN task_id TEXT NOT NULL DEFAULT ''`);
    } catch {
      // 列已存在，忽略
    }
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_robot_monitor_shop_mtop_context_task_id
      ON robot_monitor_shop_mtop_context(task_id)
    `);
    this.flush();
  }

  importLinks(robotConfigId: number, urls: string[]): { importedCount: number; skippedCount: number; totalCount: number; data: RobotMonitorShopLinkRecord[] } {
    const normalizedUrls = Array.from(new Set(urls.map((url) => String(url || "").trim()).filter(Boolean)));
    let importedCount = 0;
    let skippedCount = 0;
    const currentImportRecords: RobotMonitorShopLinkRecord[] = [];

    for (const url of normalizedUrls) {
      const now = new Date().toISOString();
      this.db!.run(
        `INSERT OR IGNORE INTO robot_monitor_shop_links
           (robot_config_id, shop_url, status, created_at, updated_at)
         VALUES (?, ?, 'active', ?, ?)`,
        [robotConfigId, url, now, now],
      );
      const changes = Number(this.db!.exec("SELECT changes()")[0]?.values?.[0]?.[0] || 0);
      if (changes > 0) {
        importedCount += 1;
      } else {
        skippedCount += 1;
      }
      const record = this.findByRobotAndUrl(robotConfigId, url);
      if (record) {
        currentImportRecords.push(record);
      }
    }

    this.flush();
    return {
      importedCount,
      skippedCount,
      totalCount: normalizedUrls.length,
      data: currentImportRecords,
    };
  }

  list(robotConfigId: number): RobotMonitorShopLinkRecord[] {
    const rows = this.db!.exec(
      `SELECT id, robot_config_id, shop_url, status, created_at, updated_at
       FROM robot_monitor_shop_links
       WHERE robot_config_id = ?
       ORDER BY id DESC`,
      [robotConfigId],
    );
    return (rows[0]?.values ?? []).map((row) => this.rowToRecord(row));
  }

  upsertMtopContext(record: RobotMonitorShopMtopContextRecord): void {
    const shopUrl = String(record.shopUrl || "").trim();
    if (!shopUrl || !record.appKey || !record.cookie) {
      return;
    }
    const now = new Date().toISOString();
    this.db!.run(
      `INSERT INTO robot_monitor_shop_mtop_context
        (shop_url, platform_shop_id, task_id, jsv, app_key, ttid, cookie, user_agent, referer, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(shop_url) DO UPDATE SET
        platform_shop_id = excluded.platform_shop_id,
        task_id          = excluded.task_id,
        jsv              = excluded.jsv,
        app_key          = excluded.app_key,
        ttid             = excluded.ttid,
        cookie           = excluded.cookie,
        user_agent       = excluded.user_agent,
        referer          = excluded.referer,
        updated_at       = excluded.updated_at`,
      [
        shopUrl,
        record.platformShopId || "",
        record.taskId || "",
        record.jsv || "",
        record.appKey || "",
        record.ttid || "",
        record.cookie || "",
        record.userAgent || "",
        record.referer || "",
        record.createdAt || now,
        now,
      ],
    );
    this.flush();
  }

  /**
   * 查询 mtop 上下文，优先级：taskId > shopUrl/platformShopId > 最新一条兜底
   */
  findMtopContext(options: { taskId?: string; shopUrl?: string; platformShopId?: string }): RobotMonitorShopMtopContextRecord | null {
    const taskId = String(options.taskId || "").trim();
    const shopUrl = String(options.shopUrl || "").trim();
    const platformShopId = String(options.platformShopId || "").trim();

    // 1. 优先按 taskId 精准匹配
    if (taskId) {
      const rows = this.db!.exec(
        `SELECT shop_url, platform_shop_id, task_id, jsv, app_key, ttid, cookie, user_agent, referer, created_at, updated_at
         FROM robot_monitor_shop_mtop_context
         WHERE task_id = ?
         LIMIT 1`,
        [taskId],
      );
      const row = rows[0]?.values?.[0];
      if (row) return this.mtopContextRowToRecord(row);
    }

    // 2. 按 shopUrl / platformShopId 匹配
    if (shopUrl || platformShopId) {
      const where: string[] = [];
      const params: unknown[] = [];
      if (shopUrl) {
        where.push("shop_url = ?");
        params.push(shopUrl);
      }
      if (platformShopId) {
        where.push("platform_shop_id = ?");
        params.push(platformShopId);
      }
      const rows = this.db!.exec(
        `SELECT shop_url, platform_shop_id, task_id, jsv, app_key, ttid, cookie, user_agent, referer, created_at, updated_at
         FROM robot_monitor_shop_mtop_context
         WHERE ${where.join(" OR ")}
         ORDER BY CASE WHEN shop_url = ? THEN 0 ELSE 1 END, updated_at DESC
         LIMIT 1`,
        [...params, shopUrl],
      );
      const row = rows[0]?.values?.[0];
      if (row) return this.mtopContextRowToRecord(row);
    }

    // 3. 兜底：返回最近一条（payload 不含店铺信息时的保底）
    const rows = this.db!.exec(
      `SELECT shop_url, platform_shop_id, task_id, jsv, app_key, ttid, cookie, user_agent, referer, created_at, updated_at
       FROM robot_monitor_shop_mtop_context
       ORDER BY updated_at DESC
       LIMIT 1`,
    );
    const row = rows[0]?.values?.[0];
    return row ? this.mtopContextRowToRecord(row) : null;
  }

  private findByRobotAndUrl(robotConfigId: number, shopUrl: string): RobotMonitorShopLinkRecord | null {
    const rows = this.db!.exec(
      `SELECT id, robot_config_id, shop_url, status, created_at, updated_at
       FROM robot_monitor_shop_links
       WHERE robot_config_id = ? AND shop_url = ?
       LIMIT 1`,
      [robotConfigId, shopUrl],
    );
    const row = rows[0]?.values?.[0];
    return row ? this.rowToRecord(row) : null;
  }

  private rowToRecord(row: unknown[]): RobotMonitorShopLinkRecord {
    return {
      id: Number(row[0]),
      robotConfigId: Number(row[1]),
      shopUrl: String(row[2]),
      status: String(row[3]),
      createdAt: String(row[4]),
      updatedAt: String(row[5]),
    };
  }

  private mtopContextRowToRecord(row: unknown[]): RobotMonitorShopMtopContextRecord {
    return {
      shopUrl: String(row[0] || ""),
      platformShopId: String(row[1] || ""),
      taskId: String(row[2] || ""),
      jsv: String(row[3] || ""),
      appKey: String(row[4] || ""),
      ttid: String(row[5] || ""),
      cookie: String(row[6] || ""),
      userAgent: String(row[7] || ""),
      referer: String(row[8] || ""),
      createdAt: String(row[9] || ""),
      updatedAt: String(row[10] || ""),
    };
  }

  private flush(): void {
    fs.writeFileSync(this.filePath, Buffer.from(this.db!.export()));
  }
}

export const robotMonitorShopLinksDb = new RobotMonitorShopLinksDb();
