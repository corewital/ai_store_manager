type Point = { label: string; value: number };

const PALETTE = [
  "#0f766e",
  "#0ea5e9",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#22c55e",
  "#64748b",
];

function niceMax(values: number[]) {
  const max = Math.max(1, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

/** Vertical bars — good for "installs per day" style series. */
export function BarChart({
  data,
  height = 160,
  color = PALETTE[0],
  format = (n: number) => String(n),
}: {
  data: Point[];
  height?: number;
  color?: string;
  format?: (n: number) => string;
}) {
  if (data.length === 0) return <p className="admin-chart__empty">No data yet.</p>;
  const max = niceMax(data.map((d) => d.value));

  return (
    <div className="admin-chart">
      <div className="admin-chart__bars" style={{ height }}>
        {data.map((d, i) => (
          <div className="admin-chart__bar-slot" key={`${d.label}-${i}`}>
            <div
              className="admin-chart__bar"
              style={{
                height: `${Math.max(2, (d.value / max) * 100)}%`,
                background: color,
              }}
              title={`${d.label}: ${format(d.value)}`}
            />
          </div>
        ))}
      </div>
      <div className="admin-chart__axis">
        <span>{data[0]?.label}</span>
        <span>peak {format(max)}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/** Smooth area line — good for cumulative revenue / MRR trend. */
export function AreaChart({
  data,
  height = 160,
  color = PALETTE[1],
  format = (n: number) => String(n),
}: {
  data: Point[];
  height?: number;
  color?: string;
  format?: (n: number) => string;
}) {
  if (data.length < 2)
    return <p className="admin-chart__empty">Not enough data points yet.</p>;

  const w = 600;
  const h = height;
  const pad = 6;
  const max = niceMax(data.map((d) => d.value));
  const step = (w - pad * 2) / (data.length - 1);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const points = data.map((d, i) => `${pad + i * step},${y(d.value)}`);
  const line = `M ${points.join(" L ")}`;
  const area = `${line} L ${pad + (data.length - 1) * step},${h - pad} L ${pad},${h - pad} Z`;

  return (
    <div className="admin-chart">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img">
        <path d={area} fill={color} opacity={0.14} />
        <path d={line} fill="none" stroke={color} strokeWidth={2.5} />
        {data.map((d, i) => (
          <circle
            key={`${d.label}-${i}`}
            cx={pad + i * step}
            cy={y(d.value)}
            r={2.5}
            fill={color}
          >
            <title>{`${d.label}: ${format(d.value)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="admin-chart__axis">
        <span>{data[0]?.label}</span>
        <span>peak {format(max)}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/** Donut — plan mix / revenue share. */
export function DonutChart({
  data,
  size = 160,
  format = (n: number) => String(n),
}: {
  data: Point[];
  size?: number;
  format?: (n: number) => string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total <= 0) return <p className="admin-chart__empty">No revenue yet.</p>;

  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="admin-donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = `${frac * c} ${c - frac * c}`;
            const el = (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={18}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
              >
                <title>{`${d.label}: ${format(d.value)}`}</title>
              </circle>
            );
            offset += frac * c;
            return el;
          })}
        </g>
      </svg>
      <ul className="admin-donut__legend">
        {data.map((d, i) => (
          <li key={d.label}>
            <span
              className="admin-donut__dot"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            {d.label}
            <b>{format(d.value)}</b>
            <em>{Math.round((d.value / total) * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal comparison bars — plan counts, module issue mix, etc. */
export function StackBars({
  data,
  format = (n: number) => String(n),
}: {
  data: Point[];
  format?: (n: number) => string;
}) {
  if (data.length === 0) return <p className="admin-chart__empty">No data yet.</p>;
  const max = niceMax(data.map((d) => d.value));
  return (
    <ul className="admin-hbars">
      {data.map((d, i) => (
        <li key={d.label}>
          <span className="admin-hbars__label">{d.label}</span>
          <span className="admin-hbars__track">
            <span
              className="admin-hbars__fill"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: PALETTE[i % PALETTE.length],
              }}
            />
          </span>
          <b>{format(d.value)}</b>
        </li>
      ))}
    </ul>
  );
}
