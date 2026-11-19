import type { AtlasIndex } from '../types';
import { loadChart } from '../loader';
import { useAsync } from '../use-async';
import { ChartFigure } from '../components/ChartFigure';
import { A, Breadcrumb, Eyebrow, Section } from '../components/chrome';

export function ChartPage({ index, id }: { index: AtlasIndex; id: string }) {
  const { data: lesson, error } = useAsync(() => loadChart(id), id);
  const summary = index.charts.find((chart) => chart.id === id);
  const family = index.families.find((item) => item.id === (lesson?.family ?? summary?.family));

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

  if (!lesson) {
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
          ...(family ? [{ href: `#/charts#family-${family.id}`, label: family.name_en }] : []),
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

      <ChartFigure lesson={lesson} />

      <Section kicker="01" title="How to read it" titleEn="Understanding the chart">
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

      <Section kicker="02" title="Key observations" titleEn="What the data actually says">
        <ul className="observation-list">
          {lesson.observations.map((item) => (
            <li key={item.en}>
              <p className="obs-en">{item.en}</p>
              <p className="obs-zh">{item.zh}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section kicker="03" title="How to describe it" titleEn="Expressions in context">
        <div className="describe-grid">
          {lesson.describe.map((item, position) => (
            <article className="describe-card" key={`${item.group}-${item.expression}-${position}`}>
              <A href={`#/expressions/${item.group}`} className="group-chip">
                {groupName(item.group)}
              </A>
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

      <Section kicker="04" title="Complete descriptions" titleEn="The same data, three registers">
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
      </Section>

      <Section kicker="05" title="Useful language notes" titleEn="Grammar and word choice">
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

      <Section kicker="06" title="Keep exploring" titleEn="Related charts, language and contexts">
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
    </div>
  );
}
