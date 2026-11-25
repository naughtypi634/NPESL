import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChartSpec } from 'ztd-charts';
import type { AtlasIndex, ChartLesson } from '../types';
import { loadChart } from '../loader';
import { useAsync } from '../use-async';
import { ChartFigure } from '../components/ChartFigure';
import { DataEditor } from '../components/DataEditor';
import { LiveEnglishInsights, LiveEnglishVersions } from '../components/LiveEnglish';
import { A, Eyebrow, Section } from '../components/chrome';
import {
  describeMetrics,
  getChartRows,
  getPreferredMetric,
  type ChartRow,
} from '../data-tools';
import { analyzeChart, specWithAnalysis } from '../live';

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
            <h3>{labelZh}</h3>
            <span>{label}</span>
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
  const pendingHistory = useRef(false);

  useEffect(() => {
    setEditedRows(null);
    setHistory([]);
    setEditorOpen(false);
    setSelectedMetric('');
    pendingHistory.current = false;
  }, [id]);

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
    if (pendingHistory.current) {
      setHistory((stack) => [...stack, currentRows].slice(-20));
      pendingHistory.current = false;
    }
    setEditedRows(next);
  }, [currentRows]);

  const beginEdit = useCallback(() => {
    pendingHistory.current = true;
  }, []);

  const endEdit = useCallback(() => {
    pendingHistory.current = false;
  }, []);

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
      <A href="#/charts" className="text-link chart-back">← 回到图表目录</A>

      <header className="chart-head">
        <Eyebrow>{family ? `${family.name_en} · ${family.name_zh}` : 'Chart'}</Eyebrow>
        <h1>{lesson.name_en}</h1>
        <p className="chart-head-zh">{lesson.name_zh}</p>
        <p className="chart-head-what">{summary?.what_zh}</p>
        {summary?.focus?.length ? (
          <div className="focus-row">
            <span className="focus-label">常用说法</span>
            {summary.focus.map((groupId) => (
              <A key={groupId} href={`#/expressions/${groupId}`} className="chip">
                {groupName(groupId)}
              </A>
            ))}
          </div>
        ) : null}
      </header>

      <div className={`chart-learning-layout${editorOpen ? ' is-editing' : ''}`}>
        <aside className="chart-workspace" id="chart-workspace">
          <ChartFigure lesson={lesson} spec={currentSpec} height={380} />
          <div className="chart-workspace-actions">
            <button
              type="button"
              className="edit-data-button"
              aria-expanded={editorOpen}
              onClick={() => setEditorOpen((open) => !open)}
            >
              {editorOpen ? '收起改数字' : '改数字看看'}
            </button>
          </div>
          <p className="chart-edit-hint">点上面的按钮可以改数字；改完图、英文和中文会跟着变。</p>
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
              onBeginEdit={beginEdit}
              onEndEdit={endEdit}
            />
          ) : null}
        </aside>

        <div className="chart-learning-content">
              <Section kicker="01" title="先看懂这张图" titleEn="How to read it" id="read">
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

              <Section kicker="02" title="英语可以怎么说" titleEn="How to describe it" id="expressions">
                {isEdited ? (
                  <p className="original-copy-notice compact-notice">
                    下面的说法用的是原来那组数字，改数字后这里的例句不会变。
                  </p>
                ) : null}
                <div className="describe-grid">
                  {lesson.describe.map((item, position) => (
                    <article className="describe-card" key={`${item.group}-${item.expression}-${position}`}>
                      <A href={`#/expressions/${item.group}`} className="group-chip">
                        {groupName(item.group)}
                      </A>
                      {isEdited ? <span className="sample-badge">原来的例子</span> : null}
                      <p className="describe-en">{item.en}</p>
                      <p className="describe-zh">{item.zh}</p>
                      <p className="pattern">
                        <span>句型</span>
                        {item.pattern}
                      </p>
                      <div className="alternatives">
                        <span>别的说法</span>
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

              <Section kicker="03" title="三段完整范文" titleEn="Complete descriptions" id="versions">
                {isEdited && analysis ? (
                  <LiveEnglishVersions analysis={analysis} />
                ) : (
                  <>
                    <p className="live-version-note">
                      {isEdited
                        ? '这组数字暂时算不出新说法，下面是这张图原本的三段范文。'
                        : '这三段用原来的例子写成。改数字后，这里会换成跟着数字变的版本。'}
                    </p>
                    <CuratedVersions lesson={lesson} />
                  </>
                )}
              </Section>

              <Section kicker="04" title="数字变了，英文也会变" titleEn="What the data says" id="live-english">
                <LiveEnglishInsights
                  analysis={analysis}
                  metricOptions={metricOptions}
                  selectedMetric={activeMetric}
                  onMetricChange={setSelectedMetric}
                  showObservations={false}
                />
              </Section>

              <Section kicker="05" title="最值得注意的数字" titleEn="Key observations" id="observations">
                {isEdited && analysis ? (
                  <>
                    <div className="original-copy-notice">
                      <strong>下面是改完数字后的结论。</strong>
                      <span>原来那组数字的结论放在下面，点一下就能看。</span>
                      <details>
                        <summary>看原来的例子</summary>
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

              <Section kicker="06" title="用词小提示" titleEn="Useful language notes" id="notes">
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

              <Section kicker="07" title="还可以看点别的" titleEn="Keep exploring" id="related">
                <div className="related">
                  <div className="related-block">
                    <h3>同类图</h3>
                    <div className="chip-row">
                      {lesson.related.charts.map((chartId) => (
                        <A key={chartId} href={`#/charts/${chartId}`} className="chip">
                          {chartName(chartId)}
                        </A>
                      ))}
                    </div>
                  </div>
                  <div className="related-block">
                    <h3>相关说法</h3>
                    <div className="chip-row">
                      {lesson.related.groups.map((groupId) => (
                        <A key={groupId} href={`#/expressions/${groupId}`} className="chip">
                          {groupName(groupId)}
                        </A>
                      ))}
                    </div>
                  </div>
                  <div className="related-block">
                    <h3>实际场景</h3>
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
                <A href="#/charts" className="text-link">← 回到图表目录</A>
              </div>
        </div>
      </div>
    </div>
  );
}
