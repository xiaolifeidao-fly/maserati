import type { Locator } from 'playwright';

/**
 * 行为拟人化工具。
 *
 * 本项目发布流程是 API/payload 驱动（fillers 构造草稿 JSON → axios 直接 POST），
 * 没有逐字打字可拟人化，验证码也已是真人滑动。因此行为风险主要集中在两处：
 *   1) 请求节奏——草稿/发布请求是否「开页瞬发」、缺少真人的检查停留；
 *   2) 批量间隔——多个商品是否以固定/极短间隔连发（批量铺货最强信号）。
 * 这里提供右偏分布的随机停顿，取代机器级的等间隔/瞬时操作。
 */

/**
 * 0~1 的右偏随机数：峰值靠左、偶发长尾，比 Math.random() 的均匀分布更像真人停顿。
 * 取指数分布 -ln(1-u) 再压缩到 0~1。
 */
function skewedUnit(): number {
  const u = Math.random();
  const v = -Math.log(1 - u) / 3; // 期望 ≈ 0.33
  return v > 1 ? 1 : v;
}

/** 在 [minMs, maxMs] 内按右偏分布取一个随机毫秒数。 */
export function humanDelayMs(minMs: number, maxMs: number): number {
  if (maxMs <= minMs) return Math.max(0, Math.round(minMs));
  return Math.round(minMs + skewedUnit() * (maxMs - minMs));
}

/** 按右偏分布随机停顿 [minMs, maxMs]。 */
export function humanDelay(minMs: number, maxMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, humanDelayMs(minMs, maxMs)));
}

export interface BatchGapOptions {
  /** 相邻任务最小间隔(ms)，默认 8s */
  minMs?: number;
  /** 相邻任务最大间隔(ms)，默认 25s */
  maxMs?: number;
  /** 触发「休息」长停顿的概率，默认 0.12 */
  longPauseChance?: number;
  /** 长停顿区间(ms)，默认 60s~180s */
  longPauseMinMs?: number;
  longPauseMaxMs?: number;
}

/**
 * 批量任务之间的间隔：基础随机间隔 + 小概率长停顿（模拟真人中途休息），
 * 核心目的是打破固定 cadence —— 等间隔连发是淘宝识别批量铺货的最强行为信号。
 */
export function batchGapMs(opts: BatchGapOptions = {}): number {
  const {
    minMs = 8_000,
    maxMs = 25_000,
    longPauseChance = 0.12,
    longPauseMinMs = 60_000,
    longPauseMaxMs = 180_000,
  } = opts;
  if (Math.random() < longPauseChance) {
    return humanDelayMs(longPauseMinMs, longPauseMaxMs);
  }
  return humanDelayMs(minMs, maxMs);
}

/**
 * 拟人化点击：先 hover（带真实鼠标移动）→ 短暂「瞄准」停顿 → 点击（随机按压时长）。
 * 取代直接 locator.click() 在元素中心零移动派发 trusted 事件的机器特征。
 */
export async function humanClick(locator: Locator): Promise<void> {
  try {
    await locator.hover({ timeout: 10_000 });
  } catch {
    // hover 失败（元素被遮挡/需滚动）不阻断，后续 click 会自行滚动定位
  }
  await humanDelay(120, 480);
  await locator.click({ delay: humanDelayMs(40, 140) });
}
