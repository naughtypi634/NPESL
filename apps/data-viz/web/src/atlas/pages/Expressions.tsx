import type { AtlasIndex } from '../types';
import { A, Arrow, PageHead } from '../components/chrome';

export function Expressions({ index }: { index: AtlasIndex }) {
  const groups = [...index.expressions].sort((a, b) => a.order - b.order);
  return (
    <div className="page">
      <PageHead
        eyebrow="Browse by language function"
        title="学表达"
        lede="按想表达的意思，找对应的英文说法。"
      />
      <div className="group-grid">
        {groups.map((group) => (
          <A key={group.id} href={`#/expressions/${group.id}`} className="group-card">
            <span className="group-card-en">{group.name_en}</span>
            <span className="group-card-zh">{group.name_zh}</span>
            <span className="group-card-intro">{group.intro_zh}</span>
            <Arrow />
          </A>
        ))}
      </div>
    </div>
  );
}
