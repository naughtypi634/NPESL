import { useCallback, useEffect, useRef, useState } from 'react';

import { Header } from './components/Header';
import { Spinner } from './components/ui';
import type { Route, Tab } from './data/types';
import { parseHash, routeHash } from './lib/router';
import { RouteContext } from './lib/route-context';
import { GallerySection } from './sections/Gallery';
import { LabSection } from './sections/Lab';
import { PlaygroundPicker, PlaygroundSection } from './sections/Playground';
import { RealWorldSection } from './sections/RealWorld';
import { useApp } from './store/app';

interface DebugApi {
  snapshot: () => Record<string, unknown>;
  select: (mark: string) => void;
  setTab: (tab: Tab) => void;
  open: (hash: string) => void;
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
    window.scrollTo(0, 0);
  }, [route.section]);

  useEffect(() => {
    const api: DebugApi = {
      snapshot: () => ({
        section: routeRef.current.section,
        slug: routeRef.current.slug ?? null,
        view: routeRef.current.view ?? null,
        mark: routeRef.current.mark ?? null,
        tab: routeRef.current.tab ?? null,
        family: routeRef.current.family ?? null,
        domain: routeRef.current.domain ?? null,
        theme: document.documentElement.getAttribute('data-theme'),
        cards: document.querySelectorAll('.dv-tile').length,
        marks: document.querySelectorAll('[data-mark]').length,
        edits: Object.keys(edits).length,
        text: document.body.innerText.slice(0, 400),
      }),
      select: (mark) => go({ ...routeRef.current, mark, tab: 'observe' }, true),
      setTab: (tab) => go({ ...routeRef.current, tab }, true),
      open: (hash) => {
        window.location.hash = hash;
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
    content = <Spinner label="载入画廊…" />;
  } else if (route.section === 'gallery') {
    content = <GallerySection gallery={gallery} />;
  } else if (route.section === 'play') {
    content = route.slug ? <PlaygroundSection /> : <PlaygroundPicker gallery={gallery} />;
  } else if (route.section === 'lab') {
    content = <LabSection gallery={gallery} />;
  } else {
    content = <RealWorldSection gallery={gallery} />;
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
