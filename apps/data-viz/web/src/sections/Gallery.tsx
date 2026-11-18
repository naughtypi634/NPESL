import { useMemo, useState } from 'react';

import type { Gallery } from '../data/types';
import { useRoute } from '../lib/route-context';
import { TopicTile } from '../components/TopicTile';
import { Chip, Chips } from '../components/ui';

export function GallerySection({ gallery }: { gallery: Gallery }) {
  const { go } = useRoute();
  const [type, setType] = useState('all');
  const types = useMemo(() => [...gallery.types].sort((a, b) => a.order - b.order), [gallery]);
  const typeLabels = useMemo(
    () => Object.fromEntries(types.map((item) => [item.id, item.label_zh])),
    [types],
  );
  const cards = useMemo(
    () => (type === 'all' ? gallery.topics : gallery.topics.filter((card) => card.types.includes(type))),
    [gallery.topics, type],
  );

  return (
    <section className="pb-16">
      <div className="pb-6 pt-6">
        <div className="dv-kicker">Chart Gallery</div>
        <h1 className="dv-display mt-2">看图，说出变化。</h1>
        <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-[var(--muted)]">
          挑一张图，先观察它怎么变，再学怎么用英语把它说清楚。
        </p>
      </div>

      <div className="dv-scroll -mx-1 overflow-x-auto px-1 pb-4">
        <Chips>
          <Chip active={type === 'all'} onClick={() => setType('all')}>
            全部
          </Chip>
          {types.map((item) => (
            <Chip key={item.id} active={type === item.id} onClick={() => setType(item.id)}>
              {item.label_zh}
            </Chip>
          ))}
        </Chips>
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
      {cards.length === 0 && (
        <p className="py-10 text-sm text-[var(--muted)]">这个类型还没有图。</p>
      )}
    </section>
  );
}
