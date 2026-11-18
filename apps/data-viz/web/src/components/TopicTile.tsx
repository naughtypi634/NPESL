import { motion } from 'motion/react';

import type { TopicCard } from '../data/types';
import { Chart } from './Chart';
import { Badge } from './ui';

interface Props {
  card: TopicCard;
  typeLabels: Record<string, string>;
  onOpen: (hash: string) => void;
  domainLabel?: string;
}

export function TopicTile({ card, typeLabels, onOpen, domainLabel }: Props) {
  const hash = `#/play/${card.id}/${card.default_view}`;
  const view = {
    id: card.default_view,
    type: card.primary.type,
    subject: card.primary.subject,
    unit: card.primary.unit,
    data: card.primary.data,
  };
  return (
    <motion.a
      href={hash}
      onClick={(event) => {
        event.preventDefault();
        onOpen(hash);
      }}
      className="card dv-tile group flex flex-col gap-3 rounded-[var(--radius-card)] p-3 no-underline transition"
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
    >
      <div className="overflow-hidden rounded-[var(--radius-control)] bg-[var(--pane-solid)] p-2">
        <Chart view={view} compact height={150} />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-1 pb-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[16px] font-semibold tracking-[-0.015em] text-[var(--fg)]">
            {card.title_en}
          </span>
          {domainLabel && <span className="shrink-0 text-[11px] text-[var(--muted)]">{domainLabel}</span>}
        </div>
        <div className="text-[12px] text-[var(--muted)]">{card.title_zh}</div>
        <div className="mt-1 text-[12px] leading-snug text-[var(--muted)]">{card.blurb_zh}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.types.map((type) => (
            <Badge key={type}>{typeLabels[type] ?? type}</Badge>
          ))}
        </div>
      </div>
    </motion.a>
  );
}
