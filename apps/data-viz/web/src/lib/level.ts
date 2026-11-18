import type { EngineFeature, EngineLibraryFeature, EnginePattern } from '../engine';
import { DV } from '../engine';
import type {
  EngineLevel,
  LearnerLevel,
  Library,
  View,
} from '../data/types';

const SLOT = /\{([a-z_]+)\}/g;

export function levelLabel(level: LearnerLevel): string {
  return level === 'basic' ? 'Basic' : 'Advanced';
}

function frameSlots(frame: string | undefined): string[] {
  if (!frame) return [];
  return Array.from(frame.matchAll(SLOT), (match) => match[1]);
}

export function canFill(
  pattern: EnginePattern | undefined,
  slots: Record<string, string>,
): boolean {
  if (!pattern?.frame) return false;
  const needed = new Set([
    ...frameSlots(pattern.frame),
    ...frameSlots(pattern.zh_frame),
  ]);
  for (const key of needed) {
    if (slots[key] == null || slots[key] === '') return false;
  }
  return true;
}

function patternAt(entry: EngineLibraryFeature | undefined, level: EngineLevel): EnginePattern | undefined {
  return entry?.patterns?.find((pattern) => pattern.level === level);
}

/**
 * The engine still stores a2 / b1 / b2. The app shows two tiers:
 * Basic = a2, Advanced = b1 (b2 when a kind has no b1 pattern).
 */
export function usablePattern(
  entry: EngineLibraryFeature | undefined,
  feature: EngineFeature,
  level: LearnerLevel,
): EnginePattern | undefined {
  if (!entry) return undefined;
  const order: EngineLevel[] =
    level === 'basic' ? ['a2'] : ['b1', 'b2'];
  for (const code of order) {
    const pattern = patternAt(entry, code);
    if (pattern && canFill(pattern, feature.slots)) return pattern;
  }
  return undefined;
}

function cap(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return trimmed;
  return /^[a-z]/.test(trimmed)
    ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
    : trimmed;
}

export function sentenceForLevel(
  feature: EngineFeature,
  library: Library | null,
  level: LearnerLevel,
): string {
  const entry = library?.features?.[feature.kind];
  const pattern = usablePattern(entry, feature, level);
  if (!pattern) return '';
  return cap(DV.fill(pattern.frame, DV.gen.slots(feature.slots)));
}

export function chineseForLevel(
  feature: EngineFeature,
  library: Library | null,
  level: LearnerLevel,
): string {
  const entry = library?.features?.[feature.kind];
  const pattern = usablePattern(entry, feature, level);
  if (!pattern?.zh_frame) return '';
  return DV.fill(pattern.zh_frame, DV.gen.slots(feature.slots)).replace(/\s+/g, ' ').trim();
}

export function paragraphFor(view: View, level: LearnerLevel): string {
  const general = view.descriptions?.general;
  if (!general) return '';
  return level === 'basic'
    ? general.a2 ?? ''
    : general.b2 ?? general.b1 ?? '';
}

export function generatedParagraph(
  view: View,
  features: EngineFeature[],
  library: Library | null,
  level: LearnerLevel,
): string {
  if (!library) return '';
  return cap(
    DV.gen.describe(view, features, library, 'general', level === 'basic' ? 'a2' : 'b2'),
  );
}

export function generatedRegister(
  view: View,
  features: EngineFeature[],
  library: Library | null,
  register: 'ielts' | 'business',
): string {
  if (!library) return '';
  return cap(DV.gen.describe(view, features, library, register, 'b1'));
}

export function overviewFor(
  view: View,
  features: EngineFeature[],
  library: Library | null,
  edited: boolean,
): string {
  if (!edited) return view.overview_zh ?? '';
  if (!library) return '';
  return DV.gen.overviewZh(view, features, library);
}
