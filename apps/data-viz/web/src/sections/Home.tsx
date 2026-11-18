import { useMemo } from 'react';

import type { CardView, Gallery, GoalId } from '../data/types';
import { DOMAINS } from '../data/types';
import { routeHash } from '../lib/router';
import { useRoute } from '../lib/route-context';
import { TopicTile } from '../components/TopicTile';
import { Chip, Chips } from '../components/ui';

export function Home({ gallery }: { gallery: Gallery }) {
  const { route, go } = useRoute();
  const goals = gallery.goals;
  const types = useMemo(
    () => [...gallery.types].sort((a, b) => a.order - b.order),
    [gallery.types],
  );
  const typeLabels = useMemo(
    () => Object.fromEntries(types.map((type) => [type.id, type.label_zh])),
    [types],
  );

  const goal = route.goal;
  const domain = route.domain;
  const type = route.type;

  const matchingView = (card: Gallery['topics'][number]): CardView | undefined => {
    const candidates = card.views.filter(
      (view) => (!type || view.type === type) && (!goal || view.goals.includes(goal)),
    );
    if (!candidates.length) return undefined;
    return candidates.find((view) => view.id === card.default_view) ?? candidates[0];
  };

  const cards = useMemo(
    () =>
      [...gallery.topics]
        .sort((a, b) => a.order - b.order)
        .filter((card) => !domain || card.domain === domain)
        .map((card) => ({ card, view: matchingView(card) }))
        .filter((item): item is { card: Gallery['topics'][number]; view: CardView } => !!item.view),
    [gallery.topics, domain, goal, type],
  );

  const setGoal = (next: GoalId) => {
    go(
      {
        section: 'home',
        goal: goal === next ? undefined : next,
        domain,
        type,
      },
      true,
    );
  };

  const clear = () => go({ section: 'home' }, true);

  return (
    <section className="pb-16">
      <div className="pb-5 pt-6">
        <h1 className="dv-display">看图，说出变化。</h1>
        <div className="mt-5 flex flex-wrap items-baseline gap-3">
          <span className="text-[14px] font-semibold text-[var(--fg)]">我想学</span>
          <Chips className="pb-0">
            {goals.map((item) => (
              <Chip
                key={item.id}
                active={goal === item.id}
                onClick={() => setGoal(item.id)}
              >
                {item.label_zh}
              </Chip>
            ))}
          </Chips>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="dv-domain">
            领域
          </label>
          <select
            id="dv-domain"
            className="dv-field h-9 min-w-[132px] px-2 text-[13px] outline-none"
            value={domain ?? ''}
            onChange={(event) =>
              go(
                {
                  section: 'home',
                  goal,
                  domain: (event.target.value || undefined) as typeof domain,
                  type,
                },
                true,
              )
            }
          >
            <option value="">全部领域</option>
            {DOMAINS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label_zh}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="dv-type">
            图表类型
          </label>
          <select
            id="dv-type"
            className="dv-field h-9 min-w-[132px] px-2 text-[13px] outline-none"
            value={type ?? ''}
            onChange={(event) =>
              go(
                {
                  section: 'home',
                  goal,
                  domain,
                  type: event.target.value || undefined,
                },
                true,
              )
            }
          >
            <option value="">全部图表</option>
            {types.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label_zh}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ card, view }) => (
          <TopicTile
            key={`${card.id}-${view.id}`}
            card={card}
            view={view}
            typeLabels={typeLabels}
            href={routeHash({
              section: 'detail',
              slug: card.id,
              view: view.id,
              goal,
              domain,
              type,
            })}
            onOpen={() =>
              go({
                section: 'detail',
                slug: card.id,
                view: view.id,
                goal,
                domain,
                type,
              })
            }
          />
        ))}
      </div>

      {cards.length === 0 && (
        <div className="mt-6 flex flex-col items-start gap-3 py-10">
          <p className="text-sm text-[var(--muted)]">这一组条件还没有图。</p>
          <button type="button" className="pill px-4 py-2 text-[13px]" onClick={clear}>
            清除筛选
          </button>
        </div>
      )}
    </section>
  );
}
