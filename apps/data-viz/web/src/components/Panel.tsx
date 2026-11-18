import type { EngineFeature } from '../engine';
import { DV } from '../engine';
import type { Level, Register, Tab, View, ViewData } from '../data/types';
import { TABS } from '../data/types';
import { kindLabel, orderedFeatures } from '../lib/features';
import { cap, cjkSpace } from '../lib/text';
import { useRoute } from '../lib/route-context';
import { useApp } from '../store/app';
import { DataTable } from './DataTable';
import { Badge, Button, Chip, SegButton, Segmented } from './ui';

interface PanelProps {
  view: View;
  live: View;
  features: EngineFeature[];
  library: import('../data/types').Library | null;
  edited: boolean;
  mark: string | null;
  onSelect: (mark: string) => void;
  onEdit: (data: ViewData) => void;
  onReset: () => void;
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

function capSentence(text: string): string {
  return cap(text);
}

function fillText(template: string | undefined, feature: EngineFeature): string {
  if (!template) return '';
  return cjkSpace(DV.fill(template, DV.gen.slots(feature.slots)));
}

export function Panel({
  view,
  live,
  features,
  library,
  edited,
  mark,
  onSelect,
  onEdit,
  onReset,
}: PanelProps) {
  const { route, go } = useRoute();
  const register = useApp((state) => state.register);
  const level = useApp((state) => state.level);
  const setRegister = useApp((state) => state.setRegister);
  const setLevel = useApp((state) => state.setLevel);
  const tab: Tab = route.tab ?? 'observe';
  const feature = mark ? features.find((item) => item.marks.includes(mark)) ?? null : null;
  const entry = feature && library ? library.features[feature.kind] ?? null : null;
  const list = orderedFeatures(features).sort(
    (a, b) => Number(a.auto !== false) - Number(b.auto !== false),
  );

  const setTab = (next: Tab) => go({ ...route, tab: next }, true);

  const sentence = feature && library ? capSentence(DV.gen.sentence(feature, library, register, level)) : '';
  const chinese = feature && library ? cjkSpace(DV.gen.chinese(feature, library, level)) : '';

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="grid w-full grid-cols-3 gap-2">
        {TABS.map((item) => (
          <Chip
            key={item.id}
            active={tab === item.id}
            onClick={() => setTab(item.id)}
            className="w-full text-center"
          >
            {item.label}
          </Chip>
        ))}
      </div>

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

      {tab === 'observe' && (
        <div className="flex flex-col gap-4">
          {feature ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{kindLabel(feature.kind, library)}</Badge>
                <span className="text-[11px] text-[var(--muted)]">{feature.marks.join(' · ')}</span>
              </div>
              {sentence && (
                <p className="dv-prose text-[15px]" lang="en">
                  {sentence}
                </p>
              )}
              {chinese && <p className="text-[13px] text-[var(--muted)]">{chinese}</p>}
              {feature.examples?.map((example, index) => (
                <div key={index} className="rounded-[12px] bg-[var(--well-fill)] px-3 py-2">
                  <p className="text-[13px] leading-relaxed" lang="en">
                    {example.en}
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--muted)]">{example.zh}</p>
                </div>
              ))}
              {feature.note_zh && (
                <p className="text-[12px] leading-relaxed text-[var(--muted)]">{feature.note_zh}</p>
              )}
              {feature.interpret_zh && (
                <p className="text-[12px] leading-relaxed text-[var(--muted)]">{feature.interpret_zh}</p>
              )}
              {entry?.traps?.map((trap, index) => (
                <div key={index} className="rounded-[12px] bg-[var(--well-fill)] px-3 py-2 text-[12px]">
                  <p lang="en" className="text-[var(--danger)] line-through">
                    {trap.wrong_en}
                  </p>
                  <p lang="en" className="mt-1">
                    {trap.right_en}
                  </p>
                  <p className="mt-1 text-[var(--muted)]">{trap.why_zh}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-[var(--muted)]">点图上的标记，或从下面的列表选一条观察。</p>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="dv-kicker">Observations</span>
            </div>
            <div className="dv-scroll flex max-h-72 flex-col gap-1 overflow-y-auto">
              {list.map((item) => {
                const selected = !!mark && item.marks.includes(mark);
                return (
                  <button
                    key={item.id || `${item.marks.join(',')}${item.kind}`}
                    type="button"
                    onClick={() => onSelect(item.marks[0])}
                    className="flex items-center justify-between gap-3 px-2.5 py-2 text-left text-[12px] transition hover:bg-[var(--state-fill)]"
                    aria-pressed={selected}
                  >
                    <span className={selected ? 'font-semibold' : ''}>
                      {kindLabel(item.kind, library)}
                    </span>
                    <span className="truncate text-[11px] text-[var(--muted)]">{item.marks[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'words' && (
        <div className="flex flex-col gap-3">
          {entry ? (
            <>
              <p className="text-[13px] text-[var(--muted)]">
                用来描述「{kindLabel(feature?.kind ?? '', library)}」的词。
              </p>
              <div className="flex flex-col gap-2">
                {(entry.words ?? []).map((word) => (
                  <div key={word.en} className="flex items-start justify-between gap-3 rounded-[12px] bg-[var(--well-fill)] px-3 py-2">
                    <div>
                      <p className="text-[14px] font-medium" lang="en">
                        {word.en}
                      </p>
                      <p className="text-[12px] text-[var(--muted)]">{word.zh}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-[var(--muted)]">
                      {word.register === 'spoken' ? '口语' : word.register === 'written' ? '书面' : '中性'}
                    </span>
                  </div>
                ))}
              </div>
              {(entry.compare ?? []).length > 0 && library && (
                <div className="mt-2 flex flex-col gap-2">
                  <span className="dv-kicker">近义辨析</span>
                  {(entry.compare ?? []).map((id) => {
                    const item = library.comparisons?.find((comp) => comp.id === id);
                    if (!item) return null;
                    return (
                      <div key={id} className="rounded-[12px] bg-[var(--well-fill)] px-3 py-2">
                        <p className="text-[13px] font-medium" lang="en">
                          {item.a} / {item.b}
                        </p>
                        <p className="mt-1 text-[12px] text-[var(--muted)]">{item.meaning_zh}</p>
                        <p className="mt-1 text-[12px] text-[var(--muted)]">{item.usage_zh}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="text-[13px] text-[var(--muted)]">先选一条观察，再看它对应的词。</p>
          )}
        </div>
      )}

      {tab === 'patterns' && (
        <div className="flex flex-col gap-3">
          {entry && feature ? (
            <>
              {(entry.patterns ?? []).map((pattern) => (
                <div key={pattern.id} className="rounded-[12px] bg-[var(--well-fill)] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Badge>{pattern.level.toUpperCase()}</Badge>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed" lang="en">
                    {cap(fillText(pattern.frame, feature))}
                  </p>
                  {pattern.zh_frame && (
                    <p className="mt-1 text-[12px] text-[var(--muted)]">{fillText(pattern.zh_frame, feature)}</p>
                  )}
                </div>
              ))}
              {entry.registers && (
                <div className="mt-2 flex flex-col gap-2">
                  <span className="dv-kicker">三种语境</span>
                  {(['general', 'ielts', 'business'] as const).map((key) => {
                    const text = entry.registers?.[key];
                    if (!text) return null;
                    return (
                      <div key={key} className="rounded-[12px] bg-[var(--well-fill)] px-3 py-2">
                        <p className="text-[11px] text-[var(--muted)]">
                          {key === 'general' ? '通用' : key === 'ielts' ? '雅思' : '商务'}
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed" lang="en">
                          {cap(fillText(text, feature))}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="text-[13px] text-[var(--muted)]">先选一条观察，再看可用的句型。</p>
          )}
        </div>
      )}

      {tab === 'describe' && (
        <div className="flex flex-col gap-3">
          {edited ? (
            library ? (
              Object.entries(DV.gen.levels(live, features, library)).map(([key, text]) => (
                <div key={key} className="rounded-[12px] bg-[var(--well-fill)] px-3 py-2">
                  <Badge>{key.toUpperCase()}</Badge>
                  <p className="mt-1.5 text-[13px] leading-relaxed" lang="en">
                    {cap(text)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-[13px] text-[var(--muted)]">语言包载入中…</p>
            )
          ) : (
            <>
              {view.overview_zh && <p className="text-[13px] leading-relaxed text-[var(--muted)]">{view.overview_zh}</p>}
              {(['a2', 'b1', 'b2'] as const).map((key) => {
                const text = view.descriptions?.general?.[key];
                if (!text) return null;
                return (
                  <div key={key} className="rounded-[12px] bg-[var(--well-fill)] px-3 py-2">
                    <Badge>{key.toUpperCase()}</Badge>
                    <p className="mt-1.5 text-[13px] leading-relaxed" lang="en">
                      {text}
                    </p>
                  </div>
                );
              })}
              {(['ielts', 'business'] as const).map((key) => {
                const text = view.descriptions?.[key];
                if (!text) return null;
                return (
                  <div key={key} className="rounded-[12px] bg-[var(--well-fill)] px-3 py-2">
                    <Badge>{key === 'ielts' ? 'IELTS' : 'Business'}</Badge>
                    <p className="mt-1.5 text-[13px] leading-relaxed" lang="en">
                      {text}
                    </p>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {tab === 'table' && (
        <div>
          <DataTable view={live} data={live.data ?? {}} />
        </div>
      )}

      {tab === 'edit' && (
        <div className="flex flex-col gap-3">
          <p className="text-[12px] leading-relaxed text-[var(--muted)]">
            改数值、类别名或系列名，图表和英语表达会按新数据重算。
          </p>
          <DataTable view={live} data={live.data ?? {}} onChange={onEdit} />
          {edited && (
            <Button onClick={onReset} className="self-start">
              恢复原始数据
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
