import type { AtlasIndex } from '../types';
import { A, Arrow, PageHead } from '../components/chrome';

export function Contexts({ index }: { index: AtlasIndex }) {
  const contexts = [...index.contexts].sort((a, b) => a.order - b.order);
  return (
    <div className="page">
      <PageHead
        eyebrow="Real-world Contexts"
        title="Browse by situation"
        titleZh="看实际应用"
        lede="同一张图，在雅思考场、周会汇报和朋友圈里说法完全不同。这里按真实场景组织：先看这个场景要完成什么，再看该用哪些表达。"
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
