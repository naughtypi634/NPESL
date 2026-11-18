import { useEffect, useMemo } from 'react';

import type { Gallery } from '../data/types';
import { Chart } from '../components/Chart';
import { Panel } from '../components/Panel';
import { TopicTile } from '../components/TopicTile';
import { Badge, Card, Chip, Chips, Spinner } from '../components/ui';
import { featuresFor, featureIndex, liveView } from '../lib/features';
import { useRoute } from '../lib/route-context';
import { editKey, useApp } from '../store/app';

export function PlaygroundPicker({ gallery }: { gallery: Gallery }) {
  const { go } = useRoute();
  const typeLabels = useMemo(
    () =>
      Object.fromEntries(
        [...gallery.types].sort((a, b) => a.order - b.order).map((item) => [item.id, item.label_zh]),
      ),
    [gallery],
  );
  return (
    <section className="pb-16">
      <div className="pb-6 pt-6">
        <div className="dv-kicker">Interactive Playground</div>
        <h1 className="dv-display mt-2">选一张图，动手改数据。</h1>
        <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-[var(--muted)]">
          改数值、换视角、调参数，图表和英语表达会跟着实时重算。
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {gallery.topics.map((card) => (
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
    </section>
  );
}

export function PlaygroundSection() {
  const { route, go } = useRoute();
  const slug = route.slug ?? '';
  const topic = useApp((state) => state.topics[slug]);
  const loading = useApp((state) => state.topicLoading[slug]);
  const error = useApp((state) => state.topicErrors[slug]);
  const ensureTopic = useApp((state) => state.ensureTopic);
  const ensureLibrary = useApp((state) => state.ensureLibrary);
  const edits = useApp((state) => state.edits);
  const editData = useApp((state) => state.editData);
  const resetEdits = useApp((state) => state.resetEdits);
  const options = useApp((state) => state.options);
  const setOption = useApp((state) => state.setOption);
  const gallery = useApp((state) => state.gallery);

  useEffect(() => {
    void ensureTopic(slug);
  }, [slug, ensureTopic]);

  const view = useMemo(
    () => topic?.views.find((item) => item.id === route.view) ?? topic?.views[0],
    [topic, route.view],
  );
  const type = view?.type ?? '';
  const library = useApp((state) => state.libraries[type]);

  useEffect(() => {
    if (!topic) return;
    if (route.view && view && route.view !== view.id) {
      go({ ...route, view: view.id, mark: undefined }, true);
    }
  }, [topic, route.view, view, go, route]);

  useEffect(() => {
    if (type) void ensureLibrary(type);
  }, [type, ensureLibrary]);

  const key = view ? editKey(slug, view.id) : '';
  const edited = view ? edits[key] : undefined;
  const features = useMemo(() => (view ? featuresFor(view, edited) : []), [view, edited]);
  const live = useMemo(() => (view ? (edited ? liveView(view, edited) : view) : null), [view, edited]);
  const index = useMemo(() => featureIndex(features), [features]);
  const mark = route.mark ?? null;

  useEffect(() => {
    if (!features.length) return;
    if (mark && index[mark]) return;
    go({ ...route, mark: features[0].marks[0] }, true);
  }, [features, index, mark, go, route]);

  if (error) {
    return <p className="py-16 text-sm text-[var(--danger)]">{error}</p>;
  }
  if (!topic || !view || !live) {
    return <Spinner label={loading ? '载入主题…' : '准备图表…'} />;
  }

  const select = (next: string) => go({ ...route, mark: next, tab: 'observe' }, true);
  const supportsSmooth = view.type === 'line';
  const supportsSort = view.type === 'bar' || view.type === 'stacked';
  const supportsPercent = view.type === 'stacked';

  return (
    <section className="pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4 pt-6">
        <div className="min-w-0">
          <div className="dv-kicker">Interactive Playground</div>
          <h1 className="dv-title mt-1.5 truncate">{topic.title_en}</h1>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            {topic.title_zh} · {topic.blurb_zh}
          </p>
        </div>
      </div>

      {topic.views.length > 1 && (
        <div className="pb-4">
          <Chips>
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
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2 pb-2">
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold" lang="en">
                {view.label_en || topic.title_en}
              </h2>
              {view.subject && (
                <p className="mt-0.5 text-[12px] text-[var(--muted)]" lang="en">
                  {view.subject}
                </p>
              )}
            </div>
            <Badge>
              {gallery?.types.find((item) => item.id === view.type)?.label_zh ?? view.type}
            </Badge>
          </div>

          <Chart
            view={live}
            selected={mark}
            onSelect={select}
            height={400}
            smooth={options.smooth}
            labels={options.labels}
            sort={options.sort}
            percent={options.percent}
          />

          <div className="flex flex-wrap items-center gap-2 pt-3">
            {supportsSmooth && (
              <Chip active={options.smooth} onClick={() => setOption('smooth', !options.smooth)}>
                平滑曲线
              </Chip>
            )}
            <Chip active={options.labels} onClick={() => setOption('labels', !options.labels)}>
              显示数值
            </Chip>
            {supportsSort && (
              <Chip
                active={options.sort !== 'none'}
                onClick={() =>
                  setOption('sort', options.sort === 'none' ? 'desc' : options.sort === 'desc' ? 'asc' : 'none')
                }
              >
                {options.sort === 'none' ? '排序' : options.sort === 'desc' ? '降序' : '升序'}
              </Chip>
            )}
            {supportsPercent && (
              <Chip active={options.percent} onClick={() => setOption('percent', !options.percent)}>
                百分比
              </Chip>
            )}
            {edited && (
              <Chip
                active={false}
                onClick={() => {
                  resetEdits(key);
                  go({ ...route, mark: undefined }, true);
                }}
              >
                恢复原始数据
              </Chip>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <Panel
            view={view}
            live={live}
            features={features}
            library={library}
            edited={!!edited}
            mark={mark}
            onSelect={select}
            onEdit={(data) => editData(key, data)}
            onReset={() => resetEdits(key)}
          />
        </Card>
      </div>
    </section>
  );
}
