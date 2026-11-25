import type { AtlasIndex } from '../types';
import { A, Arrow, FamilyGlyph } from '../components/chrome';

export function Home({ index }: { index: AtlasIndex }) {
  const site = index.site;
  const families = [...index.families].sort((a, b) => a.order - b.order);
  const firstChart = (familyId: string) => index.charts.find((chart) => chart.family === familyId);

  return (
    <div className="home">
      <section className="hero">
        <p className="eyebrow">{site.title_en}</p>
        <h1>{site.title_zh}</h1>
        <p className="hero-lede">{site.tagline_zh}</p>
        <p className="hero-intro">{site.intro_zh}</p>
      </section>

      <section className="entries" aria-label="图表类型">
        {families.map((family) => {
          const chart = firstChart(family.id);
          if (!chart) return null;
          return (
            <A key={family.id} href={`#/charts/${chart.id}`} className="entry">
              <span className="entry-glyph" aria-hidden="true">
                <FamilyGlyph family={family.id} />
              </span>
              <span className="entry-copy">
                <span className="entry-zh">{family.name_zh}</span>
                <span className="entry-en">{family.name_en}</span>
                <span className="entry-desc">{family.intro_zh}</span>
              </span>
              <Arrow />
            </A>
          );
        })}
      </section>
    </div>
  );
}
