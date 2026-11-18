import type { Domain, GoalId, Route } from '../data/types';
import { DOMAINS, GOAL_IDS, VIEW_TYPE_IDS } from '../data/types';

function goalOf(value: string | null): GoalId | undefined {
  return GOAL_IDS.includes(value as GoalId) ? (value as GoalId) : undefined;
}

function domainOf(value: string | null): Domain | undefined {
  return DOMAINS.some((domain) => domain.id === value) ? (value as Domain) : undefined;
}

function typeOf(value: string | null): string | undefined {
  return VIEW_TYPE_IDS.includes(value as (typeof VIEW_TYPE_IDS)[number]) ? value ?? undefined : undefined;
}

function decode(value: string | undefined): string | undefined {
  return value ? decodeURIComponent(value) : undefined;
}

/**
 * Canonical routes:
 *   #/                       home, with goal/domain/type filters
 *   #/t/<slug>/<view>        detail, with goal/domain/type/mark
 *
 * Old routes (#/gallery, #/play/..., #/lab?family=..., #/data?domain=...)
 * are translated so existing links keep working.
 */
export function parseHash(hash: string = window.location.hash): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  const goal = goalOf(params.get('goal') ?? params.get('family'));
  const domain = domainOf(params.get('domain'));
  const type = typeOf(params.get('type'));

  if (parts[0] === 't' && parts[1]) {
    return {
      section: 'detail',
      slug: decode(parts[1]),
      view: decode(parts[2]),
      mark: decode(params.get('mark') ?? undefined),
      goal,
      domain,
      type,
    };
  }

  if (parts[0] === 'play' && parts[1]) {
    return {
      section: 'detail',
      slug: decode(parts[1]),
      view: decode(parts[2]),
      mark: decode(params.get('mark') ?? undefined),
      goal,
      domain,
      type,
    };
  }

  if (parts[0] === 'lab' || parts[0] === 'data') {
    return { section: 'home', goal, domain, type };
  }

  return { section: 'home', goal, domain, type };
}

export function routeHash(route: Route): string {
  const params = new URLSearchParams();
  if (route.goal) params.set('goal', route.goal);
  if (route.domain) params.set('domain', route.domain);
  if (route.type) params.set('type', route.type);

  if (route.section === 'detail' && route.slug) {
    if (route.mark) params.set('mark', route.mark);
    const parts = ['#/t', encodeURIComponent(route.slug)];
    if (route.view) parts.push(encodeURIComponent(route.view));
    const query = params.toString();
    return parts.join('/') + (query ? `?${query}` : '');
  }

  const query = params.toString();
  return `#/${query ? `?${query}` : ''}`;
}

export function navigate(route: Route): void {
  const hash = routeHash(route);
  if (window.location.hash === hash) return;
  window.location.hash = hash;
}
