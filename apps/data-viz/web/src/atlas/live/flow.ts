import type { Analysis, AnalyzeContext, Narrative, Stat } from './types';
import {
  encodingField,
  fieldLabelEn,
  fieldLabelZh,
  finiteValues,
  formatPercent,
  formatValue,
  percentOf,
  sum,
} from './util';

export function analyzeFunnel(ctx: AnalyzeContext): Analysis | null {
  const labelField = encodingField(ctx.spec, 'label') || 'stage';
  const metric = ctx.metric || encodingField(ctx.spec, 'value') || 'value';
  const items = ctx.rows
    .map((row) => ({
      label: String(row[labelField] ?? 'stage'),
      value: typeof row[metric] === 'number' && Number.isFinite(row[metric]) ? Math.max(0, row[metric] as number) : 0,
    }))
    .filter((item) => item.value >= 0);
  if (items.length < 2) return null;
  const first = items[0];
  const last = items[items.length - 1];
  const overall = percentOf(last.value, first.value);
  const steps = items.slice(1).map((item, index) => {
    const previous = items[index];
    const rate = percentOf(item.value, previous.value);
    return {
      ...item,
      drop: previous.value - item.value,
      rate,
    };
  });
  const biggestDrop = [...steps].sort((a, b) => b.drop - a.drop)[0];
  const lowestRate = [...steps].sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0))[0];
  const unit = ctx.dataset.unit_short;
  const stats: Stat[] = [
    { labelEn: 'First stage', labelZh: '第一步', value: formatValue(first.value, ctx.dataset, metric), noteEn: first.label, noteZh: first.label },
    { labelEn: 'Final stage', labelZh: '最后一步', value: formatValue(last.value, ctx.dataset, metric), noteEn: last.label, noteZh: last.label },
    { labelEn: 'Overall conversion', labelZh: '总转化率', value: formatPercent(overall ?? 0), noteEn: `${first.label} → ${last.label}`, noteZh: `${first.label} → ${last.label}` },
    { labelEn: 'Biggest drop', labelZh: '最大流失', value: formatValue(biggestDrop.drop, ctx.dataset, metric), noteEn: `${biggestDrop.label} · ${formatPercent(biggestDrop.rate ?? 0)} kept`, noteZh: `${biggestDrop.label} · 保留 ${formatPercent(biggestDrop.rate ?? 0)}` },
  ];
  const observations: Narrative[] = [
    { en: `${first.value.toLocaleString('en-US')} users enter at ${first.label}, and ${last.value.toLocaleString('en-US')} reach ${last.label}, an overall conversion rate of ${formatPercent(overall ?? 0)}.`, zh: `${first.value.toLocaleString('en-US')} 人从 ${first.label} 进入，${last.value.toLocaleString('en-US')} 人到达 ${last.label}，总转化率为 ${formatPercent(overall ?? 0)}。` },
    { en: `The largest absolute drop is at ${biggestDrop.label}, where ${biggestDrop.drop.toLocaleString('en-US')} users leave and ${formatPercent(biggestDrop.rate ?? 0)} continue.`, zh: `${biggestDrop.label}的绝对流失最大，流失 ${biggestDrop.drop.toLocaleString('en-US')} 人，只有 ${formatPercent(biggestDrop.rate ?? 0)} 继续。` },
    { en: `The lowest step-to-step conversion is ${formatPercent(lowestRate.rate ?? 0)} at ${lowestRate.label}.`, zh: `相邻两步之间转化率最低的是 ${lowestRate.label}，为 ${formatPercent(lowestRate.rate ?? 0)}。` },
  ];
  return {
    kind: 'flow',
    metric,
    metricLabelEn: fieldLabelEn(metric),
    metricLabelZh: fieldLabelZh(metric),
    unit,
    stats,
    observations,
    academic: {
      en: `The funnel follows ${items.length} stages from ${first.label} to ${last.label}. The number of users falls from ${formatValue(first.value, ctx.dataset, metric)} to ${formatValue(last.value, ctx.dataset, metric)}, an overall conversion rate of ${formatPercent(overall ?? 0)}. The biggest absolute loss occurs between ${items[steps.indexOf(biggestDrop)].label} and ${biggestDrop.label}, where ${formatValue(biggestDrop.drop, ctx.dataset, metric)} users drop out. The weakest step-to-step conversion is ${formatPercent(lowestRate.rate ?? 0)} at ${lowestRate.label}.`,
      zh: `漏斗从 ${first.label} 到 ${last.label} 共 ${items.length} 个环节。人数从 ${formatValue(first.value, ctx.dataset, metric)} 降到 ${formatValue(last.value, ctx.dataset, metric)}，总转化率为 ${formatPercent(overall ?? 0)}。绝对流失最大的一段是从 ${items[steps.indexOf(biggestDrop)].label} 到 ${biggestDrop.label}，流失 ${formatValue(biggestDrop.drop, ctx.dataset, metric)} 人。相邻环节中转化率最低的是 ${lowestRate.label}，为 ${formatPercent(lowestRate.rate ?? 0)}。`,
    },
    business: {
      en: `${formatValue(last.value, ctx.dataset, metric)} of ${formatValue(first.value, ctx.dataset, metric)} users make it from ${first.label} to ${last.label} (${formatPercent(overall ?? 0)}). The biggest leak is at ${biggestDrop.label}, losing ${formatValue(biggestDrop.drop, ctx.dataset, metric)} users.`,
      zh: `${formatValue(first.value, ctx.dataset, metric)} 人中有 ${formatValue(last.value, ctx.dataset, metric)} 人从 ${first.label} 走到 ${last.label}（${formatPercent(overall ?? 0)}）。最大漏点是 ${biggestDrop.label}，流失 ${formatValue(biggestDrop.drop, ctx.dataset, metric)} 人。`,
    },
    everyday: {
      en: `Most people drop out along the way: only ${formatPercent(overall ?? 0)} get from the first step to the last. The biggest drop is at ${biggestDrop.label}.`,
      zh: `大部分人中途流失：只有 ${formatPercent(overall ?? 0)} 从第一步走到最后一步。流失最大的是 ${biggestDrop.label}。`,
    },
    highlight: biggestDrop.label,
    notes: [{ en: 'A funnel is read in stage order; the overall rate is not the average of the step rates.', zh: '漏斗要按环节顺序读；总转化率不是各步转化率的平均。' }],
  };
}

export function analyzeSankey(ctx: AnalyzeContext): Analysis | null {
  const sourceField = encodingField(ctx.spec, 'source') || 'source';
  const targetField = encodingField(ctx.spec, 'target') || 'target';
  const metric = ctx.metric || encodingField(ctx.spec, 'value') || 'value';
  const links = finiteValues(ctx.rows, metric)
    .map(({ row, value }) => ({
      source: String(row[sourceField] ?? ''),
      target: String(row[targetField] ?? ''),
      value,
    }))
    .filter((link) => link.source && link.target);
  if (!links.length) return null;
  const total = sum(links.map((link) => link.value));
  const biggest = [...links].sort((a, b) => b.value - a.value)[0];
  const sources = new Set(links.map((link) => link.source));
  const targets = new Set(links.map((link) => link.target));
  const terminals = [...targets].filter((target) => !sources.has(target));
  const exits = links.filter((link) => /exit|drop|leave|lost|churn/i.test(link.target));
  const exitTotal = sum(exits.map((link) => link.value));
  const exitShare = percentOf(exitTotal, total);
  const nodeTotals = new Map<string, number>();
  for (const link of links) {
    nodeTotals.set(link.source, (nodeTotals.get(link.source) ?? 0) + link.value);
    nodeTotals.set(link.target, (nodeTotals.get(link.target) ?? 0) + link.value);
  }
  const busiest = [...nodeTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const unit = ctx.dataset.unit_short;
  const stats: Stat[] = [
    { labelEn: 'Largest flow', labelZh: '最大流量', value: formatValue(biggest.value, ctx.dataset, metric), noteEn: `${biggest.source} → ${biggest.target}`, noteZh: `${biggest.source} → ${biggest.target}` },
    { labelEn: 'Busiest node', labelZh: '最大节点', value: formatValue(busiest[1], ctx.dataset, metric), noteEn: busiest[0], noteZh: busiest[0] },
    { labelEn: exits.length ? 'Exit share' : 'Terminal share', labelZh: exits.length ? '流失占比' : '终点占比', value: formatPercent(exitShare ?? 0), noteEn: exits.length ? 'of all flow' : terminals.join(', '), noteZh: exits.length ? '占全部流量' : terminals.join('、') },
    { labelEn: 'Total flow', labelZh: '总流量', value: formatValue(total, ctx.dataset, metric), noteEn: `${links.length} links`, noteZh: `${links.length} 条连线` },
  ];
  const observations: Narrative[] = [
    { en: `The largest flow is ${biggest.source} → ${biggest.target} at ${formatValue(biggest.value, ctx.dataset, metric)}.`, zh: `最大的一条流是 ${biggest.source} → ${biggest.target}，为 ${formatValue(biggest.value, ctx.dataset, metric)}。` },
    { en: `${busiest[0]} is the busiest node, handling ${formatValue(busiest[1], ctx.dataset, metric)} in total.`, zh: `${busiest[0]}是最大的节点，总流量为 ${formatValue(busiest[1], ctx.dataset, metric)}。` },
    { en: exits.length ? `${formatPercent(exitShare ?? 0)} of the flow leaves the journey at an exit branch (${formatValue(exitTotal, ctx.dataset, metric)}).` : `The terminal nodes are ${terminals.join(', ')}.`, zh: exits.length ? `${formatPercent(exitShare ?? 0)} 的流量从 Exit 分支离开（${formatValue(exitTotal, ctx.dataset, metric)}）。` : `终点节点为 ${terminals.join('、')}。` },
  ];
  return {
    kind: 'flow',
    metric,
    metricLabelEn: fieldLabelEn(metric),
    metricLabelZh: fieldLabelZh(metric),
    unit,
    stats,
    observations,
    academic: {
      en: `The Sankey diagram traces ${formatValue(total, ctx.dataset, metric)} across ${nodeTotals.size} nodes. The strongest link is ${biggest.source} to ${biggest.target} (${formatValue(biggest.value, ctx.dataset, metric)}). ${busiest[0]} is the largest node by total flow. ${exits.length ? `Exit branches account for ${formatPercent(exitShare ?? 0)} of the total, which shows where the journey loses users.` : ''}`,
      zh: `桑基图追踪了 ${nodeTotals.size} 个节点之间共 ${formatValue(total, ctx.dataset, metric)} 的流量。最强的一条是 ${biggest.source} 到 ${biggest.target}（${formatValue(biggest.value, ctx.dataset, metric)}）。按总流量看，${busiest[0]}是最大的节点。${exits.length ? `离开分支占总量的 ${formatPercent(exitShare ?? 0)}，显示了流程在哪里流失。` : ''}`,
    },
    business: {
      en: `${biggest.source} → ${biggest.target} is the biggest lane at ${formatValue(biggest.value, ctx.dataset, metric)}. ${busiest[0]} carries the most traffic overall.${exits.length ? ` Exits take ${formatPercent(exitShare ?? 0)} of the flow.` : ''}`,
      zh: `${biggest.source} → ${biggest.target} 是最大的一条流，为 ${formatValue(biggest.value, ctx.dataset, metric)}。${busiest[0]}的总流量最大。${exits.length ? `离开分支带走了 ${formatPercent(exitShare ?? 0)} 的流量。` : ''}`,
    },
    everyday: {
      en: `Most of the flow goes from ${biggest.source} to ${biggest.target} (${formatValue(biggest.value, ctx.dataset, metric)}).${exits.length ? ` A lot also leaves the journey: ${formatPercent(exitShare ?? 0)} exits.` : ''}`,
      zh: `流量最多的是从 ${biggest.source} 到 ${biggest.target}（${formatValue(biggest.value, ctx.dataset, metric)}）。${exits.length ? `也有不少中途离开：流失占 ${formatPercent(exitShare ?? 0)}。` : ''}`,
    },
    highlight: biggest.target,
    notes: [{ en: 'Band width is the amount; a wide exit branch is lost volume, not a destination.', zh: '带宽代表数量；很宽的 Exit 分支代表流失，不是目的地。' }],
  };
}

export function analyzeConnections(ctx: AnalyzeContext): Analysis | null {
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
  const strongest = [...links].sort((a, b) => b.value - a.value)[0];
  const nodeTotals = new Map<string, number>();
  for (const link of links) {
    nodeTotals.set(link.source, (nodeTotals.get(link.source) ?? 0) + link.value);
    nodeTotals.set(link.target, (nodeTotals.get(link.target) ?? 0) + link.value);
  }
  const hub = [...nodeTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const reverse = links.find((link) => link.source === strongest.target && link.target === strongest.source);
  const unit = ctx.dataset.unit_short;
  const stats: Stat[] = [
    { labelEn: 'Strongest link', labelZh: '最强连线', value: formatValue(strongest.value, ctx.dataset, metric), noteEn: `${strongest.source} → ${strongest.target}`, noteZh: `${strongest.source} → ${strongest.target}` },
    { labelEn: 'Busiest node', labelZh: '最大节点', value: formatValue(hub[1], ctx.dataset, metric), noteEn: hub[0], noteZh: hub[0] },
    { labelEn: 'Total', labelZh: '总量', value: formatValue(total, ctx.dataset, metric), noteEn: `${links.length} links`, noteZh: `${links.length} 条连线` },
    { labelEn: 'Reverse flow', labelZh: '反向流量', value: reverse ? formatValue(reverse.value, ctx.dataset, metric) : 'none', noteEn: reverse ? `${strongest.target} → ${strongest.source}` : 'one-way', noteZh: reverse ? `${strongest.target} → ${strongest.source}` : '单向' },
  ];
  const observations: Narrative[] = [
    { en: `The strongest link is ${strongest.source} → ${strongest.target} at ${formatValue(strongest.value, ctx.dataset, metric)}.`, zh: `最强的一条是 ${strongest.source} → ${strongest.target}，为 ${formatValue(strongest.value, ctx.dataset, metric)}。` },
    { en: `${hub[0]} is the busiest node, with ${formatValue(hub[1], ctx.dataset, metric)} passing through it.`, zh: `${hub[0]}是最繁忙的节点，经过它的流量为 ${formatValue(hub[1], ctx.dataset, metric)}。` },
    { en: reverse ? `The reverse flow, ${strongest.target} → ${strongest.source}, is ${formatValue(reverse.value, ctx.dataset, metric)}.` : 'The strongest link is one-way: there is no matching flow in the opposite direction.', zh: reverse ? `反向流量 ${strongest.target} → ${strongest.source} 为 ${formatValue(reverse.value, ctx.dataset, metric)}。` : '最强连线是单向的，反方向没有对应的流量。' },
  ];
  return {
    kind: 'flow',
    metric,
    metricLabelEn: fieldLabelEn(metric),
    metricLabelZh: fieldLabelZh(metric),
    unit,
    stats,
    observations,
    academic: {
      en: `The diagram maps ${links.length} connections with a total volume of ${formatValue(total, ctx.dataset, metric)}. The strongest link is ${strongest.source} → ${strongest.target} (${formatValue(strongest.value, ctx.dataset, metric)}). ${hub[0]} is the central node by total flow. ${reverse ? `The reverse link carries ${formatValue(reverse.value, ctx.dataset, metric)}, so the relationship is two-way.` : 'The strongest relationship is one-way.'}`,
      zh: `图中有 ${links.length} 条连接，总流量为 ${formatValue(total, ctx.dataset, metric)}。最强的一条是 ${strongest.source} → ${strongest.target}（${formatValue(strongest.value, ctx.dataset, metric)}）。按总流量看，${hub[0]}是中心节点。${reverse ? `反向连接为 ${formatValue(reverse.value, ctx.dataset, metric)}，因此是双向关系。` : '最强的关系是单向的。'}`,
    },
    business: {
      en: `${strongest.source} → ${strongest.target} is the strongest connection at ${formatValue(strongest.value, ctx.dataset, metric)}. ${hub[0]} sits at the center with ${formatValue(hub[1], ctx.dataset, metric)} of traffic.`,
      zh: `${strongest.source} → ${strongest.target} 是最强连接，为 ${formatValue(strongest.value, ctx.dataset, metric)}。${hub[0]}处于中心，总流量为 ${formatValue(hub[1], ctx.dataset, metric)}。`,
    },
    everyday: {
      en: `${strongest.source} and ${strongest.target} have the strongest connection. ${hub[0]} is the busiest point.`,
      zh: `${strongest.source}和${strongest.target}之间的联系最强，${hub[0]}最繁忙。`,
    },
    highlight: hub[0],
    notes: [{ en: 'Node position is a layout choice; only the links and totals carry meaning.', zh: '节点位置只是排版，不代表含义；有意义的是连线和总量。' }],
  };
}
