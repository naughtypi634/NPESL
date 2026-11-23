import type { Segment } from '../data/types';

/**
 * 一句话拆成若干段；带读音的段画成 ruby，提示压在字下面。
 * 段落结构由 build.py 切好，这里不做任何解析。
 */
export function Segments({ seg }: { seg: Segment[] }) {
  return (
    <>
      {seg.map(([text, reading], index) =>
        reading ? (
          <ruby key={index}>
            {text}
            <rt>{reading}</rt>
          </ruby>
        ) : (
          <span key={index}>{text}</span>
        ),
      )}
    </>
  );
}
