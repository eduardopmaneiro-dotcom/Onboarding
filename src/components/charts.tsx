/**
 * Gráficos simples em SVG (sem biblioteca): série única na cor da marca, valores escritos,
 * dica de valor ao passar o mouse (<title>) e tabela sempre disponível ao lado/abaixo.
 */
import type { Rate } from "@/modules/analytics/metrics";

const BAR = "#94653a"; // gold-600 — série única
const BAR_SOFT = "#e6d3bb";
const INK = "#2b2118";
const MUTED = "#78716c";

export function pct(r: Rate | { value: number | null }): string {
  return r.value === null ? "—" : `${(r.value * 100).toFixed(1).replace(".", ",")}%`;
}
export function fmtDays(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (v < 1) return `${Math.round(v * 24)} h`;
  return `${v.toFixed(1).replace(".", ",")} d`;
}

/** Barras horizontais com rótulo e valor (comparação entre categorias). */
export function BarList({ rows, valueLabel, emptyText = "Sem dados no período.", max }: { rows: Array<{ label: string; value: number; hint?: string }>; valueLabel: string; emptyText?: string; max?: number }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-stone-400">{emptyText}</p>;
  const top = Math.max(max ?? 0, ...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2" aria-label={valueLabel}>
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_auto] items-center gap-3 text-sm" title={`${r.label}: ${r.value} ${valueLabel}${r.hint ? ` · ${r.hint}` : ""}`}>
          <span className="truncate text-stone-700">{r.label}</span>
          <span className="h-3 rounded-r bg-riale-50">
            <span className="block h-3 rounded-r" style={{ width: `${(r.value / top) * 100}%`, background: BAR, minWidth: r.value ? 4 : 0 }} />
          </span>
          <span className="w-16 text-right font-medium tabular-nums text-riale-900">{r.value}{r.hint && <span className="block text-[10px] font-normal text-stone-400">{r.hint}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

/** Colunas por período (tendência de uma única medida). */
export function ColumnTrend({ data, measure, label }: { data: Array<{ key: string; label: string; value: number }>; measure: string; label: string }) {
  const W = 720, H = 200, padL = 28, padB = 34, padT = 16;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = (W - padL) / data.length;
  const bw = Math.min(36, step * 0.6);
  const ticks = [0, Math.ceil(max / 2), max];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${d.value}`).join("; ")}`}>
        {ticks.map((t) => {
          const y = H - padB - ((H - padB - padT) * t) / max;
          return <g key={t}><line x1={padL} x2={W} y1={y} y2={y} stroke="#e7e5e4" strokeWidth="1" /><text x={padL - 6} y={y + 3} textAnchor="end" fontSize="10" fill={MUTED}>{t}</text></g>;
        })}
        {data.map((d, i) => {
          const h = ((H - padB - padT) * d.value) / max;
          const x = padL + i * step + (step - bw) / 2;
          const last = i === data.length - 1;
          return (
            <g key={d.key}>
              <rect x={x - 4} y={padT} width={bw + 8} height={H - padB - padT} fill="transparent"><title>{`${d.label}: ${d.value} ${measure}`}</title></rect>
              <rect x={x} y={H - padB - h} width={bw} height={Math.max(h, d.value ? 2 : 0)} rx="3" fill={last ? BAR : BAR_SOFT} pointerEvents="none" />
              {(last || d.value === max) && d.value > 0 && <text x={x + bw / 2} y={H - padB - h - 4} textAnchor="middle" fontSize="11" fontWeight="600" fill={INK}>{d.value}</text>}
              <text x={x + bw / 2} y={H - padB + 14} textAnchor="middle" fontSize="9.5" fill={MUTED}>{d.label.length > 12 ? d.label.replace(/ de \d{4}$/, "").slice(0, 12) : d.label}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-xs text-stone-500">{label}. Período selecionado em destaque.</figcaption>
    </figure>
  );
}

/** Indicador com o número de observações e a regra de cálculo. */
export function RateTile({ title, r }: { title: string; r: Rate }) {
  const ex = Object.entries(r.excluded ?? {}).filter(([, v]) => v);
  return (
    <div className="card p-4" title={r.rule}>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{title}</p>
      <p className="mt-1 font-serif text-3xl font-semibold text-riale-900">{pct(r)}</p>
      <p className="text-xs text-stone-500">{r.num} de {r.den} (n = {r.den})</p>
      {ex.length > 0 && <p className="mt-1 text-[11px] text-stone-400">Fora do cálculo: {ex.map(([k, v]) => `${v} ${k}`).join(" · ")}</p>}
      <p className="mt-2 text-[11px] leading-snug text-stone-400">{r.rule}</p>
    </div>
  );
}

/** Barra de SLA: média × meta, com status por rótulo (não só cor). */
export function SlaBar({ mean, target }: { mean: number | null; target: number | null }) {
  if (mean === null) return <span className="text-xs text-stone-400">sem medições</span>;
  const max = Math.max(mean, target ?? 0) * 1.15 || 1;
  const ok = target === null ? null : mean <= target;
  return (
    <div className="w-full">
      <div className="relative h-3 rounded bg-riale-50">
        <div className="h-3 rounded" style={{ width: `${(mean / max) * 100}%`, background: BAR }} />
        {target !== null && <div className="absolute -top-1 h-5 w-0.5 bg-riale-900" style={{ left: `${(target / max) * 100}%` }} title={`Meta: ${target} dias`} />}
      </div>
      <p className="mt-1 text-[11px] text-stone-500">
        Média {fmtDays(mean)}{target !== null ? ` · meta ${fmtDays(target)} · ` : " · meta não definida"}
        {ok === true && <span className="font-medium text-emerald-700">✓ dentro da meta</span>}
        {ok === false && <span className="font-medium text-red-700">▲ acima da meta</span>}
      </p>
    </div>
  );
}
