import { motion } from 'motion/react';

import type { CardView, TopicCard } from '../data/types';
import { Chart } from './Chart';
import { Badge } from './ui';

interface Props {
  card: TopicCard;
  view: CardView;
  typeLabels: Record<string, string>;
  href: string;
  onOpen: () => void;
}

export function TopicTile({ card, view, typeLabels, href, onOpen }: Props) {
  const chartView = {
    id: view.id,
    type: view.type,
    subject: view.subject,
    unit: view.unit,
    data: view.data,
  };
  const types = card.types.filter((type, index) => card.types.indexOf(type) === index);
  return (
    <motion.a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onOpen();
      }}
      className="card dv-tile group flex flex-col gap-3 rounded-[var(--radius-card)] p-3 no-underline transition"
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
    >
      <div className="pointer-events-none overflow-hidden rounded-[var(--radius-control)] bg-[var(--pane-solid)] p-2">
        <Chart view={chartView} data={view.data} features={[]} compact height={150} />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-1 pb-1">
        <span className="truncate text-[16px] font-semibold tracking-[-0.015em] text-[var(--fg)]">
          {card.title_en}
        </span>
        <div className="text-[12px] text-[var(--muted)]">{card.title_zh}</div>
        <div className="mt-1 text-[12px] leading-snug text-[var(--muted)]">{card.blurb_zh}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {types.map((type) => (
            <Badge key={type}>{typeLabels[type] ?? type}</Badge>
          ))}
        </div>
      </div>
    </motion.a>
  );
}
