import { requestBackend } from '@src/impl/shared/backend';

/**
 * 标题过滤器 —— 过滤商品标题中的违规/敏感关键词。
 *
 * 规则由服务端 `title_filter` 域维护并用 Redis 缓存：命中 keyword 时替换为
 * replacement（replacement 可为空，表示直接删除该关键词）。客户端不再本地缓存，
 * 每次发布直接拉取服务端有效规则，缓存与一致性由服务端保证。
 */
export interface TitleFilterRule {
  keyword: string;
  replacement: string;
}

async function fetchActiveRules(taskId?: number): Promise<TitleFilterRule[]> {
  const raw = await requestBackend<Array<{ keyword?: string; replacement?: string }>>(
    'GET',
    '/title-filters/active',
    { publishLog: { taskId, label: 'title-filter' } },
  );

  return (raw ?? [])
    .map(item => ({
      keyword: String(item?.keyword ?? ''),
      replacement: String(item?.replacement ?? ''),
    }))
    .filter(rule => rule.keyword.length > 0);
}

/**
 * 按规则替换标题中的关键词（纯函数）。
 */
export function applyTitleFilter(title: string, rules: TitleFilterRule[]): string {
  if (!title || rules.length === 0) {
    return title;
  }

  let result = title;
  for (const { keyword, replacement } of rules) {
    if (!keyword) {
      continue;
    }
    result = result.split(keyword).join(replacement);
  }

  return result;
}

/**
 * 过滤标题中的关键词。规则来自服务端（服务端 Redis 缓存）。
 *
 * @param title 原始标题
 * @param options.taskId 发布任务 ID，仅用于失败日志路由
 * @returns 过滤后的标题
 */
export async function filterTitle(title: string, options?: { taskId?: number }): Promise<string> {
  if (!title) {
    return title;
  }
  const rules = await fetchActiveRules(options?.taskId);
  return applyTitleFilter(title, rules);
}
