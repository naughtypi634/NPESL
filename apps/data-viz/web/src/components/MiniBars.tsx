interface MiniBarsProps {
  values: number[];
  width?: number;
  height?: number;
}

export function MiniBars({ values, width = 112, height = 36 }: MiniBarsProps) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const gap = 3;
  const barWidth = (width - gap * (values.length - 1)) / values.length;
  const topIndex = values.indexOf(Math.max(...values));
  return (
    <svg
      className="dv-mini-bars"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
    >
      {values.map((value, index) => {
        const barHeight = Math.max(2, (value / max) * (height - 2));
        return (
          <rect
            key={`${index}-${value}`}
            x={index * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={1.5}
            className={index === topIndex ? 'dv-mini-bar is-accent' : 'dv-mini-bar'}
          />
        );
      })}
    </svg>
  );
}
