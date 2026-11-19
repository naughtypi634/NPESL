import { useState } from 'react';

import type { AtlasIndex, Scene } from '../types';
import { loadGroup } from '../loader';
import { useAsync } from '../use-async';
import { A, Breadcrumb, Eyebrow, Section } from '../components/chrome';

const SCENE_LABEL: Record<Scene, string> = {
  academic: 'Academic',
  business: 'Business',
  everyday: 'Everyday',
};

const FILTERS: { id: Scene | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'academic', label: 'Academic' },
  { id: 'business', label: 'Business' },
  { id: 'everyday', label: 'Everyday' },
];

export function GroupPage({ index, id }: { index: AtlasIndex; id: string }) {
  const { data: group, error } = useAsync(() => loadGroup(id), id);
  const [scene, setScene] = useState<Scene | 'all'>('all');

  if (error) {
    return (
      <div className="page">
        <div className="state">
          <p>{error}</p>
          <A href="#/expressions" className="text-link">Back to expressions</A>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="page">
        <div className="state">
          <p>Loading the expressions…</p>
        </div>
      </div>
    );
  }

  const visible =
    scene === 'all'
      ? group.expressions
      : group.expressions.filter((expression) => expression.scenes.includes(scene));
  const chartName = (chartId: string) =>
    index.charts.find((chart) => chart.id === chartId)?.name_en ?? chartId;

  return (
    <div className="page">
      <Breadcrumb items={[{ href: '#/expressions', label: 'Expressions' }, { label: group.name_en }]} />
      <header className="group-head">
        <Eyebrow>Expressions</Eyebrow>
        <h1>{group.name_en}</h1>
        <p className="group-head-zh">{group.name_zh}</p>
        <p className="group-head-intro">{group.intro_zh}</p>
      </header>

      <div className="scene-filter" role="group" aria-label="Filter by context">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={`filter${scene === filter.id ? ' is-on' : ''}`}
            aria-pressed={scene === filter.id}
            onClick={() => setScene(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="expression-list">
        {visible.map((expression) => (
          <article className="expression" key={expression.id}>
            <header className="expression-head">
              <h2>{expression.head}</h2>
              <span className="expression-meaning">{expression.meaning_zh}</span>
              <span className="tags">
                <span className="tag">{expression.cefr}</span>
                <span className="tag">{expression.register}</span>
                {expression.scenes.map((item) => (
                  <span className="tag tag-scene" key={item}>
                    {SCENE_LABEL[item]}
                  </span>
                ))}
              </span>
            </header>
            <p className="pattern">
              <span>Pattern</span>
              {expression.pattern}
            </p>
            <div className="collocations">
              <span>Collocations</span>
              <ul>
                {expression.collocations.map((collocation) => (
                  <li key={collocation}>{collocation}</li>
                ))}
              </ul>
            </div>
            <div className="expression-examples">
              {expression.examples.map((example) => (
                <div className="expression-example" key={example.en}>
                  <p className="example-en">{example.en}</p>
                  <p className="example-zh">{example.zh}</p>
                  {example.chart ? (
                    <A href={`#/charts/${example.chart}`} className="example-chart">
                      See it on the {chartName(example.chart)} →
                    </A>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="contrast">
              <span>Compare</span>
              {expression.contrast_zh}
            </p>
            {expression.caution_zh ? (
              <p className="caution">
                <span>注意</span>
                {expression.caution_zh}
              </p>
            ) : null}
          </article>
        ))}
      </div>

      {group.charts.length ? (
        <Section kicker="In use" title="Charts that practise this" titleEn="See the language on real charts">
          <div className="chip-row">
            {group.charts.map((item) => (
              <A key={item.chart} href={`#/charts/${item.chart}`} className="chip">
                {chartName(item.chart)}
              </A>
            ))}
          </div>
        </Section>
      ) : null}

      <div className="page-end">
        <A href="#/expressions" className="text-link">← All expressions</A>
      </div>
    </div>
  );
}
