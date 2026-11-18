import type { Section } from '../data/types';
import { useRoute } from '../lib/route-context';
import { cn } from './ui';

const NAV: { id: Section; label: string; hash: string }[] = [
  { id: 'gallery', label: '图表画廊', hash: '#/gallery' },
  { id: 'play', label: '互动实验室', hash: '#/play' },
  { id: 'lab', label: '英语表达', hash: '#/lab' },
  { id: 'data', label: '真实数据', hash: '#/data' },
];

export function Header() {
  const { route, go } = useRoute();
  return (
    <header className="dv-header">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
        <a
          href="#/gallery"
          className="flex min-w-0 items-baseline gap-2 no-underline"
          onClick={(event) => {
            event.preventDefault();
            go({ section: 'gallery' });
          }}
        >
          <span className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--fg)]">
            Data Visualization Gallery
          </span>
          <span className="hidden text-[12px] text-[var(--muted)] sm:inline">数据图表英语</span>
        </a>
        <nav className="chips dv-scroll flex flex-1 gap-1.5 overflow-x-auto sm:justify-end" aria-label="主导航">
          {NAV.map((item) => (
            <a
              key={item.id}
              href={item.hash}
              aria-current={route.section === item.id ? 'page' : undefined}
              className={cn(
                'shrink-0 whitespace-nowrap px-3 py-1.5 text-[13px] font-medium no-underline',
                route.section === item.id && 'is-active',
              )}
              onClick={(event) => {
                event.preventDefault();
                go({ section: item.id, tab: 'observe' });
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
