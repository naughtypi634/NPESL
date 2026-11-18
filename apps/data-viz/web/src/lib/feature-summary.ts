import type { EngineFeature } from '../engine';
import type { View } from '../data/types';

function parts(...values: Array<string | undefined>): string {
  return values.filter((value) => value && value.trim()).join(' · ');
}

/** A readable value line under the change name. Never exposes raw mark ids. */
export function featureSummary(feature: EngineFeature, view: View): string {
  const slots = feature.slots ?? {};
  switch (view.type) {
    case 'line':
    case 'stacked': {
      if (slots.from != null && slots.to != null) {
        const span = slots.period ? `${slots.period}` : `${slots.from_period ?? ''} → ${slots.to_period ?? ''}`;
        return [slots.from + ' → ' + slots.to, span].filter(Boolean).join(' · ');
      }
      return parts(slots.category, slots.value);
    }
    case 'bar':
      return parts(slots.category, slots.value);
    case 'pie':
      return parts(slots.category, slots.share ?? slots.value);
    case 'scatter': {
      const x = slots.x_value ?? slots.x;
      const y = slots.y_value ?? slots.y;
      const relation = slots.r != null ? `r = ${slots.r}` : '';
      return parts(x && y ? `${x} vs ${y}` : x ?? y, relation, slots.group);
    }
    case 'heatmap':
      return parts(slots.row, slots.col, slots.value);
    case 'sankey':
      return parts(
        slots.source && slots.target ? `${slots.source} → ${slots.target}` : slots.source ?? slots.target,
        slots.value,
      );
    case 'slope':
      return parts(slots.entity, slots.rank ?? slots.value, slots.period);
    case 'waterfall':
      return parts(slots.signed ?? slots.value, slots.period);
    default:
      return parts(slots.value, slots.share, slots.pct, slots.category, slots.period);
  }
}
