import type { Analysis, AnalyzeContext, Narrative, Stat } from './types';
import {
  encodingField,
  fieldLabelEn,
  fieldLabelZh,
  finiteValues,
  formatPercent,
  formatPointGap,
  formatValue,
  percentOf,
  rowLabel,
  sum,
  capitalize,
} from './util';

function metricField(ctx: AnalyzeContext): string {
  return (
    ctx.metric ||
    encodingField(ctx.spec, 'value') ||
    encodingField(ctx.spec, 'y') ||
    'value'
  );
}

function base(ctx: AnalyzeContext, kind: string, metric: string): Pick<Analysis, 'kind' | 'metric' | 'metricLabelEn' | 'metricLabelZh' | 'unit' | 'notes'> {
  return {
    kind,
    metric,
    metricLabelEn: fieldLabelEn(metric),
    metricLabelZh: fieldLabelZh(metric),
    unit: ctx.dataset.unit_short,
    notes: [],
  };
}

interface Item {
  label: string;
  value: number;
  index: number;
}


function labelOf(row: AnalyzeContext['rows'][number], labelField: string | null, metric: string): string {
  if (labelField && row[labelField] != null && String(row[labelField]).trim()) {
    return String(row[labelField]);
  }
  return rowLabel(row, undefined as never, metric);
}

export function analyzeCategory(ctx: AnalyzeContext, mode: 'proportion' | 'ranking' | 'hierarchy' = 'proportion'): Analysis | null {
  const metric = metricField(ctx);
  const labelField = encodingField(ctx.spec, 'label');
  const groupField = encodingField(ctx.spec, 'group');
  const values = finiteValues(ctx.rows, metric);
  if (!values.length) return null;

  if (mode === 'hierarchy' && groupField) {
    return analyzeHierarchy(ctx, metric, labelField, groupField);
  }

  const items: Item[] = values
    .map(({ row, value, index }) => ({ label: labelOf(row, labelField, metric), value, index }))
    .sort((a, b) => b.value - a.value);

  const total = sum(items.map((item) => item.value));
  const negative = items.some((item) => item.value < 0);
  const top = items[0];
  const bottom = items[items.length - 1];
  const second = items[1] ?? null;
  const topShare = !negative ? percentOf(top.value, total) : null;
  const secondShare = second && !negative ? percentOf(second.value, total) : null;
  const topTwoShare = !negative && second ? percentOf(top.value + second.value, total) : null;
  const allEqual = items.every((item) => item.value === top.value);
  const valueText = formatValue(top.value, ctx.dataset, metric);
  const secondText = second ? formatValue(second.value, ctx.dataset, metric) : '';
  const bottomText = formatValue(bottom.value, ctx.dataset, metric);
  const gapText = formatPointGap(top.value - bottom.value, ctx.dataset);
  const n = items.length;
  const shareIsValue = ctx.dataset.unit_short === '%';

  const stats: Stat[] = [
    { labelEn: 'Largest', labelZh: '最高', value: valueText, noteEn: top.label, noteZh: top.label },
    { labelEn: 'Smallest', labelZh: '最低', value: bottomText, noteEn: bottom.label, noteZh: bottom.label },
    {
      labelEn: negative ? 'Total' : 'Total',
      labelZh: '合计',
      value: formatValue(total, ctx.dataset, metric),
      noteEn: `${n} ${n === 1 ? 'item' : 'items'}`,
      noteZh: `${n} 项`,
    },
    {
      labelEn: negative || topShare == null ? 'Gap' : 'Top two share',
      labelZh: negative || topShare == null ? '差距' : '前二占比',
      value: negative || topShare == null ? gapText : formatPercent(topTwoShare ?? 0),
      noteEn: negative || topShare == null ? `${top.label} vs ${bottom.label}` : `${top.label} + ${second?.label ?? ''}`,
      noteZh: negative || topShare == null ? `${top.label} 对 ${bottom.label}` : `${top.label} + ${second?.label ?? ''}`,
    },
  ];

  const observations: Narrative[] = [];
  if (allEqual) {
    observations.push({
      en: `All ${n} categories have the same ${fieldLabelEn(metric)} of ${valueText}.`,
      zh: `${n} 个类别的${fieldLabelZh(metric)}都相同，均为 ${valueText}。`,
    });
  } else {
    observations.push({
      en: `${capitalize(top.label)} has the highest ${fieldLabelEn(metric)} at ${valueText}${topShare != null && !shareIsValue ? `, or ${formatPercent(topShare)} of the total` : ''}.`,
      zh: `${capitalize(top.label)}的${fieldLabelZh(metric)}最高，为 ${valueText}${topShare != null && !shareIsValue ? `，占总量的 ${formatPercent(topShare)}` : ''}。`,
    });
    if (second) {
      observations.push({
        en: `${capitalize(second.label)} follows at ${secondText}${secondShare != null ? ` (${formatPercent(secondShare)})` : ''}.`,
        zh: `${capitalize(second.label)}以 ${secondText} 紧随其后${secondShare != null ? `（${formatPercent(secondShare)}）` : ''}。`,
      });
    }
    observations.push({
      en: `${capitalize(bottom.label)} is the smallest at ${bottomText}. The gap between the largest and smallest is ${gapText}.`,
      zh: `${capitalize(bottom.label)}最低，为 ${bottomText}。最高与最低相差 ${gapText}。`,
    });
    if (topTwoShare != null && !allEqual) {
      observations.push({
        en: `The top two categories together account for ${formatPercent(topTwoShare)} of the total.`,
        zh: `前两项合计占总量的 ${formatPercent(topTwoShare)}。`,
      });
    }
  }

  let academic: Narrative;
  let business: Narrative;
  let everyday: Narrative;
  if (allEqual) {
    academic = {
      en: `The chart divides ${fieldLabelEn(metric)} equally across ${n} categories: each stands at ${valueText}. No single category dominates the total of ${formatValue(total, ctx.dataset, metric)}.`,
      zh: `图表把${fieldLabelZh(metric)}平均分成 ${n} 类，每一类都是 ${valueText}。没有任何一类在总计 ${formatValue(total, ctx.dataset, metric)} 中占主导。`,
    };
    business = {
      en: `The split is even: every category sits at ${valueText}, so there is no leader to call out.`,
      zh: `分布很平均：每一项都是 ${valueText}，没有明显的领先者。`,
    };
    everyday = {
      en: `Everything is the same size here: each part is ${valueText}.`,
      zh: `这里每一块都一样大，都是 ${valueText}。`,
    };
  } else if (negative) {
    academic = {
      en: `The chart compares ${n} categories on ${fieldLabelEn(metric)}. ${top.label} records the highest value at ${valueText}, while ${bottom.label} records the lowest at ${bottomText}. The range between them is ${gapText}.`,
      zh: `图表比较了 ${n} 个类别的${fieldLabelZh(metric)}。${top.label}最高，为 ${valueText}；${bottom.label}最低，为 ${bottomText}。两者相差 ${gapText}。`,
    };
    business = {
      en: `${top.label} comes out on top at ${valueText}; ${bottom.label} is at the bottom with ${bottomText}.`,
      zh: `${top.label}以 ${valueText} 居首；${bottom.label}以 ${bottomText} 垫底。`,
    };
    everyday = {
      en: `${top.label} is the highest at ${valueText}, and ${bottom.label} is the lowest at ${bottomText}.`,
      zh: `${top.label}最高，为 ${valueText}；${bottom.label}最低，为 ${bottomText}。`,
    };
  } else if (mode === 'ranking') {
    academic = {
      en: `The chart ranks ${n} categories by ${fieldLabelEn(metric)}. ${top.label} leads with ${valueText}${topShare != null ? `, or ${formatPercent(topShare)} of the total` : ''}, followed by ${second?.label ?? 'the next category'} at ${secondText}. ${bottom.label} sits at the bottom with ${bottomText}.`,
      zh: `图表按${fieldLabelZh(metric)}排列 ${n} 个类别。${top.label}以 ${valueText} 居首${topShare != null ? `，占总量的 ${formatPercent(topShare)}` : ''}，${second?.label ?? '下一项'}以 ${secondText} 紧随其后。${bottom.label}以 ${bottomText} 排在最后。`,
    };
    business = {
      en: `${top.label} is the clear leader at ${valueText}${topShare != null ? `, or ${formatPercent(topShare)} of the total` : ''}. ${second?.label ?? 'The next item'} is at ${secondText}, and ${bottom.label} trails at ${bottomText}.`,
      zh: `${top.label}以 ${valueText} 明显领先${topShare != null ? `，占总量的 ${formatPercent(topShare)}` : ''}。${second?.label ?? '下一项'}为 ${secondText}，${bottom.label}以 ${bottomText} 落后。`,
    };
    everyday = {
      en: `${top.label} is number one at ${valueText}. ${bottom.label} is last at ${bottomText}.`,
      zh: `${top.label}排第一，为 ${valueText}；${bottom.label}排最后，为 ${bottomText}。`,
    };
  } else if (negative || topShare == null) {
    academic = {
      en: `The chart compares ${n} parts of the total. ${top.label} is the largest at ${valueText}, and ${bottom.label} is the smallest at ${bottomText}. The difference between them is ${gapText}.`,
      zh: `图表比较了整体的 ${n} 个部分。${top.label}最大，为 ${valueText}；${bottom.label}最小，为 ${bottomText}。两者相差 ${gapText}。`,
    };
    business = {
      en: `${top.label} takes the largest share at ${valueText}; ${bottom.label} is the smallest at ${bottomText}.`,
      zh: `${top.label}占比最大，为 ${valueText}；${bottom.label}最小，为 ${bottomText}。`,
    };
    everyday = {
      en: `${top.label} is the biggest part at ${valueText}. ${bottom.label} is the smallest part at ${bottomText}.`,
      zh: `${top.label}是最大的一块，为 ${valueText}；${bottom.label}最小，为 ${bottomText}。`,
    };
  } else {
    academic = {
      en: `The chart breaks the total ${fieldLabelEn(metric)} down into ${n} categories. ${top.label} accounts for the largest share at ${formatPercent(topShare)}${second ? `, followed by ${second.label} at ${formatPercent(secondShare ?? 0)}` : ''}. Together, the top two make up ${formatPercent(topTwoShare ?? 0)} of the total. At the other end, ${bottom.label} represents ${formatPercent(percentOf(bottom.value, total) ?? 0)}.`,
      zh: `图表把${fieldLabelZh(metric)}拆成 ${n} 个类别。${top.label}占比最大，为 ${formatPercent(topShare)}${second ? `，${second.label}以 ${formatPercent(secondShare ?? 0)} 紧随其后` : ''}。前两项合计占 ${formatPercent(topTwoShare ?? 0)}。${bottom.label}最小，仅占 ${formatPercent(percentOf(bottom.value, total) ?? 0)}。`,
    };
    business = {
      en: `${top.label} leads the mix at ${formatPercent(topShare)}${second ? `, just ahead of ${second.label} at ${formatPercent(secondShare ?? 0)}` : ''}. ${bottom.label} is the smallest slice at ${formatPercent(percentOf(bottom.value, total) ?? 0)}. The top two together hold ${formatPercent(topTwoShare ?? 0)} of the total.`,
      zh: `${top.label}以 ${formatPercent(topShare)} 在构成中领先${second ? `，${second.label}以 ${formatPercent(secondShare ?? 0)} 紧随其后` : ''}。${bottom.label}是最小的一块，占 ${formatPercent(percentOf(bottom.value, total) ?? 0)}。前两项合计占 ${formatPercent(topTwoShare ?? 0)}。`,
    };
    everyday = {
      en: `${top.label} is the biggest part at ${formatPercent(topShare)}. ${bottom.label} is the smallest, at ${formatPercent(percentOf(bottom.value, total) ?? 0)}.`,
      zh: `${top.label}是最大的一块，占 ${formatPercent(topShare)}；${bottom.label}最小，占 ${formatPercent(percentOf(bottom.value, total) ?? 0)}。`,
    };
  }

  return {
    ...base(ctx, mode === 'ranking' ? 'ranking' : 'proportion', metric),
    stats,
    observations,
    academic,
    business,
    everyday,
    highlight: allEqual ? 'max' : top.label,
  };
}

function analyzeHierarchy(ctx: AnalyzeContext, metric: string, labelField: string | null, groupField: string): Analysis | null {
  const rows = ctx.rows.filter((row) => typeof row[metric] === 'number' && Number.isFinite(row[metric] as number));
  if (!rows.length) return null;
  const groups = new Map<string, Item[]>();
  for (const row of rows) {
    const group = String(row[groupField] ?? 'group');
    const item = {
      label: labelOf(row, labelField, metric),
      value: Number(row[metric]),
      index: 0,
    };
    const list = groups.get(group) ?? [];
    list.push(item);
    groups.set(group, list);
  }
  const groupTotals: Item[] = [...groups.entries()]
    .map(([label, items]) => ({ label, value: sum(items.map((item) => item.value)), index: 0 }))
    .sort((a, b) => b.value - a.value);
  const allItems = [...groups.values()].flat().sort((a, b) => b.value - a.value);
  const total = sum(groupTotals.map((item) => item.value));
  const topGroup = groupTotals[0];
  const topItem = allItems[0];
  const shareIsValue = ctx.dataset.unit_short === '%';
  const topGroupShare = percentOf(topGroup.value, total);
  const topItemShare = percentOf(topItem.value, total);
  const topGroupItems = groups.get(topGroup.label) ?? [];
  const groupLeader = [...topGroupItems].sort((a, b) => b.value - a.value)[0];

  const stats: Stat[] = [
    { labelEn: 'Largest group', labelZh: '最大分组', value: formatValue(topGroup.value, ctx.dataset, metric), noteEn: topGroup.label, noteZh: topGroup.label },
    { labelEn: 'Largest item', labelZh: '最大项目', value: formatValue(topItem.value, ctx.dataset, metric), noteEn: topItem.label, noteZh: topItem.label },
    { labelEn: 'Group share', labelZh: '分组占比', value: formatPercent(topGroupShare ?? 0), noteEn: topGroup.label, noteZh: topGroup.label },
    { labelEn: 'Groups', labelZh: '分组数', value: String(groupTotals.length), noteEn: `${allItems.length} items in total`, noteZh: `共 ${allItems.length} 项` },
  ];

  const observations: Narrative[] = [
    {
      en: `${topGroup.label} is the largest group ${shareIsValue ? `at ${formatPercent(topGroupShare ?? 0)} of the total` : `at ${formatValue(topGroup.value, ctx.dataset, metric)}, or ${formatPercent(topGroupShare ?? 0)} of the total`}.`,
      zh: `${capitalize(topGroup.label)}是最大的分组，${shareIsValue ? `占总量的 ${formatPercent(topGroupShare ?? 0)}` : `为 ${formatValue(topGroup.value, ctx.dataset, metric)}，占总量的 ${formatPercent(topGroupShare ?? 0)}`}。`,
    },
    {
      en: `${topItem.label} is the largest single item at ${formatValue(topItem.value, ctx.dataset, metric)}${groupLeader && groupLeader.label !== topItem.label ? `, while ${groupLeader.label} leads within ${topGroup.label}` : ''}.`,
      zh: `${topItem.label}是最大的单项，为 ${formatValue(topItem.value, ctx.dataset, metric)}${groupLeader && groupLeader.label !== topItem.label ? `；在 ${topGroup.label} 内部，${groupLeader.label}最大` : ''}。`,
    },
    {
      en: `The hierarchy contains ${groupTotals.length} groups and ${allItems.length} items; the largest item alone is ${formatPercent(topItemShare ?? 0)} of the total.`,
      zh: `整个层级包含 ${groupTotals.length} 个分组、${allItems.length} 个项目；最大单项占总量的 ${formatPercent(topItemShare ?? 0)}。`,
    },
  ];

  return {
    ...base(ctx, 'hierarchy', metric),
    stats,
    observations,
    academic: {
      en: `The hierarchy divides ${formatValue(total, ctx.dataset, metric)} across ${groupTotals.length} groups and ${allItems.length} items. ${topGroup.label} is the largest group (${formatPercent(topGroupShare ?? 0)} of the total), and ${topItem.label} is the largest item (${formatPercent(topItemShare ?? 0)}). ${groupLeader ? `Within ${topGroup.label}, ${groupLeader.label} is the leading item.` : ''}`,
      zh: `这一层级把 ${formatValue(total, ctx.dataset, metric)} 分到 ${groupTotals.length} 个分组、${allItems.length} 个项目。${topGroup.label}是最大的分组（占 ${formatPercent(topGroupShare ?? 0)}），${topItem.label}是最大的单项（占 ${formatPercent(topItemShare ?? 0)}）。${groupLeader ? `在 ${topGroup.label} 内部，${groupLeader.label}领先。` : ''}`,
    },
    business: {
      en: `${topGroup.label} carries ${formatPercent(topGroupShare ?? 0)} of the total, and ${topItem.label} is the single biggest item at ${formatValue(topItem.value, ctx.dataset, metric)}.`,
      zh: `${topGroup.label}占了总量的 ${formatPercent(topGroupShare ?? 0)}，${topItem.label}是最大的单项，为 ${formatValue(topItem.value, ctx.dataset, metric)}。`,
    },
    everyday: {
      en: `${topGroup.label} is the biggest group. Inside it, ${groupLeader?.label ?? topItem.label} is the biggest item.`,
      zh: `${capitalize(topGroup.label)}是最大的分组，其中 ${groupLeader?.label ?? topItem.label} 最大。`,
    },
    highlight: topItem.label,
  };
}
