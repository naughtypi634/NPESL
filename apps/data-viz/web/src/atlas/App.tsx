import { lazy, Suspense, useEffect, useMemo, useState } from 'react';

import { loadIndex } from './loader';
import { Home } from './pages/Home';
import { Charts } from './pages/Charts';
import { Expressions } from './pages/Expressions';
import { GroupPage } from './pages/GroupPage';
import { Contexts } from './pages/Contexts';

// 图表详情和场景详情才需要 ztd-charts；目录页只加载静态预览图。
const ChartPage = lazy(() => import('./pages/ChartPage').then((module) => ({ default: module.ChartPage })));
const ContextPage = lazy(() => import('./pages/ContextPage').then((module) => ({ default: module.ContextPage })));
import type { AtlasIndex } from './types';
import { A } from './components/chrome';

type Route =
  | { view: 'home' }
  | { view: 'charts' }
  | { view: 'chart'; id: string }
  | { view: 'expressions' }
  | { view: 'group'; id: string }
  | { view: 'contexts' }
  | { view: 'context'; id: string };

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [section, rawId] = hash.split('/');
  const id = rawId ? decodeURIComponent(rawId) : '';
  if (section === 'charts') return id ? { view: 'chart', id } : { view: 'charts' };
  if (section === 'expressions') return id ? { view: 'group', id } : { view: 'expressions' };
  if (section === 'contexts') return id ? { view: 'context', id } : { view: 'contexts' };
  return { view: 'home' };
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute());
  useEffect(() => {
    const onChange = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

function sectionOf(route: Route): string {
  if (route.view === 'charts' || route.view === 'chart') return 'charts';
  if (route.view === 'expressions' || route.view === 'group') return 'expressions';
  if (route.view === 'contexts' || route.view === 'context') return 'contexts';
  return '';
}

export default function App() {
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const route = useRoute();
  const active = sectionOf(route);

  useEffect(() => {
    let alive = true;
    loadIndex()
      .then((value) => {
        if (alive) setIndex(value);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [route]);

  const nav = useMemo(
    () => [
      { id: 'charts', href: '#/charts', label: 'Charts' },
      { id: 'expressions', href: '#/expressions', label: 'Expressions' },
      { id: 'contexts', href: '#/contexts', label: 'Contexts' },
    ],
    [],
  );

  let main;
  if (error) {
    main = (
      <div className="state">
        <p>{error}</p>
      </div>
    );
  } else if (!index) {
    main = (
      <div className="state">
        <p>Loading the atlas…</p>
      </div>
    );
  } else if (route.view === 'home') {
    main = <Home index={index} />;
  } else if (route.view === 'charts') {
    main = <Charts index={index} />;
  } else if (route.view === 'chart') {
    main = <ChartPage index={index} id={route.id} />;
  } else if (route.view === 'expressions') {
    main = <Expressions index={index} />;
  } else if (route.view === 'group') {
    main = <GroupPage index={index} id={route.id} />;
  } else if (route.view === 'contexts') {
    main = <Contexts index={index} />;
  } else {
    main = <ContextPage index={index} id={route.id} />;
  }

  return (
    <div className="atlas">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <A href="#/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-name">Data · English</span>
        </A>
        <nav className="nav" aria-label="Sections">
          {nav.map((item) => (
            <A
              key={item.id}
              href={item.href}
              className={`nav-link${active === item.id ? ' is-active' : ''}`}
            >
              {item.label}
            </A>
          ))}
        </nav>
      </header>
      <main id="main">
        <Suspense fallback={<div className="state"><p>Loading the chart…</p></div>}>{main}</Suspense>
      </main>
      <footer className="foot">
        <span>{index?.site.title_en ?? 'Data Visualization × English Expression Atlas'}</span>
        <span className="foot-note">{index?.site.footer_note ?? 'Demo data · 模拟数据'}</span>
      </footer>
    </div>
  );
}
