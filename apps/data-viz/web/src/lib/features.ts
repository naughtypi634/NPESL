import type { EngineFeature, EngineLibrary } from '../engine';
import { DV } from '../engine';
import type { Library, View, ViewData } from '../data/types';

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
