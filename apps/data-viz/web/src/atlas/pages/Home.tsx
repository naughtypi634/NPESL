import type { AtlasIndex } from '../types';
import { A, Arrow, FamilyGlyph } from '../components/chrome';

export function Home({ index }: { index: AtlasIndex }) {
  const site = index.site;
  return (
    <div className="home">
      <section className="hero">
        <p className="eyebrow">Data Visualization × English Expression Atlas</p>
        <h1>
          See the data.
          <br />
          Say it in English.
        </h1>
        <p className="hero-zh">{site.title_zh}</p>
        <p className="hero-lede">{site.tagline_zh}</p>
        <p className="hero-intro">{site.intro_zh}</p>
      </section>

      <section className="entries" aria-label="Ways in">
        {site.entries.map((entry) => (
          <A key={entry.id} href={entry.href} className="entry">
            <span className="entry-glyph" aria-hidden="true">
              <FamilyGlyph family={entry.id === 'charts' ? 'trend' : entry.id === 'expressions' ? 'comparison' : 'flow'} />
            </span>
            <span className="entry-copy">
              <span className="entry-en">{entry.name_en}</span>
              <span className="entry-zh">{entry.name_zh}</span>
              <span className="entry-desc">{entry.desc_zh}</span>
            </span>
            <Arrow />
          </A>
        ))}
      </section>

      <section className="principles" aria-label="How this atlas works">
        <div>
          <p className="eyebrow">Read, don't drill</p>
          <p className="principle-text">
            每张图都把结论、说法和完整范文直接摊开。不需要作答、改数据或完成任何任务。
          </p>
        </div>
        <div>
          <p className="eyebrow">One idea, three registers</p>
          <p className="principle-text">
            同一组数据，分别给出学术写作、商务汇报和日常英语三种版本，语气差别一眼可见。
          </p>
        </div>
        <div>
          <p className="eyebrow">Numbers you can trust</p>
          <p className="principle-text">
            所有例句里的数字都来自图表本身，构建时会逐条核对；页面标明模拟数据，不冒充真实统计。
          </p>
        </div>
      </section>
    </div>
  );
}
