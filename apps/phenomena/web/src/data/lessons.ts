import type { Lesson, PhenomenaData } from '../data/types';

import raw from '../generated/phenomena.json';

export const data = raw as unknown as PhenomenaData;

export function lessonBySlug(slug: string): Lesson | undefined {
  return data.lessons.find((lesson) => lesson.slug === slug);
}
