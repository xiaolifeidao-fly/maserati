import type { PublishPriceSettings } from '../types/publish-task';

function roundToCent(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parsePriceNumber(value: unknown): number {
  const numeric = Number(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

export function findLowestPositivePrice(values: unknown[]): number | null {
  const prices = values
    .map(parsePriceNumber)
    .filter(price => price > 0);

  if (prices.length === 0) {
    return null;
  }

  return Math.min(...prices);
}

export function findLowestPositivePriceInStock<T extends { price: unknown; stock?: unknown }>(
  items: T[],
): number | null {
  return findLowestPositivePrice(
    items
      .filter(item => Number(item.stock ?? 0) > 0)
      .map(item => item.price),
  );
}

export function applyPriceAdjustment(price: number, settings?: PublishPriceSettings): number {
  if (!Number.isFinite(price) || price <= 0) {
    return 0;
  }
  if (!settings) {
    return roundToCent(price);
  }

  const ratio = Number.isFinite(settings.floatRatio) && settings.floatRatio > 0
    ? settings.floatRatio
    : 1;
  const amount = Number.isFinite(settings.floatAmount)
    ? settings.floatAmount
    : 0;

  return Math.max(0.01, roundToCent(price * ratio + amount));
}

export function formatPrice(price: number, settings?: PublishPriceSettings): string {
  return applyPriceAdjustment(price, settings).toFixed(2);
}
