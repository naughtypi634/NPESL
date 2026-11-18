import type { EngineFeature } from '../engine';
import type { Gallery, GoalId, GoalMeta } from '../data/types';

export function goalMeta(gallery: Gallery | null, id: GoalId): GoalMeta | undefined {
  return gallery?.goals.find((goal) => goal.id === id);
}

export function goalLabel(gallery: Gallery | null, id: GoalId): string {
  return goalMeta(gallery, id)?.label_zh ?? id;
}

export function goalOfKind(
  kind: string,
  kindGoals: Record<string, GoalId> | undefined,
): GoalId | undefined {
  return kindGoals?.[kind];
}

export function featureGoal(
  feature: EngineFeature,
  kindGoals: Record<string, GoalId> | undefined,
): GoalId | undefined {
  return goalOfKind(feature.kind, kindGoals);
}

export function featureInGoal(
  feature: EngineFeature,
  goal: GoalId | undefined,
  kindGoals: Record<string, GoalId> | undefined,
): boolean {
  return !goal || featureGoal(feature, kindGoals) === goal;
}

export function orderedGoalIds(gallery: Gallery | null): GoalId[] {
  return gallery?.goals.map((goal) => goal.id) ?? [];
}
