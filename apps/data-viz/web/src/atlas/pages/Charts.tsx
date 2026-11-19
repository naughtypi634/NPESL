import type { AtlasIndex, ChartSummary } from '../types';
import { useTheme } from '../use-theme';
import { A, Arrow, FamilyGlyph, PageHead } from '../components/chrome';

function ChartCard({ chart, familyName }: { chart: ChartSummary; familyName: string }) {
  const theme = useTheme();
  const preview = chart.preview;
  const src = preview ? (theme === 'light' ? preview.light : preview.dark) : null;

  return (
    <A href={`#/charts/${chart.id}`} className="chart-card">
      <div className="chart-card-preview">
        {src ? (
          <img
            src={`${import.meta.env.BASE_URL}${src}`}
            alt=""
            width={360}
            height={200}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="chart-preview-placeholder">Preview unavailable</div>
        )}
      </div>
      <div className="chart-card-copy">
        <span className="chart-card-family">{familyName}</span>
        <span className="chart-card-en">{chart.name_en}</span>
        <span className="chart-card-zh">{chart.name_zh}</span>
        <span className="chart-card-what">{chart.what_zh}</span>
      </div>
      <Arrow />
    </A>
  );
}

export function Charts({ index }: { index: AtlasIndex }) {
  const families = [...index.families].sort((a, b) => a.order - b.order);
  const charts = [...index.charts];
  return (
    <div className="page">
      <PageHead
        eyebrow="Charts"
        title="Browse by chart"
        titleZh="看图表"
        lede="先看图形预览，再选一种图表。进入详情后，可以直接改数据、观察图表变化，并学习对应的英语表达。"
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
                <ChartCard key={chart.id} chart={chart} familyName={family.name_en} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
