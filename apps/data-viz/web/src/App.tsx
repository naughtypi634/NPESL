import { useCallback, useEffect, useRef, useState } from 'react';

import { Header } from './components/Header';
import { Spinner } from './components/ui';
import type { GoalId, Route } from './data/types';
import { parseHash, routeHash } from './lib/router';
import { RouteContext } from './lib/route-context';
import { Detail } from './sections/Detail';
import { Home } from './sections/Home';
import { useApp } from './store/app';

interface DebugApi {
  snapshot: () => Record<string, unknown>;
  selectMark: (mark: string) => void;
  setGoal: (goal: GoalId | null) => void;
  openTopic: (slug: string, view?: string) => void;
  open: (hash: string) => void;
  reset: () => void;
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash());
  const routeRef = useRef(route);
  routeRef.current = route;
  const gallery = useApp((state) => state.gallery);
  const galleryError = useApp((state) => state.galleryError);
  const loadGallery = useApp((state) => state.loadGallery);
  const edits = useApp((state) => state.edits);

  useEffect(() => {
    void loadGallery();
  }, [loadGallery]);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((next: Route, replace = false) => {
    const hash = routeHash(next);
    if (replace) {
      window.history.replaceState(null, '', hash);
    } else if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    setRoute(next);
  }, []);

  useEffect(() => {
    const canonical = routeHash(route);
    if (window.location.hash !== canonical) {
      window.history.replaceState(null, '', canonical);
    }
  }, [route]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.section, route.slug, route.view]);

  useEffect(() => {
    const api: DebugApi = {
      snapshot: () => ({
        section: routeRef.current.section,
        slug: routeRef.current.slug ?? null,
        view: routeRef.current.view ?? null,
        mark: routeRef.current.mark ?? null,
        goal: routeRef.current.goal ?? null,
        domain: routeRef.current.domain ?? null,
        type: routeRef.current.type ?? null,
        theme: document.documentElement.getAttribute('data-theme'),
        cards: document.querySelectorAll('.dv-tile').length,
        edits: Object.keys(useApp.getState().edits).length,
        text: document.body.innerText.slice(0, 500),
      }),
      selectMark: (mark) => {
        if (routeRef.current.section !== 'detail') return;
        go({ ...routeRef.current, mark }, true);
      },
      setGoal: (goal) => {
        go(
          {
            section: 'home',
            goal: goal ?? undefined,
            domain: routeRef.current.domain,
            type: routeRef.current.type,
          },
          true,
        );
      },
      openTopic: (slug, view) => {
        go({ section: 'detail', slug, view });
      },
      open: (hash) => {
        window.location.hash = hash;
      },
      reset: () => {
        const current = routeRef.current;
        if (!current.slug || !current.view) return;
        const key = `${current.slug}/${current.view}`;
        useApp.getState().resetEdits(key);
      },
    };
    (window as unknown as { __dv?: DebugApi }).__dv = api;
    return () => {
      (window as unknown as { __dv?: DebugApi }).__dv = undefined;
    };
  }, [go, edits]);

  let content;
  if (galleryError) {
    content = <p className="py-16 text-sm text-[var(--danger)]">{galleryError}</p>;
  } else if (!gallery) {
    content = <Spinner label="载入图表…" />;
  } else if (route.section === 'detail' && route.slug) {
    content = <Detail gallery={gallery} route={route} />;
  } else {
    content = <Home gallery={gallery} />;
  }

  return (
    <RouteContext.Provider value={{ route, go }}>
      <div className="dv-app">
        <Header />
        <main className="mx-auto max-w-[1240px] px-4">{content}</main>
        <footer className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-start gap-3 px-4 pb-12 pr-20 pt-2">
          <span className="badge rounded-full px-2.5 py-1 text-[11px] text-[var(--muted)]">
            Demo data · 模拟数据
          </span>
          <span className="text-[11px] text-[var(--muted)]">
            数据图表英语 · Data Visualization Gallery
          </span>
        </footer>
      </div>
    </RouteContext.Provider>
  );
}
