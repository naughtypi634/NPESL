import type { Expression, ExpressionView, PhraseFile } from '../data/content-types';
import type { CategoryValueFacts } from './facts';
import { formatGap, formatValue } from './format';

type Slots = Record<string, string>;

function fillFrame(frame: string, slots: Slots): string | null {
  let missing = false;
  const text = frame.replace(/\{([a-z_]+)\}/g, (match, key: string) => {
    const value = slots[key];
    if (value == null) {
      missing = true;
      return match;
    }
    return value;
  });
  return missing ? null : text;
}

function conditionsPass(expression: Expression, facts: CategoryValueFacts): boolean {
  const conditions = expression.conditions || {};
  const slight = facts.slightPair;
  const ratioPair = facts.ratioPair;

  if (conditions.gap_min != null && facts.gap < conditions.gap_min) return false;
  if (conditions.gap_ratio_max != null) {
    if (!slight || slight.bValue <= 0) return false;
    if (slight.gap / slight.bValue > conditions.gap_ratio_max) return false;
  }
  if (conditions.ratio_min != null && (!ratioPair || ratioPair.ratio < conditions.ratio_min)) return false;
  if (conditions.ratio_max != null && (!ratioPair || ratioPair.ratio > conditions.ratio_max)) return false;
  if (conditions.pct_min != null && facts.biggestIncrease.pct < conditions.pct_min) return false;
  if (conditions.pct_max != null && facts.biggestIncrease.pct > conditions.pct_max) return false;
  return true;
}

function slotsFor(expression: Expression, facts: CategoryValueFacts): { slots: Slots; category?: string } | null {
  const { dataset, focus, compare, top, bottom } = facts;
  const series = focus.label_en;
  const unit = dataset.unit;

  switch (expression.id) {
    case 'highest':
      return {
        slots: {
          top_category: top.category,
          top_value: formatValue(top.value, unit),
          series,
        },
        category: top.category,
      };
    case 'lowest':
      return {
        slots: {
          bottom_category: bottom.category,
          bottom_value: formatValue(bottom.value, unit),
          series,
        },
        category: bottom.category,
      };
    case 'higher-than':
      return {
        slots: {
          top_category: top.category,
          bottom_category: bottom.category,
          gap: formatGap(facts.gap, unit),
          series,
        },
        category: top.category,
      };
    case 'slightly-higher': {
      if (!facts.slightPair) return null;
      return {
        slots: {
          pair_a: facts.slightPair.a,
          pair_b: facts.slightPair.b,
          series,
        },
        category: facts.slightPair.a,
      };
    }
    case 'nearly-twice': {
      if (!facts.ratioPair) return null;
      return {
        slots: {
          ratio_a: facts.ratioPair.a,
          ratio_b: facts.ratioPair.b,
          series,
        },
        category: facts.ratioPair.a,
      };
    }
    case 'biggest-increase':
      return {
        slots: {
          increase_category: facts.biggestIncrease.category,
          increase_from: formatValue(facts.biggestIncrease.from, unit),
          increase_to: formatValue(facts.biggestIncrease.to, unit),
          from_period: compare.label_en,
          to_period: focus.label_en,
        },
        category: facts.biggestIncrease.category,
      };
    case 'smallest-change':
      return {
        slots: {
          small_category: facts.smallestChange.category,
          small_from: formatValue(facts.smallestChange.from, unit),
          small_to: formatValue(facts.smallestChange.to, unit),
          from_period: compare.label_en,
          to_period: focus.label_en,
        },
        category: facts.smallestChange.category,
      };
    default:
      return null;
  }
}

export function buildExpressions(phrases: PhraseFile, facts: CategoryValueFacts): ExpressionView[] {
  const views: ExpressionView[] = [];
  for (const expression of phrases.expressions) {
    if (!conditionsPass(expression, facts)) continue;
    const slots = slotsFor(expression, facts);
    if (!slots) continue;
    const example = fillFrame(expression.example_frame, slots.slots);
    if (!example || example.includes('{')) continue;
    views.push({ ...expression, example, category: slots.category });
  }
  return views;
}
