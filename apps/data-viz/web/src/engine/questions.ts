import type { QuestionView } from '../data/content-types';
import type { CategoryValueFacts } from './facts';
import { formatGap, formatValue } from './format';

export function buildQuestions(facts: CategoryValueFacts): QuestionView[] {
  const { dataset, focus, top, bottom, biggestIncrease, smallestChange } = facts;
  const focusLabel = focus.label_en;
  return [
    {
      id: 'highest',
      prompt_en: `Which team has the highest value in ${focusLabel}?`,
      answer_en: `${top.category}, at ${formatValue(top.value, dataset.unit)}.`,
      category: top.category,
    },
    {
      id: 'lowest',
      prompt_en: `Which team has the lowest value in ${focusLabel}?`,
      answer_en: `${bottom.category}, at ${formatValue(bottom.value, dataset.unit)}.`,
      category: bottom.category,
    },
    {
      id: 'gap',
      prompt_en: `How large is the gap between ${top.category} and ${bottom.category} in ${focusLabel}?`,
      answer_en: `${formatGap(facts.gap, dataset.unit)}.`,
      category: top.category,
    },
    {
      id: 'increase',
      prompt_en: 'Which team increased the most between the two years?',
      answer_en:
        `${biggestIncrease.category}, from ${formatValue(biggestIncrease.from, dataset.unit)} ` +
        `to ${formatValue(biggestIncrease.to, dataset.unit)}.`,
      category: biggestIncrease.category,
    },
    {
      id: 'smallest',
      prompt_en: 'Which team changed the least between the two years?',
      answer_en:
        `${smallestChange.category}, from ${formatValue(smallestChange.from, dataset.unit)} ` +
        `to ${formatValue(smallestChange.to, dataset.unit)}.`,
      category: smallestChange.category,
    },
  ];
}
