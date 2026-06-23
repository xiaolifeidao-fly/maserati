import fs from 'fs';
import path from 'path';
import { app, dialog, shell } from 'electron';
import AdmZip from 'adm-zip';

const KEEP_DAYS = 7;
const MAX_TEXT_LENGTH = 120000;

function isEnabled(): boolean {
  const raw = String(process.env.PUBLISH_LOG_ENABLED ?? 'true').trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off' && raw !== 'no';
}

class PublishLogWriter {
  private initialized = false;
  private baseDir = '';
  private currentDate = '';
  private currentDir = '';
  private cleanupStarted = false;
  private readonly taskProductMap = new Map<number, string>();
  private readonly taskFileIndex = new Map<number, string>();

  private get taskIndexPath(): string {
    return path.join(this.baseDir, 'task-log-index.json');
  }

  private loadTaskIndex(): void {
    try {
      if (fs.existsSync(this.taskIndexPath)) {
        const data = JSON.parse(fs.readFileSync(this.taskIndexPath, 'utf8')) as Record<string, string>;
        for (const [key, filePath] of Object.entries(data)) {
          const taskId = Number(key);
          if (Number.isFinite(taskId) && filePath) {
            this.taskFileIndex.set(taskId, filePath);
          }
        }
      }
    } catch {
      // ignore corrupted index
    }
  }

  private saveTaskIndex(): void {
    try {
      const data: Record<string, string> = {};
      for (const [taskId, filePath] of this.taskFileIndex) {
        data[String(taskId)] = filePath;
      }
      fs.writeFileSync(this.taskIndexPath, JSON.stringify(data), 'utf8');
    } catch {
      // ignore write failure
    }
  }

  registerTaskProduct(taskId: number, sourceProductId?: string | null): void {
    const normalized = normalizeSourceProductId(sourceProductId);
    if (!normalized) {
      return;
    }
    this.taskProductMap.set(taskId, normalized);
    this.ensureInitialized();
    const filePath = this.filePath(normalized);
    this.taskFileIndex.set(taskId, filePath);
    this.saveTaskIndex();
  }

  unregisterTask(taskId: number): void {
    this.taskProductMap.delete(taskId);
  }

  getTaskLogFilePath(taskId: number): string | undefined {
    return this.taskFileIndex.get(taskId);
  }

  clearProductLogs(sourceProductId?: string | null): void {
    const normalized = normalizeSourceProductId(sourceProductId);
    if (!normalized) {
      return;
    }

    this.ensureInitialized();
    if (!fs.existsSync(this.baseDir)) {
      return;
    }

    const targetFileName = `${normalized}.log`;
    for (const name of fs.readdirSync(this.baseDir)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) {
        continue;
      }

      const filePath = path.join(this.baseDir, name, targetFileName);
      try {
        if (fs.existsSync(filePath)) {
          fs.rmSync(filePath, { force: true });
        }
      } catch {
        // ignore cleanup failure for individual log file
      }
    }
  }

  async exportProductLog(sourceProductId?: string | null): Promise<PublishLogExportResult> {
    const normalized = normalizeSourceProductId(sourceProductId);
    if (!normalized) {
      throw new Error('sourceProductId is required');
    }

    const logFile = this.findLatestProductLog(normalized);
    if (!logFile) {
      throw new Error(`未找到商品 ${sourceProductId} 的发布错误日志`);
    }

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出发布错误日志',
      defaultPath: `${normalized}.log`,
      filters: [
        { name: 'Log', extensions: ['log'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (canceled || !filePath) {
      return { exported: false, cancelled: true, count: 0 };
    }

    fs.copyFileSync(logFile, filePath);
    return { exported: true, cancelled: false, filePath, count: 1 };
  }

  async previewProductLog(sourceProductId?: string | null): Promise<PublishLogPreviewResult> {
    const normalized = normalizeSourceProductId(sourceProductId);
    if (!normalized) {
      throw new Error('sourceProductId is required');
    }

    const logFile = this.findLatestProductLog(normalized);
    if (!logFile) {
      throw new Error(`未找到商品 ${sourceProductId} 的发布日志`);
    }

    const stats = fs.statSync(logFile);
    const buffer = fs.readFileSync(logFile);
    const truncated = buffer.length > MAX_TEXT_LENGTH;
    const content = truncated
      ? buffer.subarray(Math.max(0, buffer.length - MAX_TEXT_LENGTH)).toString('utf8')
      : buffer.toString('utf8');

    return {
      sourceProductId: normalized,
      filePath: logFile,
      fileName: path.basename(logFile),
      content,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      truncated,
    };
  }

  async exportBatchErrorLogs(
    batchId: number,
    sourceProductIds: Array<string | null | undefined>,
  ): Promise<PublishLogExportResult> {
    if (!Number.isFinite(batchId) || batchId <= 0) {
      throw new Error('batchId must be positive');
    }

    const normalizedIds = Array.from(new Set(
      sourceProductIds
        .map(item => normalizeSourceProductId(item))
        .filter((item): item is string => Boolean(item)),
    ));
    if (normalizedIds.length === 0) {
      throw new Error('当前批次没有可导出的失败商品日志');
    }

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '批量导出发布错误日志',
      defaultPath: `publish-error-logs-batch-${batchId}.zip`,
      filters: [
        { name: 'Zip', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (canceled || !filePath) {
      return { exported: false, cancelled: true, count: 0 };
    }

    const zip = new AdmZip();
    const missingProductIds: string[] = [];
    let count = 0;

    for (const productId of normalizedIds) {
      const logFile = this.findLatestProductLog(productId);
      if (!logFile) {
        missingProductIds.push(productId);
        continue;
      }
      zip.addLocalFile(logFile, '', `${productId}.log`);
      count += 1;
    }

    if (count === 0) {
      throw new Error('没有找到可打包的发布错误日志');
    }

    if (missingProductIds.length > 0) {
      zip.addFile(
        'missing-logs.txt',
        Buffer.from(`以下商品未找到发布错误日志：\n${missingProductIds.join('\n')}\n`, 'utf8'),
      );
    }

    zip.writeZip(filePath);
    return {
      exported: true,
      cancelled: false,
      filePath,
      count,
      missingCount: missingProductIds.length,
    };
  }

  async openLogDirectory(): Promise<{ opened: boolean; path?: string }> {
    this.ensureInitialized();
    fs.mkdirSync(this.baseDir, { recursive: true });
    const result = await shell.openPath(this.baseDir);
    if (result) {
      throw new Error(result);
    }
    return {
      opened: true,
      path: this.baseDir,
    };
  }

  showLogFileInFolder(taskId: number): { shown: boolean } {
    const filePath = this.taskFileIndex.get(taskId);
    if (!filePath) {
      throw new Error(`未找到发布任务 #${taskId} 的日志文件记录`);
    }
    shell.showItemInFolder(filePath);
    return { shown: true };
  }

  write(line: string, meta?: unknown): void {
    if (!isEnabled()) {
      return;
    }

    try {
      const filePath = this.resolveTargetFile(meta);
      fs.appendFileSync(filePath, `${line}\n`, 'utf8');
    } catch (error) {
      console.error('[publish-log] write failed', error);
    }
  }

  private resolveTargetFile(meta?: unknown): string {
    this.ensureCurrentDir();

    const sourceProductId = this.resolveSourceProductId(meta);
    if (!sourceProductId) {
      return path.join(this.currentDir, 'publish.log');
    }

    return this.filePath(sourceProductId);
  }

  /** 确保已初始化，并在跨天时滚动到新的日期目录。 */
  private ensureCurrentDir(): void {
    this.ensureInitialized();
    const today = formatDate(new Date());

    if (today !== this.currentDate) {
      this.currentDate = today;
      this.currentDir = path.join(this.baseDir, this.currentDate);
      fs.mkdirSync(this.currentDir, { recursive: true });
    }
  }

  /**
   * 将最终提交/发布的数据写入独立的 JSON 文件，返回文件绝对路径。
   * 文件存放在当天日志目录下的 submit-payloads/ 子目录中。
   */
  writeSubmitPayload(payload: unknown, meta?: unknown): string | undefined {
    if (!isEnabled()) {
      return undefined;
    }

    try {
      this.ensureCurrentDir();
      const dir = path.join(this.currentDir, 'submit-payloads');
      fs.mkdirSync(dir, { recursive: true });

      const taskId = this.extractTaskId(isRecord(meta) ? meta : undefined);
      const idPart = this.resolveSourceProductId(meta)
        ?? (taskId !== undefined ? `task-${taskId}` : 'unknown');
      const fileName = `${idPart}-${formatTimestampForFile(new Date())}.json`;
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
      return filePath;
    } catch (error) {
      console.error('[publish-log] write submit payload failed', error);
      return undefined;
    }
  }

  private ensureInitialized(): void {
    if (this.initialized) {
      return;
    }

    const userDataPath = app?.isReady?.() ? app.getPath('userData') : process.cwd();
    this.baseDir = path.join(userDataPath, 'logs', 'publish');
    this.currentDate = formatDate(new Date());
    this.currentDir = path.join(this.baseDir, this.currentDate);
    fs.mkdirSync(this.currentDir, { recursive: true });
    this.initialized = true;
    this.loadTaskIndex();

    if (!this.cleanupStarted) {
      this.cleanupStarted = true;
      this.cleanupOldLogs();
      setInterval(() => this.cleanupOldLogs(), 24 * 60 * 60 * 1000);
    }
  }

  private filePath(sourceProductId: string): string {
    return path.join(this.currentDir, `${sourceProductId}.log`);
  }

  private findLatestProductLog(sourceProductId: string): string | undefined {
    this.ensureInitialized();
    if (!fs.existsSync(this.baseDir)) {
      return undefined;
    }

    const candidates = fs.readdirSync(this.baseDir)
      .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
      .sort((a, b) => b.localeCompare(a));

    for (const dateDir of candidates) {
      const filePath = path.join(this.baseDir, dateDir, `${sourceProductId}.log`);
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          return filePath;
        }
      } catch {
        // ignore broken candidate and continue searching older logs
      }
    }

    return undefined;
  }

  private cleanupOldLogs(): void {
    if (!fs.existsSync(this.baseDir)) {
      return;
    }

    const expireBefore = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(this.baseDir)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) {
        continue;
      }
      const dir = path.join(this.baseDir, name);
      try {
        const stats = fs.statSync(dir);
        if (stats.isDirectory() && stats.mtimeMs < expireBefore) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch {
        // ignore cleanup failure for individual log folder
      }
    }
  }

  private resolveSourceProductId(meta?: unknown): string | undefined {
    const record = isRecord(meta) ? meta : undefined;
    const fromMeta = normalizeSourceProductId(readStringLike(record?.sourceProductId));
    if (fromMeta) {
      return fromMeta;
    }

    const taskId = this.extractTaskId(record);
    if (taskId === undefined) {
      return undefined;
    }

    return this.taskProductMap.get(taskId);
  }

  private extractTaskId(meta?: Record<string, unknown>): number | undefined {
    const value = meta?.taskId;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }
}

const writer = new PublishLogWriter();

export interface PublishLogExportResult {
  exported: boolean;
  cancelled: boolean;
  filePath?: string;
  count: number;
  missingCount?: number;
}

export interface PublishLogPreviewResult {
  sourceProductId: string;
  filePath: string;
  fileName: string;
  content: string;
  size: number;
  modifiedAt: string;
  truncated: boolean;
}

export function registerPublishTaskLogFile(taskId: number, sourceProductId?: string | null): void {
  writer.registerTaskProduct(taskId, sourceProductId);
}

export function unregisterPublishTaskLogFile(taskId: number): void {
  writer.unregisterTask(taskId);
}

export function clearPublishProductLogs(sourceProductId?: string | null): void {
  writer.clearProductLogs(sourceProductId);
}

export function exportPublishProductLog(sourceProductId?: string | null): Promise<PublishLogExportResult> {
  return writer.exportProductLog(sourceProductId);
}

export function previewPublishProductLog(sourceProductId?: string | null): Promise<PublishLogPreviewResult> {
  return writer.previewProductLog(sourceProductId);
}

export function exportPublishBatchErrorLogs(
  batchId: number,
  sourceProductIds: Array<string | null | undefined>,
): Promise<PublishLogExportResult> {
  return writer.exportBatchErrorLogs(batchId, sourceProductIds);
}

export function openPublishLogDirectory(): Promise<{ opened: boolean; path?: string }> {
  return writer.openLogDirectory();
}

export function showPublishLogFileInFolder(taskId: number): { shown: boolean } {
  return writer.showLogFileInFolder(taskId);
}

export function getPublishTaskLogFilePath(taskId: number): string | undefined {
  return writer.getTaskLogFilePath(taskId);
}

/**
 * 将最终提交/发布的数据写入独立 JSON 文件，返回文件绝对路径（写入失败时返回 undefined）。
 * meta 用于路由文件名（按 sourceProductId 或 taskId 命名）。
 */
export function writePublishSubmitPayload(payload: unknown, meta?: unknown): string | undefined {
  return writer.writeSubmitPayload(payload, meta);
}

export function publishInfo(message: string, meta?: unknown): void {
  writeLog('INFO', message, meta);
}

export function publishWarn(message: string, meta?: unknown): void {
  writeLog('WARN', message, meta);
}

export function publishError(message: string, meta?: unknown): void {
  writeLog('ERROR', message, meta);
}

export function publishStepLog(
  taskId: number,
  step: string,
  phase: string,
  meta?: Record<string, unknown>,
): void {
  publishInfo(`[task:${taskId}] [step:${step}] [phase:${phase}]`, {
    taskId,
    ...meta,
  });
}

export function publishTaobaoRequestLog(
  taskId: number,
  phase: string,
  meta?: Record<string, unknown>,
): void {
  publishInfo(`[task:${taskId}] [TB] [${phase}] REQUEST`, {
    taskId,
    phase,
    ...meta,
  });
}

export function publishTaobaoResponseLog(
  taskId: number,
  phase: string,
  meta?: Record<string, unknown>,
): void {
  publishInfo(`[task:${taskId}] [TB] [${phase}] RESPONSE`, {
    taskId,
    phase,
    ...meta,
  });
}

export function summarizeForLog(value: unknown): unknown {
  return normalizeValue(value, new WeakSet<object>());
}

function toLocalISOString(date: Date): string {
  const pad = (n: number, len = 2): string => String(n).padStart(len, '0');
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const offsetStr = `${sign}${pad(Math.floor(absMin / 60))}:${pad(absMin % 60)}`;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}` +
    offsetStr
  );
}

function writeLog(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = toLocalISOString(new Date());
  writer.write(formatLogEntry(ts, level, message, meta), buildRoutingMeta(message, meta));
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(summarizeForLog(value));
  } catch (error) {
    return JSON.stringify({
      serializeError: error instanceof Error ? error.message : String(error),
    });
  }
}

function formatLogEntry(
  ts: string,
  level: 'INFO' | 'WARN' | 'ERROR',
  message: string,
  meta?: unknown,
): string {
  if (meta === undefined) {
    return `${ts} ${level} ${message}`;
  }

  const normalized = summarizeForLog(meta);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    return `${ts} ${level} ${message}\n  detail: ${safeStringify(normalized)}`;
  }

  const record = normalized as Record<string, unknown>;
  const preferredKeys = [
    'phase',
    'shopId',
    'sourceProductId',
    'productTitle',
    'url',
    'method',
    'attempt',
    'status',
    'stepName',
    'keyword',
    'catId',
    'draftId',
    'itemId',
    'input',
    'output',
    'message',
    'error',
  ];

  const lines: string[] = [`${ts} ${level} ${message}`];
  const usedKeys = new Set<string>();

  for (const key of preferredKeys) {
    if (!(key in record)) {
      continue;
    }
    usedKeys.add(key);
    lines.push(`  ${key}: ${formatFieldValue(record[key])}`);
  }

  const restEntries = Object.entries(record).filter(([key]) => !usedKeys.has(key));
  for (const [key, value] of restEntries) {
    if (isSimpleValue(value)) {
      lines.push(`  ${key}: ${formatFieldValue(value)}`);
      continue;
    }

    lines.push(`  ${key}:`);
    lines.push(indentBlock(safeStringify(value), 4));
  }

  return lines.join('\n');
}

function isSimpleValue(value: unknown): boolean {
  return value === null
    || value === undefined
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean';
}

function formatFieldValue(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.replace(/\s+/g, ' ').trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return safeStringify(value);
}

function indentBlock(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return text
    .split('\n')
    .map(line => `${prefix}${line}`)
    .join('\n');
}

function normalizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return truncate(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Buffer.isBuffer(value)) {
    return {
      type: 'Buffer',
      length: value.length,
      preview: truncate(value.toString('utf8')),
    };
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeValue(item, seen));
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) {
      return '[Circular]';
    }
    seen.add(obj);

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(obj)) {
      output[key] = normalizeValue(item, seen);
    }
    return output;
  }

  return String(value);
}

function truncate(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) {
    return text;
  }
  return `${text.slice(0, MAX_TEXT_LENGTH)}...(truncated ${text.length - MAX_TEXT_LENGTH} chars)`;
}

function formatTimestampForFile(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    + `${String(date.getMilliseconds()).padStart(3, '0')}`
  );
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeSourceProductId(sourceProductId?: string | null): string | undefined {
  const normalized = String(sourceProductId ?? '').trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.replace(/[\\/:*?"<>|]/g, '_');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readStringLike(value: unknown): string | null | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return undefined;
}

function buildRoutingMeta(message: string, meta?: unknown): Record<string, unknown> | undefined {
  const taskId = extractTaskIdFromMessage(message);

  if (isRecord(meta)) {
    if (meta.taskId !== undefined || taskId === undefined) {
      return meta;
    }
    return {
      taskId,
      ...meta,
    };
  }

  if (taskId === undefined) {
    return undefined;
  }

  return { taskId };
}

function extractTaskIdFromMessage(message: string): number | undefined {
  const match = message.match(/\[task:(\d+)\]/);
  if (!match) {
    return undefined;
  }

  const taskId = Number(match[1]);
  return Number.isFinite(taskId) ? taskId : undefined;
}
