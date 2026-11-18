import { useEffect, useMemo, useState } from 'react';

import type { EngineFeature } from '../engine';
import type { Gallery, Route, Topic, View } from '../data/types';
import { Chart } from '../components/Chart';
import { EditBar } from '../components/EditBar';
import { InsightPanel } from '../components/InsightPanel';
import { Chip, Chips, Spinner } from '../components/ui';
import {
  authorForMark,
  featureForAuthorGroup,
  featureForMark,
  featuresFor,
  kindLabel,
  observationList,
  orderedFeatures,
  preselectFeature,
} from '../lib/features';
import { featureSummary } from '../lib/feature-summary';
import { useRoute } from '../lib/route-context';
import { editKey, useApp } from '../store/app';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function SankeyLegend({ view }: { view: View }) {
  const nodes = view.data?.nodes ?? [];
  if (view.type !== 'sankey' || !nodes.length) return null;
  const columns = view.data?.columns?.length
    ? view.data.columns
    : [nodes.map((node) => node.id)];
  return (
    <div
      className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--rule)] px-1 pt-3 text-[11px] text-[var(--muted)]"
      aria-label="图表节点"
    >
      {columns.map((ids, columnIndex) => (
        <div key={columnIndex} className="flex min-w-[110px] flex-col gap-1">
          {ids.map((id) => {
            const nodeIndex = nodes.findIndex((node) => node.id === id);
            const node = nodes[nodeIndex];
            if (!node) return null;
            return (
              <span key={id} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: `var(--dv-${(nodeIndex % 8) + 1})` }}
                />
                {node.name_en}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function chooseView(topic: Topic | undefined, route: Route, gallery: Gallery): View | undefined {
  if (!topic) return undefined;
  const routeView = route.view ? topic.views.find((view) => view.id === route.view) : undefined;
  if (routeView) return routeView;
  const card = gallery.topics.find((item) => item.id === topic.id);
  const fallback = card?.default_view
    ? topic.views.find((view) => view.id === card.default_view)
    : undefined;
  return fallback ?? topic.views[0];
}

export function Detail({ gallery, route }: { gallery: Gallery; route: Route }) {
  const { go } = useRoute();
  const topics = useApp((state) => state.topics);
  const topicErrors = useApp((state) => state.topicErrors);
  const ensureTopic = useApp((state) => state.ensureTopic);
  const libraries = useApp((state) => state.libraries);
  const libraryLoading = useApp((state) => state.libraryLoading);
  const ensureLibrary = useApp((state) => state.ensureLibrary);
  const edits = useApp((state) => state.edits);
  const editData = useApp((state) => state.editData);
  const resetEdits = useApp((state) => state.resetEdits);
  const [selectedMark, setSelectedMark] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const slug = route.slug ?? '';
  const topic = topics[slug];
  const topicError = topicErrors[slug];
  const view = chooseView(topic, route, gallery);
  const key = view ? editKey(slug, view.id) : '';
  const edited = key ? edits[key] : undefined;
  const data = edited ?? view?.data ?? {};
  const library = view ? libraries[view.type] ?? null : null;
  const loadingLibrary = view ? !!libraryLoading[view.type] : false;

  const features = useMemo(
    () => (view ? featuresFor(view, edited) : []),
    [view, edited],
  );

  useEffect(() => {
    if (!slug) return;
    void ensureTopic(slug);
  }, [slug, ensureTopic]);

  useEffect(() => {
    if (!view) return;
    void ensureLibrary(view.type);
  }, [view, ensureLibrary]);

  useEffect(() => {
    if (!view) return;
    if (route.view !== view.id) {
      go({ ...route, view: view.id, mark: undefined }, true);
    }
  }, [go, route, view]);

  useEffect(() => {
    if (!view) return;
    const preferred = preselectFeature(
      view,
      edited,
      route.mark,
      route.goal,
      gallery.kind_goals,
    );
    const routeMarkIsValid =
      !!route.mark && (view.features ?? []).some((feature) => feature.marks.includes(route.mark!));
    const mark = routeMarkIsValid ? route.mark! : preferred?.marks[0] ?? null;
    setSelectedMark(mark);
    if (mark && route.mark !== mark) {
      go({ ...route, view: view.id, mark }, true);
    }
    // Selection is re-derived when the route or the view changes, not on
    // every edit; dragging must keep the same point selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, view?.id, route.goal, route.mark, gallery.kind_goals]);

  useEffect(() => {
    if (!view) return;
    const target = window as unknown as {
      __dvView?: { slug: string; view: string; type: string; data: unknown; marks: unknown[] };
    };
    target.__dvView = {
      slug,
      view: view.id,
      type: view.type,
      data,
      marks: features.map((feature) => ({
        kind: feature.kind,
        marks: feature.marks,
        auto: feature.auto,
        id: feature.id,
      })),
    };
    return () => {
      if (target.__dvView?.view === view.id) target.__dvView = undefined;
    };
  }, [slug, view, data, features]);

  useEffect(() => {
    setEditing(false);
  }, [view?.id]);

  const selectedFeature = featureForMark(features, selectedMark);
  const author = view ? authorForMark(view, selectedMark) : undefined;
  const displayFeature = useMemo(
    () => (author && view ? featureForAuthorGroup(view, edited, author) : selectedFeature),
    [author, view, edited, selectedFeature],
  );
  const highlightMarks = useMemo(() => {
    if (author) return author.marks;
    return selectedFeature?.marks ?? [];
  }, [author, selectedFeature]);

  const nav = useMemo(
    () =>
      view
        ? (() => {
            const listed = observationList(view, edited, route.goal, gallery.kind_goals);
            return listed.length ? listed : orderedFeatures(features);
          })()
        : [],
    [view, edited, route.goal, gallery.kind_goals, features],
  );
  const navIndex = displayFeature
    ? nav.findIndex((feature) =>
        feature.id && displayFeature.id
          ? feature.id === displayFeature.id
          : feature.marks.join('|') === displayFeature.marks.join('|'),
      )
    : -1;
  const prevFeature: EngineFeature | null = navIndex > 0 ? nav[navIndex - 1] : null;
  const nextFeature: EngineFeature | null =
    navIndex >= 0 ? nav[navIndex + 1] ?? null : nav[0] ?? null;

  const selectMark = (mark: string) => {
    setSelectedMark(mark);
    go({ ...route, view: view?.id, mark }, true);
  };

  const selectFeature = (feature: EngineFeature) => {
    selectMark(feature.marks[0]);
  };

  const tooltipHtml = (mark: string) => {
    const feature = featureForMark(features, mark);
    if (!feature) return '';
    const summary = featureSummary(feature, view!);
    return `<div class="dv-tip-title">${escapeHtml(kindLabel(feature.kind, library))}</div>${
      summary ? `<div class="dv-tip-value">${escapeHtml(summary)}</div>` : ''
    }`;
  };

  if (topicError) {
    return (
      <div className="flex flex-col items-start gap-3 py-16">
        <p className="text-sm text-[var(--danger)]">这张图暂时没加载出来。</p>
        <button type="button" className="pill px-4 py-2 text-[13px]" onClick={() => void ensureTopic(slug)}>
          重试
        </button>
      </div>
    );
  }

  if (!topic || !view) {
    return <Spinner label="载入图表…" />;
  }

  return (
    <section className="pb-16">
      <div className="flex flex-col gap-2 pb-5 pt-6">
        <h1 className="dv-display">{topic.title_en}</h1>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--muted)]">
          <span>{topic.title_zh}</span>
          {topic.scene_zh && <span>· {topic.scene_zh}</span>}
        </div>
        {topic.views.length > 1 && (
          <Chips className="pb-0">
            {topic.views.map((item) => (
              <Chip
                key={item.id}
                active={item.id === view.id}
                onClick={() => go({ ...route, view: item.id, mark: undefined }, true)}
              >
                {item.label_zh || item.id}
              </Chip>
            ))}
          </Chips>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="card rounded-[var(--radius-card)] p-3">
            {view.subtitle_en && (
              <p className="px-1 pb-2 text-[12px] leading-relaxed text-[var(--muted)]">
                {view.subtitle_en}
              </p>
            )}
            <Chart
              view={view}
              data={data}
              features={features}
              selectedMarks={highlightMarks}
              onSelect={selectMark}
              onEdit={editing ? (next) => editData(key, next) : undefined}
              editable={editing}
              height={420}
              tooltipHtml={tooltipHtml}
              label={view.subject || view.label_en || topic.title_en}
            />
            <SankeyLegend view={view} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Chip active={editing} onClick={() => setEditing((value) => !value)}>
              编辑数据
            </Chip>
            {editing && (
              <span className="text-[12px] text-[var(--muted)]">
                拖动图上的点、柱或饼图边缘；也可以用下面的输入框精确改。
              </span>
            )}
          </div>

          {editing && (
            <EditBar
              view={view}
              data={data}
              selectedMark={selectedMark}
              edited={!!edited}
              onChange={(next) => editData(key, next)}
              onReset={() => resetEdits(key)}
            />
          )}
        </div>

        {loadingLibrary && !library ? (
          <Spinner label="载入说法…" />
        ) : (
          <InsightPanel
            view={view}
            library={library}
            features={features}
            feature={displayFeature}
            author={author}
            edited={!!edited}
            goal={route.goal}
            gallery={gallery}
            hasPrev={!!prevFeature}
            hasNext={!!nextFeature}
            onPrev={() => prevFeature && selectFeature(prevFeature)}
            onNext={() => nextFeature && selectFeature(nextFeature)}
          />
        )}
      </div>
    </section>
  );
}
