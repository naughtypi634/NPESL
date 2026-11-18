import { useMemo } from 'react';

import { DOMAINS } from '../data/types';
import type { Domain, Gallery } from '../data/types';
import { TopicTile } from '../components/TopicTile';
import { Chip, Chips } from '../components/ui';
import { useRoute } from '../lib/route-context';

export function RealWorldSection({ gallery }: { gallery: Gallery }) {
  const { route, go } = useRoute();
  const active = DOMAINS.some((domain) => domain.id === route.domain)
    ? (route.domain as Domain)
    : null;
  const typeLabels = useMemo(
    () =>
      Object.fromEntries(
        [...gallery.types].sort((a, b) => a.order - b.order).map((item) => [item.id, item.label_zh]),
      ),
    [gallery],
  );

  return (
    <section className="pb-16">
      <div className="pb-5 pt-6">
        <div className="dv-kicker">Real-world Data</div>
        <h1 className="dv-display mt-2">真实场景里的数据。</h1>
        <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-[var(--muted)]">
          从商务到生活，每张图都对应一个能开口描述的场景。
        </p>
      </div>

      <div className="dv-scroll -mx-1 overflow-x-auto px-1 pb-6">
        <Chips>
          <Chip active={!active} onClick={() => go({ section: 'data' })}>
            全部
          </Chip>
          {DOMAINS.map((domain) => (
            <Chip
              key={domain.id}
              active={active === domain.id}
              onClick={() => go({ section: 'data', domain: domain.id })}
            >
              {domain.label_en} · {domain.label_zh}
            </Chip>
          ))}
        </Chips>
      </div>

      {DOMAINS.filter((domain) => !active || domain.id === active).map((domain) => {
        const cards = gallery.topics.filter((card) => card.domain === domain.id);
        if (!cards.length) return null;
        return (
          <div key={domain.id} className="mb-10">
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="text-[18px] font-semibold tracking-[-0.02em]">{domain.label_en}</h2>
              <span className="text-[13px] text-[var(--muted)]">{domain.label_zh}</span>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => (
                <TopicTile
                  key={card.id}
                  card={card}
                  typeLabels={typeLabels}
                  onOpen={(hash) => {
                    const [slug, view] = hash.replace('#/play/', '').split('/');
                    go({ section: 'play', slug, view, tab: 'observe' });
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
