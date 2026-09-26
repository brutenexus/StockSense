/** Small, dependency-free charts. Server-safe: no state, no effects. */
import { cx } from '@/components/ui/primitives';
import { formatDateShort, formatNumber, formatQty } from '@/lib/format';
import { accentOf } from '@/lib/format';

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

/* ---------------------------------------------------------- movement chart */

export function MovementChart({
  series,
  height = 190,
}: {
  series: { date: string; inQty: number; outQty: number; moves: number }[];
  height?: number;
}) {
  const max = niceMax(Math.max(1, ...series.flatMap((point) => [point.inQty, point.outQty])));
  const slot = 34;
  const width = Math.max(series.length * slot, 320);
  const chartHeight = height - 34;
  const gridLines = [0, 0.5, 1];

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label="Stock moved in and out per day">
        {gridLines.map((ratio) => (
          <line
            key={ratio}
            x1={0}
            x2={width}
            y1={chartHeight * ratio + 6}
            y2={chartHeight * ratio + 6}
            stroke="currentColor"
            className="text-ink-200 dark:text-ink-800"
            strokeWidth={1}
            strokeDasharray={ratio === 0 ? undefined : '3 5'}
          />
        ))}
        {series.map((point, index) => {
          const groupX = index * slot + 6;
          const inHeight = (point.inQty / max) * chartHeight;
          const outHeight = (point.outQty / max) * chartHeight;
          return (
            <g key={point.date}>
              <rect x={groupX} y={chartHeight + 6 - inHeight} width={10} height={Math.max(inHeight, point.inQty > 0 ? 2 : 0)} rx={2.5} className="fill-emerald-500/85">
                <title>{`${point.date} · in ${formatQty(point.inQty)}`}</title>
              </rect>
              <rect x={groupX + 12} y={chartHeight + 6 - outHeight} width={10} height={Math.max(outHeight, point.outQty > 0 ? 2 : 0)} rx={2.5} className="fill-sky-500/85">
                <title>{`${point.date} · out ${formatQty(point.outQty)}`}</title>
              </rect>
              {index % 2 === 0 ? (
                <text x={groupX + 11} y={height - 8} textAnchor="middle" className="fill-ink-400 text-[10px]">
                  {formatDateShort(point.date)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center justify-between text-[11.5px] text-ink-400">
        <span>Peak {formatNumber(max)} units per direction</span>
        <span>{series.length} days</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- bar list */

export function BarList({
  items,
  valueFormatter = (value: number) => formatNumber(value),
  emptyLabel = 'Nothing to chart yet',
}: {
  items: { label: string; value: number; secondary?: string; tone?: string }[];
  valueFormatter?: (value: number) => string;
  emptyLabel?: string;
}) {
  if (!items.length) return <p className="py-6 text-center text-[12.5px] text-ink-400">{emptyLabel}</p>;
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[12.5px] font-medium text-ink-700 dark:text-ink-200">{item.label}</span>
            <span className="tnum shrink-0 text-[12px] text-ink-500 dark:text-ink-400">
              {valueFormatter(item.value)}
              {item.secondary ? <span className="ml-1.5 text-ink-400">{item.secondary}</span> : null}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
            <div className={cx('h-full rounded-full', accentOf(item.tone ?? 'indigo').bar)} style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------- schedule strip */

export function ScheduleStrip({ days }: { days: { date: string; receipts: number; deliveries: number; transfers: number }[] }) {
  const max = niceMax(Math.max(1, ...days.map((day) => day.receipts + day.deliveries + day.transfers)));
  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pb-1" style={{ minHeight: 96 }}>
      {days.map((day) => {
        const total = day.receipts + day.deliveries + day.transfers;
        const segments = [
          { value: day.receipts, tone: 'bg-emerald-500' },
          { value: day.deliveries, tone: 'bg-sky-500' },
          { value: day.transfers, tone: 'bg-violet-500' },
        ];
        return (
          <div key={day.date} className="flex min-w-7 flex-1 flex-col items-center gap-1.5" title={`${day.date}: ${total} pending`}>
            <div className="flex w-full flex-col justify-end gap-0.5" style={{ height: 68 }}>
              {segments.map((segment, index) =>
                segment.value > 0 ? (
                  <span
                    key={index}
                    className={cx('w-full rounded-[3px]', segment.tone)}
                    style={{ height: Math.max(4, (segment.value / max) * 68) }}
                  />
                ) : null,
              )}
              {total === 0 ? <span className="h-1 w-full rounded-full bg-ink-100 dark:bg-ink-800" /> : null}
            </div>
            <span className="text-[10px] text-ink-400">{formatDateShort(day.date).slice(0, 2)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- donut gauge */

export function Gauge({ value, max, label, tone = 'emerald' }: { value: number; max: number; label: string; tone?: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const color = { emerald: '#10b981', brand: '#6366f1', amber: '#f59e0b', rose: '#f43f5e', sky: '#0ea5e9' }[tone] ?? '#6366f1';
  return (
    <div className="flex items-center gap-4">
      <svg width={84} height={84} viewBox="0 0 84 84" role="img" aria-label={label}>
        <circle cx={42} cy={42} r={radius} fill="none" strokeWidth={9} className="stroke-ink-200 dark:stroke-ink-800" />
        <circle
          cx={42}
          cy={42}
          r={radius}
          fill="none"
          strokeWidth={9}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={`${ratio * circumference} ${circumference}`}
          transform="rotate(-90 42 42)"
        />
        <text x={42} y={43} textAnchor="middle" dominantBaseline="middle" className="fill-ink-900 text-[15px] font-semibold dark:fill-white">
          {Math.round(ratio * 100)}%
        </text>
      </svg>
      <p className="text-[12.5px] leading-relaxed text-ink-500 dark:text-ink-400">{label}</p>
    </div>
  );
}
