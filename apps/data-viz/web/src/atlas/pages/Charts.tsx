import type { AtlasIndex } from '../types';
import { A, Arrow, FamilyGlyph, PageHead } from '../components/chrome';

export function Charts({ index }: { index: AtlasIndex }) {
  const families = [...index.families].sort((a, b) => a.order - b.order);
  const charts = [...index.charts];
  return (
    <div className="page">
      <PageHead
        eyebrow="Charts"
        title="Browse by chart"
        titleZh="看图表"
        lede="先选一种图表，再看它适合什么数据、怎么读，以及描述它可以用的英语。"
      />

      <nav className="family-jump" aria-label="Chart families">
        {families.map((family) => (
          <a key={family.id} href={`#family-${family.id}`} className="chip">
            {family.name_en}
            <span>{family.name_zh}</span>
          </a>
        ))}
      </nav>

      {families.map((family) => {
        const own = charts.filter((chart) => chart.family === family.id);
        if (!own.length) return null;
        return (
          <section className="family" id={`family-${family.id}`} key={family.id}>
            <header className="family-head">
              <span className="family-glyph">
                <FamilyGlyph family={family.id} />
              </span>
              <div>
                <h2>
                  {family.name_en}
                  <span className="family-zh">{family.name_zh}</span>
                </h2>
                <p>{family.intro_zh}</p>
              </div>
            </header>
            <div className="chart-grid">
              {own.map((chart) => (
                <A key={chart.id} href={`#/charts/${chart.id}`} className="chart-card">
                  <span className="chart-card-en">{chart.name_en}</span>
                  <span className="chart-card-zh">{chart.name_zh}</span>
                  <span className="chart-card-what">{chart.what_zh}</span>
                  <Arrow />
                </A>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
