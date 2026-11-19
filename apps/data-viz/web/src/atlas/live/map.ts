import type { Analysis, AnalyzeContext, Narrative, Stat } from './types';
import {
  encodingField,
  fieldLabelEn,
  fieldLabelZh,
  finiteValues,
  formatPercent,
  formatValue,
  mean,
  percentOf,
  sum,
} from './util';

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

function regionName(value: string): string {
  return US_STATES[value] ?? value;
}

function isRateField(field: string, unit: string): boolean {
  return /rate|share|percent|ratio/i.test(field) || unit === '%';
}

export function analyzeRegionMap(ctx: AnalyzeContext): Analysis | null {
  const regionField = encodingField(ctx.spec, 'region') || 'region';
  const metric = ctx.metric || encodingField(ctx.spec, 'value') || 'value';
  const items = finiteValues(ctx.rows, metric)
    .map(({ row, value }) => {
      const code = String(row[regionField] ?? 'region');
      return { label: regionName(code), code, value };
    })
    .sort((a, b) => b.value - a.value);
  if (!items.length) return null;
  const top = items[0];
  const bottom = items[items.length - 1];
  const total = sum(items.map((item) => item.value));
  const avg = mean(items.map((item) => item.value));
  const rate = isRateField(metric, ctx.dataset.unit_short ?? '');
  const topShare = rate ? null : percentOf(top.value, total);
  const topThreeShare = rate ? null : percentOf(sum(items.slice(0, 3).map((item) => item.value)), total);
  const stats: Stat[] = [
    { labelEn: 'Highest', labelZh: '最高', value: formatValue(top.value, ctx.dataset, metric), noteEn: top.label, noteZh: top.label },
    { labelEn: 'Lowest', labelZh: '最低', value: formatValue(bottom.value, ctx.dataset, metric), noteEn: bottom.label, noteZh: bottom.label },
    { labelEn: 'Average', labelZh: '平均', value: formatValue(avg, ctx.dataset, metric), noteEn: `${items.length} regions`, noteZh: `${items.length} 个地区` },
    { labelEn: rate ? 'Range' : 'Top share', labelZh: rate ? '极差' : '最高占比', value: rate ? formatValue(top.value - bottom.value, ctx.dataset, metric) : formatPercent(topShare ?? 0), noteEn: rate ? `${top.label} vs ${bottom.label}` : top.label, noteZh: rate ? `${top.label} 对 ${bottom.label}` : top.label },
  ];
  const observations: Narrative[] = [
    { en: `${top.label} has the highest ${fieldLabelEn(metric)} at ${formatValue(top.value, ctx.dataset, metric)}.`, zh: `${top.label}的${fieldLabelZh(metric)}最高，为 ${formatValue(top.value, ctx.dataset, metric)}。` },
    { en: `${bottom.label} has the lowest at ${formatValue(bottom.value, ctx.dataset, metric)}; the gap between them is ${formatValue(top.value - bottom.value, ctx.dataset, metric)}.`, zh: `${bottom.label}最低，为 ${formatValue(bottom.value, ctx.dataset, metric)}；两者相差 ${formatValue(top.value - bottom.value, ctx.dataset, metric)}。` },
    { en: rate ? `The average across ${items.length} regions is ${formatValue(avg, ctx.dataset, metric)}.` : `The top three regions account for ${formatPercent(topThreeShare ?? 0)} of the total.`, zh: rate ? `${items.length} 个地区的平均值为 ${formatValue(avg, ctx.dataset, metric)}。` : `前三名地区合计占 ${formatPercent(topThreeShare ?? 0)}。` },
  ];
  return {
    kind: 'map',
    metric,
    metricLabelEn: fieldLabelEn(metric),
    metricLabelZh: fieldLabelZh(metric),
    unit: ctx.dataset.unit_short,
    stats,
    observations,
    academic: {
      en: `The map shades ${items.length} regions by ${fieldLabelEn(metric)}. ${top.label} records the highest value at ${formatValue(top.value, ctx.dataset, metric)}, and ${bottom.label} the lowest at ${formatValue(bottom.value, ctx.dataset, metric)}. The average is ${formatValue(avg, ctx.dataset, metric)}. ${rate ? 'Because the measure is a rate, the values can be compared directly across regions of different sizes.' : `The highest region accounts for ${formatPercent(topShare ?? 0)} of the total.`}`,
      zh: `地图按${fieldLabelZh(metric)}给 ${items.length} 个地区着色。${top.label}最高，为 ${formatValue(top.value, ctx.dataset, metric)}；${bottom.label}最低，为 ${formatValue(bottom.value, ctx.dataset, metric)}。平均值为 ${formatValue(avg, ctx.dataset, metric)}。${rate ? '这是比率数据，可以跨不同面积的地区直接比较。' : `最高地区占总量的 ${formatPercent(topShare ?? 0)}。`}`,
    },
    business: {
      en: `${top.label} leads at ${formatValue(top.value, ctx.dataset, metric)}, while ${bottom.label} is lowest at ${formatValue(bottom.value, ctx.dataset, metric)}. The average is ${formatValue(avg, ctx.dataset, metric)}.`,
      zh: `${top.label}以 ${formatValue(top.value, ctx.dataset, metric)} 领先，${bottom.label}最低，为 ${formatValue(bottom.value, ctx.dataset, metric)}。平均值为 ${formatValue(avg, ctx.dataset, metric)}。`,
    },
    everyday: {
      en: `${top.label} is the highest on the map, at ${formatValue(top.value, ctx.dataset, metric)}. ${bottom.label} is the lowest.`,
      zh: `地图上最高的是 ${top.label}，为 ${formatValue(top.value, ctx.dataset, metric)}；最低的是 ${bottom.label}。`,
    },
    highlight: top.code,
    notes: [rate
      ? { en: 'A rate map compares regions fairly; a total map would make large regions look stronger.', zh: '比率地图能公平比较地区；总量地图会让面积大的地区显得更强。' }
      : { en: 'Totals grow with region size or population, so compare rates when the regions differ greatly.', zh: '总量会随地区面积或人口增长；地区差异大时应该比较比率。' }],
  };
}

export function analyzeSymbolMap(ctx: AnalyzeContext): Analysis | null {
  const metric = ctx.metric || encodingField(ctx.spec, 'size') || 'size';
  const labelField = encodingField(ctx.spec, 'label') || 'label';
  const items = finiteValues(ctx.rows, metric)
    .map(({ row, value }) => ({ label: String(row[labelField] ?? 'place'), value }))
    .sort((a, b) => b.value - a.value);
  if (!items.length) return null;
  const top = items[0];
  const total = sum(items.map((item) => item.value));
  const topShare = percentOf(top.value, total);
  const topThree = percentOf(sum(items.slice(0, 3).map((item) => item.value)), total);
  const stats: Stat[] = [
    { labelEn: 'Largest', labelZh: '最大', value: formatValue(top.value, ctx.dataset, metric), noteEn: top.label, noteZh: top.label },
    { labelEn: 'Smallest', labelZh: '最小', value: formatValue(items[items.length - 1].value, ctx.dataset, metric), noteEn: items[items.length - 1].label, noteZh: items[items.length - 1].label },
    { labelEn: 'Total', labelZh: '合计', value: formatValue(total, ctx.dataset, metric), noteEn: `${items.length} places`, noteZh: `${items.length} 个地点` },
    { labelEn: 'Top 3 share', labelZh: '前三占比', value: formatPercent(topThree ?? 0), noteEn: 'of the total', noteZh: '占总量' },
  ];
  return {
    kind: 'map',
    metric,
    metricLabelEn: fieldLabelEn(metric),
    metricLabelZh: fieldLabelZh(metric),
    unit: ctx.dataset.unit_short,
    stats,
    observations: [
      { en: `${top.label} is the largest point at ${formatValue(top.value, ctx.dataset, metric)}, or ${formatPercent(topShare ?? 0)} of the total.`, zh: `${top.label}是最大的点，为 ${formatValue(top.value, ctx.dataset, metric)}，占总量 ${formatPercent(topShare ?? 0)}。` },
      { en: `The top three places together account for ${formatPercent(topThree ?? 0)}.`, zh: `前三名地点合计占 ${formatPercent(topThree ?? 0)}。` },
      { en: `Values range from ${formatValue(items[items.length - 1].value, ctx.dataset, metric)} to ${formatValue(top.value, ctx.dataset, metric)}.`, zh: `数值从 ${formatValue(items[items.length - 1].value, ctx.dataset, metric)} 到 ${formatValue(top.value, ctx.dataset, metric)}。` },
    ],
    academic: {
      en: `The symbol map places ${items.length} locations, with circle area proportional to ${fieldLabelEn(metric)}. ${top.label} is the largest at ${formatValue(top.value, ctx.dataset, metric)} (${formatPercent(topShare ?? 0)} of the total). The top three locations account for ${formatPercent(topThree ?? 0)} of all ${fieldLabelEn(metric)}. The total across all locations is ${formatValue(total, ctx.dataset, metric)}.`,
      zh: `符号地图标出了 ${items.length} 个地点，圆面积与${fieldLabelZh(metric)}成正比。${top.label}最大，为 ${formatValue(top.value, ctx.dataset, metric)}（占总量 ${formatPercent(topShare ?? 0)}）。前三名地点合计占全部${fieldLabelZh(metric)}的 ${formatPercent(topThree ?? 0)}。所有地点的合计为 ${formatValue(total, ctx.dataset, metric)}。`,
    },
    business: {
      en: `${top.label} is the biggest location at ${formatValue(top.value, ctx.dataset, metric)}, and the top three take ${formatPercent(topThree ?? 0)} of the total.`,
      zh: `${top.label}是最大的地点，为 ${formatValue(top.value, ctx.dataset, metric)}；前三名合计占 ${formatPercent(topThree ?? 0)}。`,
    },
    everyday: {
      en: `${top.label} has the most: ${formatValue(top.value, ctx.dataset, metric)}.`,
      zh: `${top.label}最多，为 ${formatValue(top.value, ctx.dataset, metric)}。`,
    },
    highlight: top.label,
    notes: [{ en: 'Circle area, not radius, encodes the value; crowded circles can hide smaller places.', zh: '圆面积（不是半径）代表数值；圆挤在一起时会遮住较小的地点。' }],
  };
}

export function analyzeFlowMap(ctx: AnalyzeContext): Analysis | null {
  const sourceField = encodingField(ctx.spec, 'source') || 'source';
  const targetField = encodingField(ctx.spec, 'target') || 'target';
  const metric = ctx.metric || encodingField(ctx.spec, 'value') || 'value';
  const links = finiteValues(ctx.rows, metric).map(({ row, value }) => ({
    source: String(row[sourceField] ?? ''),
    target: String(row[targetField] ?? ''),
    value,
  }));
  if (!links.length) return null;
  const total = sum(links.map((link) => link.value));
  const top = [...links].sort((a, b) => b.value - a.value)[0];
  const topShare = percentOf(top.value, total);
  const topThree = percentOf(sum([...links].sort((a, b) => b.value - a.value).slice(0, 3).map((link) => link.value)), total);
  const destinations = new Map<string, number>();
  for (const link of links) destinations.set(link.target, (destinations.get(link.target) ?? 0) + link.value);
  const topDestination = [...destinations.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    kind: 'map',
    metric,
    metricLabelEn: fieldLabelEn(metric),
    metricLabelZh: fieldLabelZh(metric),
    unit: ctx.dataset.unit_short,
    stats: [
      { labelEn: 'Largest lane', labelZh: '最大航线', value: formatValue(top.value, ctx.dataset, metric), noteEn: `${top.source} → ${top.target}`, noteZh: `${top.source} → ${top.target}` },
      { labelEn: 'Top destination', labelZh: '最大目的地', value: formatValue(topDestination[1], ctx.dataset, metric), noteEn: topDestination[0], noteZh: topDestination[0] },
      { labelEn: 'Total', labelZh: '合计', value: formatValue(total, ctx.dataset, metric), noteEn: `${links.length} lanes`, noteZh: `${links.length} 条航线` },
      { labelEn: 'Top lane share', labelZh: '最大航线占比', value: formatPercent(topShare ?? 0), noteEn: `top 3: ${formatPercent(topThree ?? 0)}`, noteZh: `前三：${formatPercent(topThree ?? 0)}` },
    ],
    observations: [
      { en: `The largest lane is ${top.source} → ${top.target} at ${formatValue(top.value, ctx.dataset, metric)}.`, zh: `最大的一条航线是 ${top.source} → ${top.target}，为 ${formatValue(top.value, ctx.dataset, metric)}。` },
      { en: `${topDestination[0]} is the largest destination, receiving ${formatValue(topDestination[1], ctx.dataset, metric)}.`, zh: `${topDestination[0]}是最大目的地，接收 ${formatValue(topDestination[1], ctx.dataset, metric)}。` },
      { en: `The top three lanes account for ${formatPercent(topThree ?? 0)} of all flow.`, zh: `前三条航线合计占全部流量的 ${formatPercent(topThree ?? 0)}。` },
    ],
    academic: {
      en: `The flow map draws ${links.length} lanes with a total volume of ${formatValue(total, ctx.dataset, metric)}. ${top.source} → ${top.target} is the largest lane (${formatValue(top.value, ctx.dataset, metric)}), and ${topDestination[0]} is the largest destination. The top three lanes make up ${formatPercent(topThree ?? 0)} of the total.`,
      zh: `流向地图画出了 ${links.length} 条航线，总流量为 ${formatValue(total, ctx.dataset, metric)}。${top.source} → ${top.target} 是最大航线（${formatValue(top.value, ctx.dataset, metric)}），${topDestination[0]}是最大目的地。前三条航线占总量的 ${formatPercent(topThree ?? 0)}。`,
    },
    business: {
      en: `${top.source} → ${top.target} is the top lane at ${formatValue(top.value, ctx.dataset, metric)}, and the top three lanes hold ${formatPercent(topThree ?? 0)} of the total.`,
      zh: `${top.source} → ${top.target} 是最大航线，为 ${formatValue(top.value, ctx.dataset, metric)}；前三条合计占 ${formatPercent(topThree ?? 0)}。`,
    },
    everyday: {
      en: `Most goes from ${top.source} to ${top.target}: ${formatValue(top.value, ctx.dataset, metric)}.`,
      zh: `最多的是从 ${top.source} 到 ${top.target}，为 ${formatValue(top.value, ctx.dataset, metric)}。`,
    },
    highlight: top.target,
    notes: [{ en: 'Line width is the amount; direction is shown by the arrows.', zh: '线宽代表数量，方向看箭头。' }],
  };
}
