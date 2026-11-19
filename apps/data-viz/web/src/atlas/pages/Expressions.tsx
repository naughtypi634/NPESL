import type { AtlasIndex } from '../types';
import { A, Arrow, PageHead } from '../components/chrome';

export function Expressions({ index }: { index: AtlasIndex }) {
  const groups = [...index.expressions].sort((a, b) => a.order - b.order);
  return (
    <div className="page">
      <PageHead
        eyebrow="Expressions"
        title="Browse by language function"
        titleZh="学表达"
        lede="按“想表达什么”来找说法：描述上升、比较高低、说明占比、解释分布，或者把一组数字讲给同事听。"
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
