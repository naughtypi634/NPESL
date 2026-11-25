import type { AtlasIndex } from '../types';
import { A, Arrow, PageHead } from '../components/chrome';

export function Contexts({ index }: { index: AtlasIndex }) {
  const contexts = [...index.contexts].sort((a, b) => a.order - b.order);
  return (
    <div className="page">
      <PageHead
        eyebrow="Browse by situation"
        title="看场景"
        lede="按真实场景，看同一组数据的英文说法。"
      />
      <div className="context-grid">
        {contexts.map((context) => (
          <A key={context.id} href={`#/contexts/${context.id}`} className="context-card">
            <span className="context-card-en">{context.name_en}</span>
            <span className="context-card-zh">{context.name_zh}</span>
            <span className="context-card-intro">{context.intro_zh}</span>
            <Arrow />
          </A>
        ))}
      </div>
    </div>
  );
}
