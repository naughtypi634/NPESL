import type { EngineFeature, EngineLibrary } from '../engine';
import { DV } from '../engine';
import type { GoalId, Library, View, ViewData } from '../data/types';
import { featureGoal, featureInGoal } from './goals';
import type { Unit } from '../data/types';

export function liveView(view: View, data: ViewData): View {
  return DV.liveView(view, data) as View;
}

export function featuresFor(view: View, edited: ViewData | undefined): EngineFeature[] {
  if (!edited) return view.features ?? [];
  const live = liveView(view, edited);
  return Object.values(DV.compute.view(live));
}

export function featureIndex(features: EngineFeature[]): Record<string, EngineFeature> {
  const index: Record<string, EngineFeature> = {};
  for (const feature of features) {
    for (const mark of feature.marks) index[mark] = feature;
  }
  return index;
}

export function uniqueFeatures(features: EngineFeature[]): EngineFeature[] {
  const seen = new Set<string>();
  const out: EngineFeature[] = [];
  for (const feature of features) {
    const key = feature.id || `${JSON.stringify(feature.marks)}${feature.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(feature);
  }
  return out;
}

export function kindLabel(kind: string, library: Library | EngineLibrary | null): string {
  if (!library) return kind;
  return library.features[kind]?.label_zh || kind;
}

export function orderedFeatures(features: EngineFeature[]): EngineFeature[] {
  return uniqueFeatures(features);
}

export function authorFeatures(view: View): EngineFeature[] {
  return uniqueFeatures((view.features ?? []).filter((feature) => feature.auto === false));
}

export function authorForMark(view: View, mark: string | null | undefined): EngineFeature | undefined {
  if (!mark) return undefined;
  return authorFeatures(view).find((feature) => feature.marks.includes(mark));
}

export function featureForMark(
  features: EngineFeature[],
  mark: string | null | undefined,
): EngineFeature | undefined {
  if (!mark) return undefined;
  return featureIndex(features)[mark];
}

function autoFeatures(view: View, edited: ViewData | undefined): EngineFeature[] {
  if (edited) {
    return Object.values(DV.compute.view(liveView(view, edited)));
  }
  return (view.features ?? []).filter((feature) => feature.auto !== false);
}

/**
 * The order behind "previous / next":
 *  - with a goal: authored observations for that goal, else auto observations
 *    for that goal, else nothing (caller falls back to all features);
 *  - without a goal: authored observations first, then auto observations.
 */
export function observationList(
  view: View,
  edited: ViewData | undefined,
  goal: GoalId | undefined,
  kindGoals: Record<string, GoalId> | undefined,
): EngineFeature[] {
  const authored = authorFeatures(view);
  const auto = autoFeatures(view, edited);
  if (goal) {
    const authoredInGoal = authored.filter((feature) => featureInGoal(feature, goal, kindGoals));
    if (authoredInGoal.length) return authoredInGoal;
    const autoInGoal = auto.filter((feature) => featureInGoal(feature, goal, kindGoals));
    if (autoInGoal.length) return uniqueFeatures(autoInGoal);
    return [];
  }
  return uniqueFeatures([...authored, ...auto]);
}

export function preselectFeature(
  view: View,
  edited: ViewData | undefined,
  preferredMark: string | undefined,
  goal: GoalId | undefined,
  kindGoals: Record<string, GoalId> | undefined,
): EngineFeature | undefined {
  const features = featuresFor(view, edited);
  const byMark = featureForMark(features, preferredMark);
  if (byMark) return byMark;
  const listed = observationList(view, edited, goal, kindGoals);
  if (listed.length) return listed[0];
  const firstAuthored = authorFeatures(view)[0];
  if (firstAuthored) return firstAuthored;
  return features[0];
}

function parseSegMark(mark: string): { seriesId: string; index: number } | null {
  const match = /^seg:(.+):(\d+)$/.exec(mark);
  if (!match) return null;
  return { seriesId: match[1], index: Number(match[2]) };
}

/**
 * After the data has been edited, an authored observation that covers several
 * line segments still needs one sentence for the whole span. Merge the live
 * slots from its first and last segment; other chart types use the live
 * feature at the first mark.
 */
export function featureForAuthorGroup(
  view: View,
  edited: ViewData | undefined,
  author: EngineFeature,
): EngineFeature {
  if (!edited) return author;
  const live = liveView(view, edited);
  const liveData = live as View & ViewData;
  const liveFeatures = Object.values(DV.compute.view(live));
  const liveIndex = featureIndex(liveFeatures);
  const segments = author.marks
    .map(parseSegMark)
    .filter((value): value is { seriesId: string; index: number } => value != null);

  if (segments.length >= 2 && liveData.series) {
    const seriesId = segments[0].seriesId;
    const sameSeries = segments.filter((segment) => segment.seriesId === seriesId);
    const indexes = sameSeries.map((segment) => segment.index);
    const firstI = Math.min(...indexes);
    const lastI = Math.max(...indexes);
    const series = liveData.series.find((item) => item.id === seriesId);
    if (series && series.values[firstI] != null && series.values[lastI + 1] != null) {
      const unit: Unit = live.unit ?? {};
      const first = DV.compute.changeSlots(live, series, firstI, unit);
      const last = DV.compute.changeSlots(live, series, lastI, unit);
      const a = series.values[firstI];
      const b = series.values[lastI + 1];
      const slots = {
        ...first,
        to: last.to,
        to_period: last.to_period,
        period: `${first.from_period} to ${last.to_period}`,
        pct: DV.compute.pctText(a, b),
        pp: DV.compute.ppText(b - a, unit),
        delta: DV.compute.fmtDelta(b - a, unit),
      };
      return { ...author, slots };
    }
  }

  const representative = liveIndex[author.marks[0]];
  if (!representative) return author;
  return {
    ...representative,
    id: author.id,
    auto: false,
    examples: author.examples,
    note_zh: author.note_zh,
    interpret_zh: author.interpret_zh,
  };
}

export function featureGoalId(
  feature: EngineFeature,
  kindGoals: Record<string, GoalId> | undefined,
): GoalId | undefined {
  return featureGoal(feature, kindGoals);
}
