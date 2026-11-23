import { useState } from 'react';
import { flushSync } from 'react-dom';

import { data } from '../data/lessons';

const KEY = 'rs-cat';

function readCat(): string {
  try {
    return localStorage.getItem(KEY) ?? 'all';
  } catch {
    return 'all';
  }
}

function saveCat(value: string): void {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* 存不下不影响当前页面 */
  }
}

/**
 * 目录页：分类筛选 + 分组列表。
 *
 * 所有分组始终挂在 DOM 里，只切 display —— 原来的探针就是这么读状态的
 * （tests/verify_runtime.mjs 的 filters 用例），保留这个约定。
 */
export function IndexPage() {
  const [saved, setSaved] = useState(readCat);

  const categories = data.categories.filter((category) =>
    data.lessons.some((lesson) => lesson.category === category),
  );
  // 存过的分类可能在内容改版后不存在了：退回 all，不留悬空状态。
  const active = saved === 'all' || categories.includes(saved) ? saved : 'all';

  function choose(value: string): void {
    // 筛选必须在点击那一刻就落到 DOM 上：原来的页面是直接改 display，
    // 交互上就是「按下即生效」。React 默认把更新推迟一拍，这里显式同步。
    flushSync(() => setSaved(value));
    saveCat(value);
  }

  return (
    <>
      <header className="index-head">
        <h1>常见发音现象(AmE)</h1>
      </header>

      <div className="chips">
        <button
          type="button"
          className="chip"
          data-cat="all"
          aria-pressed={active === 'all' ? 'true' : 'false'}
          onClick={() => choose('all')}
        >
          全部
        </button>
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className="chip"
            data-cat={category}
            aria-pressed={active === category ? 'true' : 'false'}
            onClick={() => choose(category)}
          >
            {category}
          </button>
        ))}
      </div>

      {categories.map((category) => (
        <section
          key={category}
          className="group"
          data-cat={category}
          style={{ display: active === 'all' || active === category ? '' : 'none' }}
        >
          <h2>{category}</h2>
          <div className="list">
            {data.lessons
              .filter((lesson) => lesson.category === category)
              .map((lesson) => (
                <a key={lesson.slug} className="row" href={lesson.slug}>
                  <span className="title">
                    <span className="en">{lesson.title_en}</span>
                    <span className="zh">{lesson.title_zh}</span>
                  </span>
                  <span className="tag">
                    {lesson.targets.map((target) => target.spoken).join(' / ')}
                  </span>
                </a>
              ))}
          </div>
        </section>
      ))}
    </>
  );
}
