'use client';

import { useMemo, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { StatsDTO } from '@/lib/stats';
import { compColor } from './statsUtil';

type Ev = StatsDTO['evolution'];
export type EvoMode = 'puntos' | 'posicion' | 'lider';

const MODES: { id: EvoMode; label: string; aria: string }[] = [
  { id: 'puntos', label: 'Puntos', aria: 'puntos acumulados' },
  { id: 'posicion', label: 'Posición', aria: 'posición en la clasificación' },
  { id: 'lider', label: 'Vs. líder', aria: 'diferencia de puntos con el líder' },
];

const PALETTE = ['#1fa970', '#2f8fe0', '#e0577f', '#8a63e8', '#e8782c', '#17a5b0', '#8fb21a', '#c24fd6', '#5b6ee0', '#b98550'];
// A partir del jugador 11 se repiten los colores: cambia el trazo para no confundir las líneas
const DASHES = ['', '6 3', '2 3'];

const W = 520;
const H = 270;
const pad = { l: 34, r: 14, t: 16, b: 28 };
const IW = W - pad.l - pad.r;
const IH = H - pad.t - pad.b;

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

// Escala "bonita" con 4-5 marcas: 0, 10, 20, 30...
function niceTop(max: number): { step: number; top: number } {
  const step = Math.max(1, niceStep(max / 4));
  return { step, top: Math.ceil(max / step) * step };
}

type Player = {
  id: string;
  name: string;
  i: number;
  color: string;
  dash: string;
  values: number[]; // puntos acumulados
  per: (number | null)[]; // puntos de cada ronda
  pos: number[]; // puesto en cada ronda (los empates comparten puesto)
  gap: number[]; // puntos − puntos del líder (≤ 0)
};

export default function Evolution({
  ev,
  meId,
  comps,
  initialMode = 'puntos',
}: {
  ev: Ev;
  meId: string;
  comps: number;
  initialMode?: EvoMode;
}) {
  const [mode, setMode] = useState<EvoMode>(initialMode);
  const [selRaw, setSel] = useState<number | null>(null);
  const [focus, setFocus] = useState<string[]>([]);

  const n = ev.rounds.length;

  const players: Player[] = useMemo(() => {
    const lead = Array.from({ length: n }, (_, k) => Math.max(0, ...ev.series.map((s) => s.values[k] ?? 0)));
    return ev.series.map((s, i) => ({
      id: s.playerId,
      name: s.name,
      i,
      color: s.playerId === meId ? 'var(--foco)' : PALETTE[i % PALETTE.length],
      dash: s.playerId === meId ? '' : DASHES[Math.floor(i / PALETTE.length) % DASHES.length],
      values: s.values,
      per: s.per,
      pos: s.values.map((v, k) => 1 + ev.series.filter((o) => (o.values[k] ?? 0) > v).length),
      gap: s.values.map((v, k) => v - lead[k]),
    }));
  }, [ev, meId, n]);

  if (n < 2) return <p className="muted">Disponible tras dos jornadas.</p>;
  if (!players.length) return <p className="muted">Todavía no hay jugadores con puntos.</p>;

  const N = players.length;
  const sel = Math.min(n - 1, selRaw ?? n - 1);
  const cur = MODES.find((m) => m.id === mode) ?? MODES[0];

  // ---- escalas ----
  const maxPts = Math.max(1, ...players.flatMap((p) => p.values));
  const maxGap = Math.max(1, ...players.flatMap((p) => p.gap.map((g) => -g)));
  const dom = niceTop(mode === 'lider' ? maxGap : maxPts);
  const x = (k: number) => pad.l + (k * IW) / (n - 1);
  const yOf = (p: Player, k: number): number => {
    if (mode === 'puntos') return pad.t + IH * (1 - p.values[k] / dom.top);
    if (mode === 'lider') return pad.t + IH * (-p.gap[k] / dom.top);
    return N <= 1 ? pad.t + IH / 2 : pad.t + IH * ((p.pos[k] - 1) / (N - 1));
  };

  const ticks: { y: number; label: string }[] = [];
  if (mode === 'posicion') {
    const every = Math.max(1, Math.ceil(N / 6));
    for (let pos = 1; pos <= N; pos += every) {
      ticks.push({ y: N <= 1 ? pad.t + IH / 2 : pad.t + IH * ((pos - 1) / (N - 1)), label: String(pos) });
    }
  } else {
    for (let v = 0; v <= dom.top; v += dom.step) {
      ticks.push(
        mode === 'puntos'
          ? { y: pad.t + IH * (1 - v / dom.top), label: String(v) }
          : { y: pad.t + IH * (v / dom.top), label: v === 0 ? '0' : `−${v}` }
      );
    }
  }

  const step = Math.ceil(n / 8);
  const showLabel = (i: number) => i === n - 1 || (i % step === 0 && n - 1 - i >= Math.ceil(step / 2));

  // ---- interacción ----
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const k = Math.round(((px - pad.l) / IW) * (n - 1));
    setSel(Math.max(0, Math.min(n - 1, k)));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const to = (k: number) => {
      e.preventDefault();
      setSel(Math.max(0, Math.min(n - 1, k)));
    };
    if (e.key === 'ArrowLeft') to(sel - 1);
    else if (e.key === 'ArrowRight') to(sel + 1);
    else if (e.key === 'Home') to(0);
    else if (e.key === 'End') to(n - 1);
  };
  const toggle = (id: string) => setFocus((f) => (f.includes(id) ? f.filter((v) => v !== id) : [...f, id]));

  const dimmed = (p: Player) => focus.length > 0 && !focus.includes(p.id) && p.id !== meId;
  const weight = (p: Player) => (p.id === meId ? 3.5 : dimmed(p) ? 1.5 : focus.includes(p.id) ? 3 : 2);
  const layer = (p: Player) => (p.id === meId ? 2 : focus.includes(p.id) ? 1 : 0);
  const drawn = [...players].sort((a, b) => layer(a) - layer(b) || a.i - b.i);

  const order = [...players].sort((a, b) => b.values[sel] - a.values[sel] || a.name.localeCompare(b.name, 'es'));
  const round = ev.rounds[sel];
  const partial = round.done < round.total;

  const sub = (p: Player): { text: string; cls: string; title?: string } => {
    if (mode === 'puntos') {
      const v = p.per[sel];
      return { text: v == null ? '–' : `+${v}`, cls: '', title: v == null ? 'No pronosticó esta jornada' : 'Puntos de esta jornada' };
    }
    if (mode === 'posicion') {
      if (sel === 0) return { text: '', cls: '' };
      const mv = p.pos[sel - 1] - p.pos[sel];
      if (mv > 0) return { text: `▲${mv}`, cls: 'evo-up', title: `Sube ${mv} puesto${mv > 1 ? 's' : ''}` };
      if (mv < 0) return { text: `▼${-mv}`, cls: 'evo-down', title: `Baja ${-mv} puesto${mv < -1 ? 's' : ''}` };
      return { text: '=', cls: '', title: 'Mantiene el puesto' };
    }
    const g = p.gap[sel];
    return { text: g === 0 ? 'líder' : `−${-g}`, cls: g === 0 ? 'evo-up' : '', title: 'Diferencia con el líder' };
  };

  return (
    <div className="evo-wrap">
      <div className="seg evo-modes" role="group" aria-label="Tipo de gráfica">
        {MODES.map((m) => (
          <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="evo"
        role="img"
        tabIndex={0}
        aria-label={`Evolución de ${cur.aria} por jornada. Usa las flechas para cambiar de jornada.`}
        onPointerDown={pick}
        onPointerMove={pick}
        onKeyDown={onKey}
      >
        {ticks.map((t, k) => (
          <g key={k}>
            <line x1={pad.l} x2={W - pad.r} y1={t.y} y2={t.y} className="evo-grid" />
            <text x={pad.l - 6} y={t.y + 4} textAnchor="end" className="evo-txt">
              {t.label}
            </text>
          </g>
        ))}

        {comps > 1 &&
          ev.rounds.map((r, i) =>
            i > 0 && r.comp !== ev.rounds[i - 1].comp ? (
              <line key={`sep-${r.key}`} x1={(x(i) + x(i - 1)) / 2} x2={(x(i) + x(i - 1)) / 2} y1={pad.t} y2={H - pad.b} className="evo-sep" />
            ) : null
          )}

        {ev.rounds.map((r, i) =>
          showLabel(i) || i === sel ? (
            <text
              key={r.key}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              className={i === sel ? 'evo-txt evo-txt-sel' : 'evo-txt'}
              style={comps > 1 && i !== sel ? { fill: compColor(r.comp) } : undefined}
            >
              {r.short}
            </text>
          ) : null
        )}

        <line x1={x(sel)} x2={x(sel)} y1={pad.t} y2={H - pad.b} className="evo-guide" />

        {drawn.map((p) => (
          <polyline
            key={p.id}
            className="evo-line"
            fill="none"
            stroke={p.color}
            strokeWidth={weight(p)}
            strokeDasharray={p.dash || undefined}
            opacity={dimmed(p) ? 0.18 : 1}
            points={p.values.map((_, k) => `${x(k).toFixed(1)},${yOf(p, k).toFixed(1)}`).join(' ')}
          />
        ))}

        {drawn
          .filter((p) => p.id === meId)
          .map((p) =>
            p.values.map((_, k) =>
              k === sel ? null : <circle key={`${p.id}-${k}`} cx={x(k)} cy={yOf(p, k)} r={2.5} fill={p.color} className="evo-dot" />
            )
          )}

        {drawn
          .filter((p) => !dimmed(p))
          .map((p) => (
            <circle key={`sel-${p.id}`} cx={x(sel)} cy={yOf(p, sel)} r={p.id === meId ? 5 : 4} fill={p.color} className="evo-dot" />
          ))}
      </svg>

      <div className="evo-head" aria-live="polite">
        <b>{round.label}</b>
        {partial && <small>{round.done} de {round.total} partidos</small>}
        <span className="evo-nav">
          <button type="button" aria-label="Jornada anterior" disabled={sel <= 0} onClick={() => setSel(sel - 1)}>
            ‹
          </button>
          <button type="button" aria-label="Jornada siguiente" disabled={sel >= n - 1} onClick={() => setSel(sel + 1)}>
            ›
          </button>
        </span>
      </div>

      <ul className="evo-list">
        {order.map((p) => {
          const s = sub(p);
          const on = focus.includes(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                className={p.id === meId ? 'evo-row me' : 'evo-row'}
                aria-pressed={on}
                onClick={() => toggle(p.id)}
                style={dimmed(p) ? { opacity: 0.5 } : undefined}
              >
                <span className="evo-rank">{p.pos[sel]}º</span>
                <svg width="22" height="8" aria-hidden="true">
                  <line x1="1" x2="21" y1="4" y2="4" stroke={p.color} strokeWidth="3" strokeLinecap="round" strokeDasharray={p.dash || undefined} />
                </svg>
                <span className="evo-name">
                  {p.name}
                  {p.id === meId && <small> tú</small>}
                </span>
                <span className={`evo-sub ${s.cls}`} title={s.title}>
                  {s.text}
                </span>
                <b className="evo-pts">{p.values[sel]}</b>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="muted evo-hint">
        Toca la gráfica para ver cada jornada y un jugador para resaltarlo.
        {focus.length > 0 && (
          <>
            {' '}
            <button type="button" className="link" onClick={() => setFocus([])}>
              Ver todos
            </button>
          </>
        )}
      </p>
    </div>
  );
}
