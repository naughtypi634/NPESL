import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChartSpec } from 'ztd-charts';
import type { AtlasIndex, ChartLesson } from '../types';
import { loadChart } from '../loader';
import { useAsync } from '../use-async';
import { ChartFigure } from '../components/ChartFigure';
import { DataEditor } from '../components/DataEditor';
import { LiveEnglishInsights, LiveEnglishVersions } from '../components/LiveEnglish';
import { A, Breadcrumb, Eyebrow, Section } from '../components/chrome';
import {
  describeMetrics,
  getChartRows,
  getPreferredMetric,
  type ChartRow,
} from '../data-tools';
import { analyzeChart, specWithAnalysis } from '../live';

const NAV_ITEMS = [
  { id: 'chart-workspace', label: 'Chart & data' },
  { id: 'read', label: 'How to read' },
  { id: 'live-english', label: 'Live English' },
  { id: 'observations', label: 'Observations' },
  { id: 'expressions', label: 'Expressions' },
  { id: 'versions', label: 'Descriptions' },
  { id: 'notes', label: 'Language' },
];

function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? '');
  useEffect(() => {
    const onScroll = () => {
      let current = ids[0] ?? '';
      for (const id of ids) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= 140) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
    // ids is a module-level constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return active;
}

function OriginalObservations({ lesson }: { lesson: ChartLesson }) {
  return (
    <ul className="observation-list">
      {lesson.observations.map((item) => (
        <li key={item.en}>
          <p className="obs-en">{item.en}</p>
          <p className="obs-zh">{item.zh}</p>
        </li>
      ))}
    </ul>
  );
}

function CuratedVersions({ lesson }: { lesson: ChartLesson }) {
  return (
    <div className="versions">
      {(
        [
          ['academic', 'Academic writing', '学术写作'],
          ['business', 'Business presentation', '商务汇报'],
          ['simple', 'Simple English', '日常英语'],
        ] as const
      ).map(([key, label, labelZh]) => (
        <article className="version" key={key}>
          <header>
            <h3>{label}</h3>
            <span>{labelZh}</span>
          </header>
          <p className="version-en">{lesson.descriptions[key].en}</p>
          <p className="version-zh">{lesson.descriptions[key].zh}</p>
        </article>
      ))}
    </div>
  );
}

export function ChartPage({ index, id }: { index: AtlasIndex; id: string }) {
  const { data: lesson, error } = useAsync(() => loadChart(id), id);
  const summary = index.charts.find((chart) => chart.id === id);
  const family = index.families.find((item) => item.id === (lesson?.family ?? summary?.family));

  const [editedRows, setEditedRows] = useState<ChartRow[] | null>(null);
  const [history, setHistory] = useState<ChartRow[][]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState('');
  const activeSection = useActiveSection(NAV_ITEMS.map((item) => item.id));

  useEffect(() => {
    setEditedRows(null);
    setHistory([]);
    setEditorOpen(false);
    setSelectedMetric('');
  }, [id]);

  useEffect(() => {
    if (!editorOpen) return;
    if (!window.matchMedia('(max-width: 960px)').matches) return;
    const timer = window.setTimeout(() => {
      const editor = document.querySelector('.data-editor');
      if (!editor) return;
      const top = editor.getBoundingClientRect().top + window.scrollY - 64;
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [editorOpen]);

  const originalRows = useMemo(() => (lesson ? getChartRows(lesson.spec) : []), [lesson]);
  const currentRows = editedRows ?? originalRows;
  const metricOptions = useMemo(
    () => (lesson ? describeMetrics(id, lesson.spec, currentRows) : []),
    [id, lesson, currentRows],
  );
  const defaultMetric = useMemo(
    () => (lesson ? getPreferredMetric(lesson.spec, currentRows) : ''),
    [lesson, currentRows],
  );
  const activeMetric = metricOptions.includes(selectedMetric)
    ? selectedMetric
    : metricOptions.includes(defaultMetric)
      ? defaultMetric
      : metricOptions[0] ?? defaultMetric;
  const analysis = useMemo(
    () => (lesson
      ? analyzeChart({
          chart: id,
          spec: lesson.spec,
          rows: currentRows,
          dataset: lesson.dataset,
          metric: activeMetric,
        })
      : null),
    [id, lesson, currentRows, activeMetric],
  );
  const currentSpec: ChartSpec | null = useMemo(
    () => (lesson ? specWithAnalysis(lesson.spec, currentRows, analysis) : null),
    [lesson, currentRows, analysis],
  );
  const isEdited = editedRows !== null;

  const updateRows = useCallback((next: ChartRow[]) => {
    setHistory((stack) => [...stack, currentRows].slice(-20));
    setEditedRows(next);
  }, [currentRows]);

  const undo = useCallback(() => {
    setHistory((stack) => {
      if (!stack.length) return stack;
      const previous = stack[stack.length - 1];
      setEditedRows(previous === originalRows ? null : previous);
      return stack.slice(0, -1);
    });
  }, [originalRows]);

  const reset = useCallback(() => {
    setEditedRows(null);
    setHistory([]);
  }, []);

  const jumpTo = useCallback((target: string) => {
    if (target === 'chart-workspace') {
      setEditorOpen(false);
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    if (editorOpen) setEditorOpen(false);
    const scrollTo = (element: HTMLElement) => {
      const top = element.getBoundingClientRect().top + window.scrollY - 84;
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
    };
    const present = document.getElementById(target);
    if (present) {
      scrollTo(present);
      return;
    }
    const scrollWhenReady = (attempt: number) => {
      const element = document.getElementById(target);
      if (element) {
        scrollTo(element);
        return;
      }
      if (attempt < 30) window.requestAnimationFrame(() => scrollWhenReady(attempt + 1));
    };
    window.requestAnimationFrame(() => scrollWhenReady(0));
  }, [editorOpen]);

  if (error) {
    return (
      <div className="page">
        <div className="state">
          <p>{error}</p>
          <A href="#/charts" className="text-link">Back to charts</A>
        </div>
      </div>
    );
  }

  if (!lesson || !currentSpec) {
    return (
      <div className="page">
        <div className="state">
          <p>Loading the chart…</p>
        </div>
      </div>
    );
  }

  const groupName = (groupId: string) =>
    index.expressions.find((group) => group.id === groupId)?.name_en ?? groupId;
  const chartName = (chartId: string) =>
    index.charts.find((chart) => chart.id === chartId)?.name_en ?? chartId;
  const contextName = (contextId: string) =>
    index.contexts.find((context) => context.id === contextId)?.name_en ?? contextId;

  return (
    <div className="page chart-page">
      <Breadcrumb
        items={[
          { href: '#/charts', label: 'Charts' },
          ...(family ? [{ href: '#/charts', label: family.name_en }] : []),
          { label: lesson.name_en },
        ]}
      />

      <header className="chart-head">
        <Eyebrow>{family ? `${family.name_en} · ${family.name_zh}` : 'Chart'}</Eyebrow>
        <h1>{lesson.name_en}</h1>
        <p className="chart-head-zh">{lesson.name_zh}</p>
        <p className="chart-head-what">{summary?.what_zh}</p>
        {summary?.focus?.length ? (
          <div className="focus-row">
            <span className="focus-label">Language focus</span>
            {summary.focus.map((groupId) => (
              <A key={groupId} href={`#/expressions/${groupId}`} className="chip">
                {groupName(groupId)}
              </A>
            ))}
          </div>
        ) : null}
      </header>

      <nav className="chart-local-nav" aria-label="On this chart page">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeSection === item.id ? 'is-active' : undefined}
            aria-current={activeSection === item.id ? 'location' : undefined}
            onClick={() => jumpTo(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className={`chart-learning-layout${editorOpen ? ' is-editing' : ''}`}>
        <aside className="chart-workspace" id="chart-workspace">
          <ChartFigure lesson={lesson} spec={currentSpec} height={editorOpen ? 300 : 380} />
          <div className="chart-workspace-actions">
            <button
              type="button"
              className="edit-data-button"
              aria-expanded={editorOpen}
              onClick={() => setEditorOpen((open) => !open)}
            >
              <span aria-hidden="true">✎</span>
              {editorOpen ? 'Close editor' : 'Edit data'}
            </button>
            {isEdited ? (
              <>
                <button type="button" className="reset-data-button" onClick={undo} disabled={!history.length}>
                  Undo
                </button>
                <button type="button" className="reset-data-button" onClick={reset}>
                  Restore original
                </button>
              </>
            ) : null}
          </div>
          <p className="chart-edit-hint">
            {isEdited
              ? 'Edited data · chart, live analysis and English descriptions are updated together.'
              : 'Try changing a value. The chart, the analysis and the English descriptions update together.'}
          </p>
        </aside>

        <div className="chart-learning-content">
          {editorOpen ? (
            <DataEditor
              rows={currentRows}
              originalRows={originalRows}
              spec={lesson.spec}
              dataset={lesson.dataset}
              analysis={analysis}
              edited={isEdited}
              selectedMetric={activeMetric}
              onRowsChange={updateRows}
              onReset={reset}
              onClose={() => setEditorOpen(false)}
              onUndo={undo}
              canUndo={history.length > 0}
            />
          ) : (
            <>
              <Section kicker="01" title="How to read it" titleEn="Understanding the chart" id="read">
                <div className="read-grid">
                  <div className="read-main">
                    <p>{lesson.understanding.read_zh}</p>
                    <h3 className="mini-head">最值得注意</h3>
                    <ul className="tick-list">
                      {lesson.understanding.look_for_zh.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <dl className="element-list">
                    {lesson.understanding.elements.map((element) => (
                      <div key={element.name_en} className="element">
                        <dt>
                          {element.name_en}
                          <span>{element.name_zh}</span>
                        </dt>
                        <dd>{element.note_zh}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </Section>

              <Section kicker="02" title="What the data says" titleEn="Live statistics from the current data" id="live-english">
                <LiveEnglishInsights
                  analysis={analysis}
                  metricOptions={metricOptions}
                  selectedMetric={activeMetric}
                  onMetricChange={setSelectedMetric}
                  showObservations={false}
                />
                {!isEdited ? (
                  <p className="live-switch-hint">
                    这些数字会随着表格中的修改实时变化；改完后，下面的观察与英文描述也会切换成当前数据版本。
                  </p>
                ) : null}
              </Section>

              <Section kicker="03" title="Key observations" titleEn={isEdited ? 'Generated from the current data' : 'The original sample analysis'} id="observations">
                {isEdited && analysis ? (
                  <>
                    <div className="original-copy-notice">
                      <strong>以下是修改后的实时结论。</strong>
                      <span>原始示例数据的观察已收在下方，避免把旧结论当成当前事实。</span>
                      <details>
                        <summary>Show original sample observations</summary>
                        <OriginalObservations lesson={lesson} />
                      </details>
                    </div>
                    <ul className="observation-list">
                      {analysis.observations.map((item) => (
                        <li key={item.en}>
                          <p className="obs-en">{item.en}</p>
                          <p className="obs-zh">{item.zh}</p>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <OriginalObservations lesson={lesson} />
                )}
              </Section>

              <Section kicker="04" title="How to describe it" titleEn="Useful expressions in context" id="expressions">
                {isEdited ? (
                  <p className="original-copy-notice compact-notice">
                    下面的例句来自原始示例数据，数值不会随编辑改变；请用上方的 Live statistics 和下方的完整描述来读当前数据。
                  </p>
                ) : null}
                <div className="describe-grid">
                  {lesson.describe.map((item, position) => (
                    <article className="describe-card" key={`${item.group}-${item.expression}-${position}`}>
                      <A href={`#/expressions/${item.group}`} className="group-chip">
                        {groupName(item.group)}
                      </A>
                      {isEdited ? <span className="sample-badge">Original sample data</span> : null}
                      <p className="describe-en">{item.en}</p>
                      <p className="describe-zh">{item.zh}</p>
                      <p className="pattern">
                        <span>Pattern</span>
                        {item.pattern}
                      </p>
                      <div className="alternatives">
                        <span>Other ways</span>
                        <ul>
                          {item.alternatives.map((alternative) => (
                            <li key={alternative}>{alternative}</li>
                          ))}
                        </ul>
                      </div>
                      {item.note_zh ? <p className="describe-note">{item.note_zh}</p> : null}
                    </article>
                  ))}
                </div>
              </Section>

              <Section kicker="05" title="Complete descriptions" titleEn={isEdited ? 'The three registers, regenerated from current data' : 'The same sample data, three registers'} id="versions">
                {isEdited ? (
                  <LiveEnglishVersions analysis={analysis} />
                ) : (
                  <>
                    <p className="live-version-note">
                      这三段是按原始示例数据人工编写的。改动数据后，这里会换成实时生成的三段表达。
                    </p>
                    <CuratedVersions lesson={lesson} />
                  </>
                )}
              </Section>

              <Section kicker="06" title="Useful language notes" titleEn="Grammar and word choice" id="notes">
                <div className="notes">
                  {lesson.language_notes.map((note) => (
                    <article className="note" key={note.title_en}>
                      <h3>{note.title_en}</h3>
                      <p>{note.body_zh}</p>
                      <ul className="note-examples">
                        {note.examples.map((example) => (
                          <li key={example}>{example}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </Section>

              <Section kicker="07" title="Keep exploring" titleEn="Related charts, language and contexts" id="related">
                <div className="related">
                  <div className="related-block">
                    <h3>Same family</h3>
                    <div className="chip-row">
                      {lesson.related.charts.map((chartId) => (
                        <A key={chartId} href={`#/charts/${chartId}`} className="chip">
                          {chartName(chartId)}
                        </A>
                      ))}
                    </div>
                  </div>
                  <div className="related-block">
                    <h3>Language</h3>
                    <div className="chip-row">
                      {lesson.related.groups.map((groupId) => (
                        <A key={groupId} href={`#/expressions/${groupId}`} className="chip">
                          {groupName(groupId)}
                        </A>
                      ))}
                    </div>
                  </div>
                  <div className="related-block">
                    <h3>Contexts</h3>
                    <div className="chip-row">
                      {lesson.related.contexts.map((contextId) => (
                        <A key={contextId} href={`#/contexts/${contextId}`} className="chip">
                          {contextName(contextId)}
                        </A>
                      ))}
                    </div>
                  </div>
                </div>
              </Section>

              <div className="page-end">
                <A href="#/charts" className="text-link">← All charts</A>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
