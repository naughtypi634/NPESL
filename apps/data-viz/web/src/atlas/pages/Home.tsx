import type { AtlasIndex } from '../types';
import { A, Arrow, FamilyGlyph } from '../components/chrome';

export function Home({ index }: { index: AtlasIndex }) {
  const site = index.site;
  return (
    <div className="home">
      <section className="hero">
        <p className="eyebrow">{site.title_en}</p>
        <h1>{site.title_zh}</h1>
        <p className="hero-lede">{site.tagline_zh}</p>
        <p className="hero-intro">{site.intro_zh}</p>
      </section>

      <section className="entries" aria-label="入口">
        {site.entries.map((entry) => (
          <A key={entry.id} href={entry.href} className="entry">
            <span className="entry-glyph" aria-hidden="true">
              <FamilyGlyph family={entry.id === 'charts' ? 'trend' : entry.id === 'expressions' ? 'comparison' : 'flow'} />
            </span>
            <span className="entry-copy">
              <span className="entry-zh" style={{ fontSize: 22, fontWeight: 600 }}>{entry.name_zh}</span>
              <span className="entry-en" style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>{entry.name_en}</span>
              <span className="entry-desc">{entry.desc_zh}</span>
            </span>
            <Arrow />
          </A>
        ))}
      </section>

      <section className="principles" aria-label="使用说明">
        <p className="principle-text">
          点开一张图，先看中文讲解，下面就是英文说法。不用答题。
        </p>
      </section>
    </div>
  );
}
