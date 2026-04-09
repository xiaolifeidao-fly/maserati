import fs from 'fs';
import path from 'path';
import { app } from 'electron';

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

  registerTaskProduct(taskId: number, sourceProductId?: string | null): void {
    const normalized = normalizeSourceProductId(sourceProductId);
    if (!normalized) {
      return;
    }
    this.taskProductMap.set(taskId, normalized);
  }

  unregisterTask(taskId: number): void {
    this.taskProductMap.delete(taskId);
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
    this.ensureInitialized();
    const today = formatDate(new Date());

    if (today !== this.currentDate) {
      this.currentDate = today;
      this.currentDir = path.join(this.baseDir, this.currentDate);
      fs.mkdirSync(this.currentDir, { recursive: true });
    }

    const sourceProductId = this.resolveSourceProductId(meta);
    if (!sourceProductId) {
      return path.join(this.currentDir, 'publish.log');
    }

    return this.filePath(sourceProductId);
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

    if (!this.cleanupStarted) {
      this.cleanupStarted = true;
      this.cleanupOldLogs();
      setInterval(() => this.cleanupOldLogs(), 24 * 60 * 60 * 1000);
    }
  }

  private filePath(sourceProductId: string): string {
    return path.join(this.currentDir, `${sourceProductId}.log`);
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

export function registerPublishTaskLogFile(taskId: number, sourceProductId?: string | null): void {
  writer.registerTaskProduct(taskId, sourceProductId);
}

export function unregisterPublishTaskLogFile(taskId: number): void {
  writer.unregisterTask(taskId);
}

export function clearPublishProductLogs(sourceProductId?: string | null): void {
  writer.clearProductLogs(sourceProductId);
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

function writeLog(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
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
