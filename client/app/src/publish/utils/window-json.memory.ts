import type { Page, Response } from 'playwright';

// ─── 内存存储（进程内，不持久化）────────────────────────────────────────────────
const store = new Map<number, unknown>();

export function setTaskWindowJson(taskId: number, data: unknown): void {
  store.set(taskId, data);
}

export function getTaskWindowJson(taskId: number): unknown {
  return store.get(taskId);
}

export function clearTaskWindowJson(taskId: number): void {
  store.delete(taskId);
}

// ─── HTML 响应解析 ────────────────────────────────────────────────────────────

/**
 * 从 HTML 文本中提取 window.Json 赋值的 JSON 对象。
 * 使用括号深度跟踪，避免正则无法处理嵌套 JSON 的问题。
 */
export function extractWindowJsonFromHtml(html: string): unknown {
  const marker = 'window.Json';
  let searchFrom = 0;

  while (searchFrom < html.length) {
    const markerPos = html.indexOf(marker, searchFrom);
    if (markerPos === -1) break;

    // 跳过 marker 后的空白，找 '='
    let i = markerPos + marker.length;
    while (i < html.length && (html[i] === ' ' || html[i] === '\t' || html[i] === '\n' || html[i] === '\r')) i++;
    if (html[i] !== '=') { searchFrom = markerPos + 1; continue; }
    i++; // skip '='

    // 跳过 '=' 后的空白，找 '{'
    while (i < html.length && (html[i] === ' ' || html[i] === '\t' || html[i] === '\n' || html[i] === '\r')) i++;
    if (html[i] !== '{') { searchFrom = markerPos + 1; continue; }

    // 括号深度追踪
    const jsonStart = i;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let j = jsonStart; j < html.length; j++) {
      const ch = html[j];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\' && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(jsonStart, j + 1));
          } catch {
            searchFrom = markerPos + 1;
            break;
          }
        }
      }
    }
    if (depth !== 0) searchFrom = markerPos + 1;
  }
  return undefined;
}

// ─── Playwright 响应拦截辅助 ──────────────────────────────────────────────────

const TB_HOST = 'item.upload.taobao.com';

function isTbDocumentResponse(resp: Response): boolean {
  return resp.url().includes(TB_HOST) && resp.request().resourceType() === 'document';
}

/**
 * 在导航 / reload 前调用，返回一个 Promise，在目标页面 HTML 响应到达后解析并存入内存。
 * 设计为：先调用此函数，再调用 page.goto() / page.reload()，保证响应不被错过。
 */
export function interceptWindowJson(
  page: Page,
  taskId: number,
  timeout: number,
): Promise<unknown> {
  return page
    .waitForResponse(isTbDocumentResponse, { timeout })
    .then(async (resp) => {
      const html = await resp.text();
      const json = extractWindowJsonFromHtml(html);
      if (json) setTaskWindowJson(taskId, json);
      return json;
    })
    .catch(() => undefined);
}
