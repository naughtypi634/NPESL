import type { AtlasIndex } from '../types';
import { loadContext } from '../loader';
import { useAsync } from '../use-async';
import { SpecFigure } from '../components/ChartFigure';
import { A, Breadcrumb, Eyebrow, Section } from '../components/chrome';

export function ContextPage({ index, id }: { index: AtlasIndex; id: string }) {
  const { data: context, error } = useAsync(() => loadContext(id), id);

  if (error) {
    return (
      <div className="page">
        <div className="state">
          <p>{error}</p>
          <A href="#/contexts" className="text-link">Back to contexts</A>
        </div>
      </div>
    );
  }

  if (!context) {
    return (
      <div className="page">
        <div className="state">
          <p>Loading the context…</p>
        </div>
      </div>
    );
  }

  const groupName = (groupId: string) =>
    index.expressions.find((group) => group.id === groupId)?.name_en ?? groupId;
  const chartSummary = (chartId: string) => index.charts.find((chart) => chart.id === chartId);
  const workedChart = chartSummary(context.worked.chart);

  return (
    <div className="page">
      <Breadcrumb items={[{ href: '#/contexts', label: 'Contexts' }, { label: context.name_en }]} />
      <header className="context-head">
        <Eyebrow>Real-world context</Eyebrow>
        <h1>{context.name_en}</h1>
        <p className="context-head-zh">{context.name_zh}</p>
        <p className="context-head-intro">{context.intro_zh}</p>
        <p className="context-head-en">{context.intro_en}</p>
      </header>

      <Section kicker="01" title="What this situation needs" titleEn="The moves that matter">
        <ol className="moves">
          {context.moves.map((move, position) => (
            <li key={move.name_en}>
              <span className="move-number">{String(position + 1).padStart(2, '0')}</span>
              <div>
                <h3>
                  {move.name_en}
                  <span>{move.name_zh}</span>
                </h3>
                <ul className="move-examples">
                  {move.examples.map((example) => (
                    <li key={example}>{example}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section kicker="02" title="Language to lean on" titleEn="Expression groups for this context">
        <div className="chip-row">
          {context.focus_groups.map((groupId) => (
            <A key={groupId} href={`#/expressions/${groupId}`} className="chip">
              {groupName(groupId)}
            </A>
          ))}
        </div>
      </Section>

      <Section kicker="03" title="Charts that fit" titleEn="Forms you will meet here">
        <div className="mini-grid">
          {context.charts.map((chartId) => {
            const chart = chartSummary(chartId);
            if (!chart) return null;
            return (
              <A key={chartId} href={`#/charts/${chartId}`} className="mini-card">
                <span>{chart.name_en}</span>
                <span className="mini-zh">{chart.name_zh}</span>
              </A>
            );
          })}
        </div>
      </Section>

      <Section kicker="04" title="A worked example" titleEn="One chart, described for this situation">
        <div className="worked">
          <div className="worked-figure">
            <SpecFigure spec={context.worked.spec} dataset={context.worked.dataset} />
          </div>
          <div className="worked-copy">
            <p className="worked-en">{context.worked.en}</p>
            <p className="worked-zh">{context.worked.zh}</p>
            {workedChart ? (
              <A href={`#/charts/${workedChart.id}`} className="text-link">
                Open the {workedChart.name_en} page →
              </A>
            ) : null}
          </div>
        </div>
      </Section>

      <Section kicker="05" title="Common pitfalls" titleEn="What to avoid here">
        <ul className="pitfalls">
          {context.pitfalls_zh.map((pitfall) => (
            <li key={pitfall}>{pitfall}</li>
          ))}
        </ul>
      </Section>

      <div className="page-end">
        <A href="#/contexts" className="text-link">← All contexts</A>
      </div>
    </div>
  );
}
