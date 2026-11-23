import type { Unit } from '../data/content-types';

export function formatValue(value: number, unit: Unit): string {
  const decimals = Number.isFinite(unit.decimals) ? unit.decimals : 0;
  return `${value.toFixed(decimals)}${unit.short}`;
}

export function formatDelta(value: number, unit: Unit): string {
  const decimals = Number.isFinite(unit.decimals) ? unit.decimals : 0;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}${unit.short}`;
}

export function formatGap(value: number, unit: Unit): string {
  const decimals = Number.isFinite(unit.decimals) ? unit.decimals : 0;
  const amount = Math.abs(value).toFixed(decimals);
  return unit.short === '%' ? `${amount} points` : `${amount} ${unit.en}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
