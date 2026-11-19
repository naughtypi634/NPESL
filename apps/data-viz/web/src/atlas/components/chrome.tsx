import type { ReactNode } from 'react';

export function A({
  href,
  children,
  className,
  ariaLabel,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <a href={href} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

export function PageHead({
  eyebrow,
  title,
  titleZh,
  lede,
}: {
  eyebrow: string;
  title: string;
  titleZh?: string;
  lede?: string;
}) {
  return (
    <header className="page-head">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1>{title}</h1>
      {titleZh ? <p className="page-head-zh">{titleZh}</p> : null}
      {lede ? <p className="page-head-lede">{lede}</p> : null}
    </header>
  );
}

export function Section({
  kicker,
  title,
  titleEn,
  children,
  id,
}: {
  kicker?: string;
  title: string;
  titleEn?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="section" id={id}>
      <div className="section-head">
        {kicker ? <Eyebrow>{kicker}</Eyebrow> : null}
        <h2>{title}</h2>
        {titleEn ? <p className="section-en">{titleEn}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Breadcrumb({
  items,
}: {
  items: { href?: string; label: string }[];
}) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {index > 0 ? <span className="crumb-sep">/</span> : null}
          {item.href ? <a href={item.href}>{item.label}</a> : <span aria-current="page">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function Arrow() {
  return <span className="arrow" aria-hidden="true">→</span>;
}

const GLYPHS: Record<string, ReactNode> = {
  proportion: (
    <>
      <circle cx="24" cy="24" r="15" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M24 9 A15 15 0 0 1 39 24 L24 24 Z" fill="currentColor" opacity="0.85" />
    </>
  ),
  hierarchy: (
    <>
      <rect x="7" y="7" width="24" height="34" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="31" y="7" width="10" height="16" fill="currentColor" opacity="0.75" />
      <rect x="31" y="25" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  flow: (
    <>
      <path d="M7 12 H19 C25 12 23 24 29 24 H41" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M7 36 H19 C25 36 23 24 29 24" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      <path d="M37 20 L42 24 L37 28" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  comparison: (
    <>
      <rect x="8" y="22" width="6" height="18" fill="currentColor" opacity="0.6" />
      <rect x="18" y="12" width="6" height="28" fill="currentColor" opacity="0.8" />
      <rect x="28" y="6" width="6" height="34" fill="currentColor" />
      <path d="M7 42 H41" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  trend: (
    <>
      <path d="M7 34 L18 24 L27 29 L41 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="41" cy="12" r="3" fill="currentColor" />
      <path d="M7 42 H41" stroke="currentColor" strokeWidth="2" opacity="0.35" />
    </>
  ),
  distribution: (
    <>
      <path d="M8 38 C14 38 13 18 24 18 C35 18 34 38 40 38" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="30" r="2.2" fill="currentColor" />
      <circle cx="24" cy="22" r="2.2" fill="currentColor" />
      <circle cx="31" cy="29" r="2.2" fill="currentColor" />
      <path d="M8 42 H40" stroke="currentColor" strokeWidth="2" opacity="0.35" />
    </>
  ),
  relationship: (
    <>
      <circle cx="12" cy="33" r="3" fill="currentColor" />
      <circle cx="20" cy="27" r="3" fill="currentColor" opacity="0.75" />
      <circle cx="30" cy="19" r="3" fill="currentColor" opacity="0.75" />
      <circle cx="38" cy="12" r="3" fill="currentColor" />
      <circle cx="25" cy="34" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </>
  ),
  map: (
    <>
      <path d="M7 12 L19 8 L29 13 L41 9 V36 L29 40 L19 35 L7 39 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M19 8 V35 M29 13 V40" stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
      <circle cx="25" cy="23" r="3" fill="currentColor" />
    </>
  ),
  kpi: (
    <>
      <path d="M9 37 A16 16 0 0 1 39 37" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.35" />
      <path d="M9 37 A16 16 0 0 1 32 23" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="24" cy="37" r="2.4" fill="currentColor" />
    </>
  ),
};

export function FamilyGlyph({ family }: { family: string }) {
  return (
    <svg className="glyph" viewBox="0 0 48 48" aria-hidden="true">
      {GLYPHS[family] ?? GLYPHS.trend}
    </svg>
  );
}
