import type { SentenceLevel } from '../data/content-types';
import type { CategoryValueFacts } from './facts';
import { formatValue } from './format';

export function buildSentenceLevels(facts: CategoryValueFacts): SentenceLevel[] {
  const { dataset, focus, compare, top, bottom } = facts;
  const topValue = formatValue(top.value, dataset.unit);
  const compareValue = formatValue(facts.changes[top.index].from, dataset.unit);
  const bottomValue = formatValue(bottom.value, dataset.unit);
  const focusLabel = focus.label_en;
  const compareLabel = compare.label_en;

  return [
    {
      level: 1,
      label: 'Level 1',
      segments: [{ text: `The highest value is ${top.category}.`, added: false }],
      note_zh: '先说结论：谁最高。',
    },
    {
      level: 2,
      label: 'Level 2',
      segments: [
        { text: `The highest value is ${top.category}`, added: false },
        { text: `, at ${topValue}.`, added: true },
      ],
      note_zh: '加上具体数值。',
    },
    {
      level: 3,
      label: 'Level 3',
      segments: [
        { text: `In ${focusLabel}, `, added: true },
        { text: `the highest value is ${top.category}`, added: false },
        { text: `, at ${topValue}`, added: false },
        { text: `, compared with ${compareValue} in ${compareLabel}.`, added: true },
      ],
      note_zh: '加上时间和对比。',
    },
    {
      level: 4,
      label: 'Level 4',
      segments: [
        { text: `In ${focusLabel}, `, added: false },
        { text: `the highest value is ${top.category}`, added: false },
        { text: `, at ${topValue}`, added: false },
        { text: `, compared with ${compareValue} in ${compareLabel}`, added: false },
        { text: `, while the lowest is ${bottom.category}, at ${bottomValue}.`, added: true },
      ],
      note_zh: '加上最低的一方，形成完整对比。',
    },
  ];
}
