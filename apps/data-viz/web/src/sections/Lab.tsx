import { useEffect, useMemo, useState } from 'react';

import type { EngineFeature } from '../engine';
import { DV } from '../engine';
import type { Gallery, Level, Library, Register, Topic, View } from '../data/types';
import { Chart } from '../components/Chart';
import { Badge, Button, Card, Chip, Chips, SegButton, Segmented, Spinner, Textarea, cn } from '../components/ui';
import { kindLabel, uniqueFeatures } from '../lib/features';
import { cap, cjkSpace } from '../lib/text';
import { useRoute } from '../lib/route-context';
import { useApp } from '../store/app';

interface Family {
  id: string;
  title: string;
  zh: string;
  test: (kind: string) => boolean;
}

const FAMILIES: Family[] = [
  {
    id: 'change',
    title: 'Increase / Decrease',
    zh: '上升与下降',
    test: (kind) =>
      kind.startsWith('rise_') ||
      kind.startsWith('fall_') ||
      ['increase_contributor', 'decrease_contributor', 'rank_up', 'rank_down', 'overtake'].includes(kind),
  },
  {
    id: 'stable',
    title: 'Remain Stable',
    zh: '保持稳定',
    test: (kind) => ['flat', 'plateau', 'stable_rank'].includes(kind),
  },
  {
    id: 'peak',
    title: 'Reach a Peak',
    zh: '到达峰值',
    test: (kind) =>
      ['peak', 'trough', 'peak_cell', 'low_cell', 'highest', 'lowest', 'largest_share', 'minority', 'majority', 'about_half'].includes(kind),
  },
  {
    id: 'fluctuate',
    title: 'Fluctuate',
    zh: '上下波动',
    test: (kind) => kind === 'fluctuate',
  },
  {
    id: 'compare',
    title: 'Compare / Contrast',
    zh: '比较与对比',
    test: (kind) =>
      [
        'small_gap',
        'similar_values',
        'ranking',
        'largest_component',
        'item',
        'composition',
        'pattern',
        'compare_periods',
        'main_path',
        'drop_off',
        'secondary_path',
        'merge',
        'split',
        'net_change',
        'outlier',
        'weak_or_none',
        'positive_strong',
        'positive_moderate',
        'negative_strong',
        'negative_moderate',
        'point',
        'cell',
        'largest_step',
        'offset',
      ].includes(kind),
  },
];

interface Sample {
  topic: Topic;
  view: View;
  feature: EngineFeature;
  mark: string;
}

const REGISTERS: { id: Register; label: string }[] = [
  { id: 'general', label: '通用' },
  { id: 'ielts', label: '雅思' },
  { id: 'business', label: '商务' },
];

const LEVELS: { id: Level; label: string }[] = [
  { id: 'a2', label: 'A2' },
  { id: 'b1', label: 'B1' },
  { id: 'b2', label: 'B2' },
];

function capLabel(text: string): string {
  return cap(text);
}

export function LabSection({ gallery }: { gallery: Gallery }) {
  const { route, go } = useRoute();
  const topics = useApp((state) => state.topics);
  const libraries = useApp((state) => state.libraries);
  const ensureTopic = useApp((state) => state.ensureTopic);
  const ensureLibrary = useApp((state) => state.ensureLibrary);
  const register = useApp((state) => state.register);
  const level = useApp((state) => state.level);
  const setRegister = useApp((state) => state.setRegister);
  const setLevel = useApp((state) => state.setLevel);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState('');
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const slugs = Object.keys(gallery.bundles.topics);
    void Promise.all(slugs.map((slug) => ensureTopic(slug))).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [gallery, ensureTopic]);

  const samples = useMemo(() => {
    const out: Record<string, Sample[]> = {};
    for (const family of FAMILIES) out[family.id] = [];
    for (const card of gallery.topics) {
      const topic = topics[card.id];
      if (!topic) continue;
      for (const view of topic.views) {
        for (const feature of uniqueFeatures(view.features ?? [])) {
          const family = FAMILIES.find((item) => item.test(feature.kind));
          if (!family) continue;
          const list = out[family.id];
          if (list.some((sample) => sample.topic.id === topic.id && sample.view.id === view.id)) continue;
          if (list.length >= 8) continue;
          list.push({ topic, view, feature, mark: feature.marks[0] });
        }
      }
    }
    return out;
  }, [gallery, topics]);

  const familyId = familyIdDefault(route.family);
  const family = FAMILIES.find((item) => item.id === familyId) ?? FAMILIES[0];
  const list = samples[family.id] ?? [];
  const sampleId = route.sample;
  const sample =
    list.find((item) => sampleId === `${item.topic.id}/${item.view.id}/${item.mark}`) ?? list[0] ?? null;
  const library: Library | null = sample ? libraries[sample.view.type] ?? null : null;

  useEffect(() => {
    if (sample) void ensureLibrary(sample.view.type);
  }, [sample, ensureLibrary]);

  useEffect(() => {
    const types = new Set<string>();
    for (const item of FAMILIES) {
      for (const entry of samples[item.id] ?? []) types.add(entry.view.type);
    }
    for (const type of types) void ensureLibrary(type);
  }, [samples, ensureLibrary]);

  useEffect(() => {
    setAttempt('');
    setReveal(false);
  }, [sample?.mark, sample?.view.id, sample?.topic.id]);

  if (!ready) return <Spinner label="载入主题…" />;
  if (!sample) {
    return <p className="py-16 text-sm text-[var(--muted)]">这个分类暂时还没有样例。</p>;
  }

  const sentence = library ? capLabel(DV.gen.sentence(sample.feature, library, register, level)) : '';
  const chinese = library ? cjkSpace(DV.gen.chinese(sample.feature, library, level)) : '';

  const models = library
    ? [
        ...LEVELS.map((item) => ({
          label: item.label,
          text: capLabel(DV.gen.sentence(sample.feature, library, register, item.id)),
        })),
        ...REGISTERS.filter((item) => item.id !== register).map((item) => ({
          label: item.label,
          text: capLabel(DV.gen.sentence(sample.feature, library, item.id, level)),
        })),
      ].filter((item, index, all) => item.text && all.findIndex((other) => other.text === item.text) === index)
    : [];

  return (
    <section className="pb-16">
      <div className="pb-5 pt-6">
        <div className="dv-kicker">English Expression Lab</div>
        <h1 className="dv-display mt-2">把变化说成一句话。</h1>
        <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-[var(--muted)]">
          同一种变化，A2 可以说，商务场合也可以说。先看、再仿写。
        </p>
      </div>

      <div className="dv-scroll -mx-1 overflow-x-auto px-1 pb-3">
        <Chips>
          {FAMILIES.map((item) => (
            <Chip
              key={item.id}
              active={family.id === item.id}
              onClick={() => go({ section: 'lab', family: item.id })}
            >
              {item.title}
            </Chip>
          ))}
        </Chips>
      </div>
      <p className="pb-4 text-[12px] text-[var(--muted)]">{family.zh}</p>

      <div className="dv-scroll -mx-1 mb-4 overflow-x-auto px-1">
        <div className="flex gap-2">
          {list.map((item) => {
            const id = `${item.topic.id}/${item.view.id}/${item.mark}`;
            const active = !!sample && id === `${sample.topic.id}/${sample.view.id}/${sample.mark}`;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => go({ section: 'lab', family: family.id, sample: id })}
                className={cn(
                  'card shrink-0 rounded-[var(--radius-card)] px-3 py-2 text-left text-[12px]',
                  active && 'ring-2 ring-[var(--blue)]',
                )}
              >
                <span className="block font-medium">{item.topic.title_zh}</span>
                <span className="block text-[11px] text-[var(--muted)]">
                  {kindLabel(item.feature.kind, libraries[item.view.type] ?? null)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2 pb-2">
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold" lang="en">
                {sample.topic.title_en}
              </h2>
              <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                {sample.topic.title_zh} · {sample.view.label_zh || sample.view.id}
              </p>
            </div>
            <Badge>{kindLabel(sample.feature.kind, library)}</Badge>
          </div>
          <Chart
            view={sample.view}
            selected={sample.mark}
            height={360}
            labels
            smooth
          />
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented aria-label="语域">
              {REGISTERS.map((item) => (
                <SegButton key={item.id} active={register === item.id} onClick={() => setRegister(item.id)}>
                  {item.label}
                </SegButton>
              ))}
            </Segmented>
            <Segmented aria-label="难度">
              {LEVELS.map((item) => (
                <SegButton key={item.id} active={level === item.id} onClick={() => setLevel(item.id)}>
                  {item.label}
                </SegButton>
              ))}
            </Segmented>
          </div>

          {library ? (
            <>
              <p className="text-[15px] leading-relaxed" lang="en">
                {sentence}
              </p>
              <p className="text-[13px] text-[var(--muted)]">{chinese}</p>
            </>
          ) : (
            <p className="text-[13px] text-[var(--muted)]">语言包载入中…</p>
          )}

          {sample.feature.examples?.map((example, index) => (
            <div key={index} className="rounded-[12px] bg-[var(--well-fill)] px-3 py-2">
              <p className="text-[13px] leading-relaxed" lang="en">
                {example.en}
              </p>
              <p className="mt-1 text-[12px] text-[var(--muted)]">{example.zh}</p>
            </div>
          ))}

          <div className="mt-2 flex flex-col gap-2">
            <span className="dv-kicker">Try it yourself</span>
            <Textarea
              value={attempt}
              onChange={(event) => setAttempt(event.target.value)}
              placeholder="用英语描述这张图的变化…"
              lang="en"
            />
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={() => setReveal((value) => !value)}>
                {reveal ? '收起参考' : '看参考表达'}
              </Button>
              {!attempt.trim() && <span className="text-[11px] text-[var(--muted)]">先写一句，再对照。</span>}
            </div>
            {reveal && (
              <div className="flex flex-col gap-2">
                {models.map((model) => (
                  <div key={model.label} className="rounded-[12px] bg-[var(--well-fill)] px-3 py-2">
                    <span className="text-[11px] text-[var(--muted)]">{model.label}</span>
                    <p className="mt-1 text-[13px] leading-relaxed" lang="en">
                      {model.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}

function familyIdDefault(requested: string | undefined): string {
  return FAMILIES.some((item) => item.id === requested) ? (requested as string) : 'change';
}
