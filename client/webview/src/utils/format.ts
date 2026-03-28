"use client";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return [
    parsed.getFullYear(),
    pad(parsed.getMonth() + 1),
    pad(parsed.getDate()),
  ].join("-") + ` ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
}

export function formatNumber(value: number, maximumFractionDigits = 4) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return "-";
  }

  const fixed = normalized.toFixed(maximumFractionDigits);
  const [integerPart, decimalPart = ""] = fixed.split(".");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const trimmedDecimal = decimalPart.replace(/0+$/, "");

  return trimmedDecimal ? `${groupedInteger}.${trimmedDecimal}` : groupedInteger;
}

export function formatCurrency(value: number) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return "-";
  }

  const sign = normalized < 0 ? "-" : "";
  return `${sign}¥${formatNumber(Math.abs(normalized), 2)}`;
}
