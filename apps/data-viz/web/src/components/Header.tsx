import { useRoute } from '../lib/route-context';

export function Header() {
  const { route, go } = useRoute();
  const home = {
    section: 'home' as const,
    goal: route.goal,
    domain: route.domain,
    type: route.type,
  };
  return (
    <header className="dv-header">
      <div className="mx-auto flex max-w-[1240px] items-center gap-4 px-4 py-3">
        {route.section === 'detail' && (
          <a
            href="#/"
            className="shrink-0 text-[13px] font-medium text-[var(--muted)] no-underline hover:text-[var(--fg)]"
            onClick={(event) => {
              event.preventDefault();
              go(home);
            }}
          >
            ← 全部图表
          </a>
        )}
        <a
          href="#/"
          className="flex min-w-0 items-baseline gap-2 no-underline"
          onClick={(event) => {
            event.preventDefault();
            go(home);
          }}
        >
          <span className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--fg)]">
            Data Visualization Gallery
          </span>
          <span className="hidden text-[12px] text-[var(--muted)] sm:inline">数据图表英语</span>
        </a>
      </div>
    </header>
  );
}
