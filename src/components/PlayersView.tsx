'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { StatsDTO, PlayerStat, Round, Pair } from '@/lib/stats';
import { COMP_COLOR, compColor, compName, fmt, pctOf } from './statsUtil';
import Avatar from './Avatar';
import FormDotsTip from './FormDotsTip';
import { useProfile, type ProfileTarget } from './PlayerProfile';

type Players = PlayerStat[];

/* ---------- Premios ---------- */
type Award = { label: string; people: ProfileTarget[]; num: string; unit: string; mine: boolean };

function leaders(
  players: Players,
  score: (p: PlayerStat) => number | null,
  min: number
): { who: PlayerStat[]; value: number } | null {
  let best: number | null = null;
  for (const p of players) {
    const v = score(p);
    if (v == null || v < min) continue;
    if (best == null || v > best) best = v;
  }
  if (best == null) return null;
  const who = players.filter((p) => score(p) === best);
  // Si todos empatan no es un premio, es un reparto
  if (who.length > 3 || (who.length === players.length && players.length > 2)) return null;
  return { who, value: best };
}

// Los premios parecidos van en la misma fila (rachas, siamesismo con la suegra...), así quedan alineados.
// Si falta uno de la pareja, el otro ocupa la fila entera.
function buildAwards(stats: StatsDTO, meId: string): Award[][] {
  const ps = stats.players;
  const all = new Map<string, Award>();
  const add = (key: string, label: string, l: ReturnType<typeof leaders>, num: (v: number) => string, unit: string) => {
    if (!l) return;
    all.set(key, {
      label,
      people: l.who.map((p) => ({ id: p.playerId, name: p.name, avatar: p.avatar })),
      num: num(l.value),
      unit,
      mine: l.who.some((p) => p.playerId === meId),
    });
  };
  add('lider', 'Líder', leaders(ps, (p) => p.points, 1), String, 'puntos');
  add('acertador', 'Más acertador', leaders(ps, (p) => (p.played >= 8 ? p.pct : null), 0), (v) => `${fmt(v)}%`, 'de acierto');
  add('racha', 'Mejor racha', leaders(ps, (p) => p.bestStreak, 2), String, 'aciertos seguidos');
  add('mala', 'Mala racha', leaders(ps, (p) => p.worstStreak, 3), String, 'fallos seguidos');
  const top = stats.siamese[0];
  if (top) {
    all.set('siamesismo', {
      label: 'Siamesismo',
      people: [top.a, top.b].map((id) => {
        const p = ps.find((x) => x.playerId === id);
        return { id, name: p?.name ?? '?', avatar: p?.avatar ?? null };
      }),
      num: `${fmt(top.pct)}%`,
      unit: 'de pronósticos iguales',
      mine: top.a === meId || top.b === meId,
    });
  }
  add(
    'suegra',
    'La suegra',
    leaders(ps, (p) => (p.played >= 8 && p.brave.n >= 3 ? p.brave.n / p.played : null), 0),
    (v) => `${fmt(v * 100)}%`,
    'a la contra del grupo'
  );
  add('pleno', 'Rey del pleno', leaders(ps, (p) => p.pleno15.h, 1), String, 'plenos al 15');
  add('jornadas', 'Jornadas ganadas', leaders(ps, (p) => p.wins, 1), String, 'jornadas');
  const rows: string[][] = [
    ['lider', 'acertador'],
    ['jornadas', 'pleno'],
    ['racha', 'mala'],
    ['siamesismo', 'suegra'],
  ];
  if (stats.comps.length > 1) {
    for (const c of stats.comps) {
      add(`rey:${c}`, `Rey de ${compName(c)}`, leaders(ps, (p) => p.byComp[c]?.points ?? 0, 1), String, 'puntos');
    }
    rows.push(stats.comps.map((c) => `rey:${c}`));
  }
  return rows
    .map((keys) => keys.map((k) => all.get(k)).filter((x): x is Award => !!x))
    .filter((row) => row.length > 0);
}

function Awards({ stats, meId }: { stats: StatsDTO; meId: string }) {
  const openProfile = useProfile();
  const rows = useMemo(() => buildAwards(stats, meId), [stats, meId]);
  if (!rows.length) return null;
  return (
    <ul className="awards">
      {rows.flatMap((row) =>
        row.map((a) => (
          <li key={a.label} className={`${a.mine ? 'award mine' : 'award'}${row.length === 1 ? ' wide' : ''}`}>
            <span className="award-label">{a.label}</span>
            <b className="award-num">{a.num}</b>
            <small className="award-unit">{a.unit}</small>
            <span className="award-who">
              {a.people.map((p) => (
                <button key={p.id} type="button" className="plink" aria-label={`Ver perfil de ${p.name}`} onClick={() => openProfile(p)}>
                  <Avatar id={p.id} name={p.name} v={p.avatar} size={30} />
                  {p.name}
                </button>
              ))}
            </span>
          </li>
        ))
      )}
    </ul>
  );
}

/* ---------- Puntos por competición (barras apiladas) ---------- */
function PointsBars({ stats, meId }: { stats: StatsDTO; meId: string }) {
  const openProfile = useProfile();
  const max = Math.max(1, ...stats.players.map((p) => p.points));
  return (
    <>
      <ul className="pbars">
        {stats.players.map((p) => (
          <li key={p.playerId} className={p.playerId === meId ? 'me' : ''}>
            <button
              type="button"
              className="pbname plink"
              aria-label={`Ver perfil de ${p.name}`}
              onClick={() => openProfile({ id: p.playerId, name: p.name, avatar: p.avatar })}
            >
              <Avatar id={p.playerId} name={p.name} v={p.avatar} size={32} />
              <span>{p.name}</span>
            </button>
            <span className="pbbar">
              {stats.comps.map((c) => {
                const v = p.byComp[c]?.points ?? 0;
                if (!v) return null;
                return (
                  <i
                    key={c}
                    tabIndex={0}
                    data-tip={`${compName(c)}: ${v} ${v === 1 ? 'punto' : 'puntos'}`}
                    aria-label={`${p.name}, ${compName(c)}: ${v} ${v === 1 ? 'punto' : 'puntos'}`}
                    style={{ width: `${(v / max) * 100}%`, background: compColor(c) }}
                  />
                );
              })}
            </span>
            <b className="pbtot">{p.points}</b>
          </li>
        ))}
      </ul>
      {stats.comps.length > 1 && (
        <ul className="pblegend">
          {stats.comps.map((c) => (
            <li key={c}>
              <i style={{ background: compColor(c) }} />
              {compName(c)}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ---------- Mapa de jornadas ---------- */
function cellStyle(v: number | null, max: number): CSSProperties | undefined {
  if (v == null) return undefined;
  if (v === 0) return { background: 'rgba(255, 107, 107, 0.2)' };
  const r = max > 0 ? v / max : 0;
  return {
    background: `color-mix(in srgb, var(--ok) ${Math.round(28 + 62 * r)}%, var(--panel-2))`,
    color: r >= 0.6 ? '#04231a' : undefined,
  };
}

function Heatmap({ stats, meId }: { stats: StatsDTO; meId: string }) {
  const openProfile = useProfile();
  const { rounds, series } = stats.evolution;
  const scroller = useRef<HTMLDivElement>(null);
  const multi = stats.comps.length > 1;

  // Que se vea lo más reciente: empieza desplazado al final
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [rounds.length]);

  if (!rounds.length) return <p className="muted">Sin partidos terminados todavía.</p>;
  const maxes = rounds.map((_, i) => Math.max(0, ...series.map((s) => s.per[i] ?? 0)));

  return (
    <>
      <div className="hm-scroll" ref={scroller}>
        <table className="hm">
          <thead>
            <tr>
              <th className="hm-name" />
              {rounds.map((r) => (
                <th
                  key={r.key}
                  title={r.label}
                  className={r.done < r.total ? 'part' : undefined}
                  style={multi ? { boxShadow: `inset 0 3px 0 ${compColor(r.comp)}` } : undefined}
                >
                  {r.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.playerId} className={s.playerId === meId ? 'me' : undefined}>
                <th className="hm-name">
                  <button
                    type="button"
                    className="plink"
                    aria-label={`Ver perfil de ${s.name}`}
                    onClick={() => {
                      const pl = stats.players.find((x) => x.playerId === s.playerId);
                      openProfile({ id: s.playerId, name: s.name, avatar: pl?.avatar ?? null });
                    }}
                  >
                    <Avatar id={s.playerId} name={s.name} v={stats.players.find((x) => x.playerId === s.playerId)?.avatar ?? null} size={22} />
                    <span>{s.name}</span>
                  </button>
                </th>
                {s.per.map((v, i) => (
                  <td
                    key={rounds[i].key}
                    className={rounds[i].done < rounds[i].total ? 'part' : undefined}
                    style={cellStyle(v, maxes[i])}
                    title={`${rounds[i].label}: ${v == null ? 'sin pronósticos' : `${v} puntos`}`}
                  >
                    {v == null ? '·' : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------- Comparador con radar ---------- */
const COLOR_A = 'var(--foco)';
const COLOR_B = '#b79cff';
const AXES = ['Acierto', 'Media', 'Racha', 'La suegra', 'Constancia', 'Pleno'];

function axisValues(p: PlayerStat, g: { maxAvg: number; maxStreak: number; maxPleno: number }): number[] {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  return [
    clamp((p.pct ?? 0) / 100),
    clamp((p.avg ?? 0) / g.maxAvg),
    clamp(p.bestStreak / g.maxStreak),
    clamp(p.played ? p.brave.n / p.played / 0.5 : 0),
    clamp(p.played + p.missed ? p.played / (p.played + p.missed) : 0),
    clamp(p.pleno15.h / g.maxPleno),
  ];
}

function Radar({ a, b }: { a: number[]; b: number[] }) {
  const cx = 150;
  const cy = 128;
  const R = 82;
  const pt = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length;
    return [cx + Math.cos(ang) * R * v, cy + Math.sin(ang) * R * v] as const;
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(',')).join(' ');
  return (
    <svg viewBox="0 0 300 256" className="radar" role="img" aria-label="Comparación de perfiles de los dos jugadores">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={poly(AXES.map(() => f))} className="radar-ring" />
      ))}
      {AXES.map((label, i) => {
        const [x, y] = pt(i, 1);
        const [lx, ly] = pt(i, 1.2);
        const anchor = Math.abs(lx - cx) < 4 ? 'middle' : lx > cx ? 'start' : 'end';
        return (
          <g key={label}>
            <line x1={cx} y1={cy} x2={x} y2={y} className="radar-ring" />
            <text x={lx} y={ly + 4} textAnchor={anchor} className="evo-txt">
              {label}
            </text>
          </g>
        );
      })}
      <polygon points={poly(b)} fill={COLOR_B} fillOpacity={0.22} stroke={COLOR_B} strokeWidth={2} strokeLinejoin="round" />
      <polygon points={poly(a)} fill="rgba(255, 210, 63, 0.22)" stroke={COLOR_A} strokeWidth={2.5} strokeLinejoin="round" />
      {a.map((v, i) => (
        <circle key={`a${i}`} cx={pt(i, v)[0]} cy={pt(i, v)[1]} r={3} fill={COLOR_A} />
      ))}
      {b.map((v, i) => (
        <circle key={`b${i}`} cx={pt(i, v)[0]} cy={pt(i, v)[1]} r={3} fill={COLOR_B} />
      ))}
    </svg>
  );
}

function Versus({ stats, meId }: { stats: StatsDTO; meId: string }) {
  const openProfile = useProfile();
  const ps = stats.players;
  const [idA, setIdA] = useState(() => (ps.some((p) => p.playerId === meId) ? meId : ps[0]?.playerId ?? ''));
  const [idB, setIdB] = useState(() => ps.find((p) => p.playerId !== (ps.some((q) => q.playerId === meId) ? meId : ps[0]?.playerId))?.playerId ?? '');

  if (ps.length < 2) return <p className="muted">Hacen falta dos jugadores.</p>;
  const A = ps.find((p) => p.playerId === idA) ?? ps[0];
  const B = ps.find((p) => p.playerId === idB && p.playerId !== A.playerId) ?? ps.find((p) => p.playerId !== A.playerId)!;

  const g = {
    maxAvg: Math.max(1, ...ps.map((p) => p.avg ?? 0)),
    maxStreak: Math.max(1, ...ps.map((p) => p.bestStreak)),
    maxPleno: Math.max(1, ...ps.map((p) => p.pleno15.h)),
  };

  type Row = { label: string; a: number | null; b: number | null; show: (v: number | null) => string; lowerBetter?: boolean };
  const rows: Row[] = [
    { label: 'Puntos', a: A.points, b: B.points, show: (v) => fmt(v) },
    { label: 'Acierto', a: A.pct, b: B.pct, show: (v) => (v == null ? '–' : `${fmt(v)}%`) },
    { label: 'Media por jornada', a: A.avg, b: B.avg, show: (v) => fmt(v, 1) },
    { label: 'Mejor racha', a: A.bestStreak, b: B.bestStreak, show: (v) => fmt(v) },
    { label: 'Mala racha', a: A.worstStreak, b: B.worstStreak, show: (v) => fmt(v), lowerBetter: true },
    { label: 'Jornadas ganadas', a: A.wins, b: B.wins, show: (v) => fmt(v) },
    { label: 'Plenos al 15', a: A.pleno15.h, b: B.pleno15.h, show: (v) => fmt(v) },
  ];
  const better = (r: Row): 'a' | 'b' | null => {
    if (r.a == null || r.b == null || r.a === r.b) return null;
    return (r.a > r.b) !== !!r.lowerBetter ? 'a' : 'b';
  };

  return (
    <>
      <div className="vs-faces">
        <button type="button" className="plink vsface" aria-label={`Ver perfil de ${A.name}`} onClick={() => openProfile({ id: A.playerId, name: A.name, avatar: A.avatar })}>
          <span className="vsring" style={{ borderColor: COLOR_A }}>
            <Avatar id={A.playerId} name={A.name} v={A.avatar} size={64} />
          </span>
          <b>{A.name}</b>
        </button>
        <button type="button" className="plink vsface" aria-label={`Ver perfil de ${B.name}`} onClick={() => openProfile({ id: B.playerId, name: B.name, avatar: B.avatar })}>
          <span className="vsring" style={{ borderColor: COLOR_B }}>
            <Avatar id={B.playerId} name={B.name} v={B.avatar} size={64} />
          </span>
          <b>{B.name}</b>
        </button>
      </div>
      <div className="h2hpick vs-pick">
        <select value={A.playerId} onChange={(e) => setIdA(e.target.value)} aria-label="Primer jugador" style={{ borderColor: COLOR_A }}>
          {ps.map((p) => (
            <option key={p.playerId} value={p.playerId} disabled={p.playerId === B.playerId}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="h2hvs">vs</span>
        <select value={B.playerId} onChange={(e) => setIdB(e.target.value)} aria-label="Segundo jugador" style={{ borderColor: COLOR_B }}>
          {ps.map((p) => (
            <option key={p.playerId} value={p.playerId} disabled={p.playerId === A.playerId}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <Radar a={axisValues(A, g)} b={axisValues(B, g)} />
      <div className="cmps">
        {rows.map((r) => {
          const w = better(r);
          return (
            <div key={r.label} className="cmp">
              <b className={w === 'a' ? 'vs-a' : undefined}>{r.show(r.a)}</b>
              <span>{r.label}</span>
              <b className={w === 'b' ? 'vs-b' : undefined}>{r.show(r.b)}</b>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------- Siamesismo: quién piensa igual que quién ---------- */
function Overlap({ pct, a, b }: { pct: number; a: string; b: string }) {
  // Dos círculos que se solapan más cuanto más parecidos son sus pronósticos
  const r = 46;
  const d = 2 * r * (1 - pct / 100) * 0.92 + 0.08 * 2 * r; // 100% = casi encimados; 0% = rozándose
  const cx = 150;
  const cy = 62;
  const xa = cx - d / 2;
  const xb = cx + d / 2;
  return (
    <svg viewBox="0 0 300 124" className="siam-svg" role="img" aria-label={`${a} y ${b} coinciden un ${fmt(pct)}%`}>
      <circle cx={xa} cy={cy} r={r} fill="rgba(69, 216, 156, 0.22)" stroke="var(--ok)" strokeWidth={2.5} />
      <circle cx={xb} cy={cy} r={r} fill="rgba(183, 156, 255, 0.22)" stroke="#b79cff" strokeWidth={2.5} />
      <text x={cx} y={cy + 9} textAnchor="middle" className="siam-pct">
        {fmt(pct)}%
      </text>
    </svg>
  );
}

function PairRow({ p, meId, avOf }: { p: Pair; meId: string; avOf: Map<string, number | null> }) {
  const mine = p.a === meId || p.b === meId;
  return (
    <li className={mine ? 'siam-row me' : 'siam-row'}>
      <span className="siam-names">
        <Avatar id={p.a} name={p.aName} v={avOf.get(p.a) ?? null} size={26} />
        <span className="siam-n">{p.aName}</span> <i>y</i>
        <Avatar id={p.b} name={p.bName} v={avOf.get(p.b) ?? null} size={26} />
        <span className="siam-n">{p.bName}</span>
      </span>
      <span className="siam-track">
        <i style={{ width: `${p.pct}%` }} />
      </span>
      <span className="siam-val">
        <b>{fmt(p.pct)}%</b>
        <small>
          {p.same}/{p.n}
        </small>
      </span>
    </li>
  );
}

function Siamesismo({ stats, meId }: { stats: StatsDTO; meId: string }) {
  const openProfile = useProfile();
  const avOf = new Map(stats.players.map((p) => [p.playerId, p.avatar] as const));
  const pairs = stats.siamese;
  if (!pairs.length) {
    return (
      <p className="muted">Disponible con 8 partidos en común.</p>
    );
  }
  const top = pairs[0];
  const last = pairs.length > 1 ? pairs[pairs.length - 1] : null;
  const shown = pairs.slice(1, 6);
  const rest = pairs.slice(6);
  return (
    <>
      <div className="siam-hero">
        <Overlap pct={top.pct} a={top.aName} b={top.bName} />
        <div className="siam-who">
          {[
            { id: top.a, name: top.aName, color: 'var(--ok)' },
            { id: top.b, name: top.bName, color: '#b79cff' },
          ].map((x, i) => (
            <Fragment key={x.id}>
              {i > 0 && <span>y</span>}
              <button
                type="button"
                className="plink siam-face"
                aria-label={`Ver perfil de ${x.name}`}
                onClick={() => openProfile({ id: x.id, name: x.name, avatar: avOf.get(x.id) ?? null })}
              >
                <span className="vsring" style={{ borderColor: x.color }}>
                  <Avatar id={x.id} name={x.name} v={avOf.get(x.id) ?? null} size={64} />
                </span>
                <b style={{ color: x.color }}>{x.name}</b>
              </button>
            </Fragment>
          ))}
        </div>
        <p className="siam-sub">
          Coinciden en {top.same} de {top.n} partidos.
        </p>
      </div>

      {shown.length > 0 && (
        <ul className="siam-list">
          {shown.map((p) => (
            <PairRow key={`${p.a}|${p.b}`} p={p} meId={meId} avOf={avOf} />
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <details className="pmore">
          <summary>Todas las parejas ({pairs.length})</summary>
          <ul className="siam-list">
            {rest.map((p) => (
              <PairRow key={`${p.a}|${p.b}`} p={p} meId={meId} avOf={avOf} />
            ))}
          </ul>
        </details>
      )}
      {last && (
        <p className="hint">
          Los más distintos: {last.aName} y {last.bName} ({fmt(last.pct)}%)
        </p>
      )}
    </>
  );
}

/* ---------- Tarjetas de jugador ---------- */
function Ring({ pct }: { pct: number | null }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <svg viewBox="0 0 64 64" className="ring" role="img" aria-label={pct == null ? 'Sin datos' : `${fmt(pct)}% de acierto`}>
      <circle cx="32" cy="32" r={r} className="ring-track" />
      <circle
        cx="32"
        cy="32"
        r={r}
        className="ring-fill"
        strokeDasharray={`${(c * p) / 100} ${c}`}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="38" textAnchor="middle" className="ring-txt">
        {pct == null ? '–' : `${fmt(pct)}%`}
      </text>
    </svg>
  );
}

function Spark({ per, rounds, max }: { per: (number | null)[]; rounds: Round[]; max: number }) {
  if (!rounds.length) return null;
  return (
    <div className="spark-wrap">
      <span className="pcap">Puntos por jornada</span>
      <div className="spark" role="img" aria-label="Puntos de cada jornada">
        {per.map((v, i) => {
          const r = rounds[i];
          return (
            <i
              key={r.key}
              title={`${r.label}: ${v == null ? 'sin pronósticos' : `${v} puntos`}`}
              className={v == null ? 'sp-none' : undefined}
              style={
                v == null
                  ? undefined
                  : {
                      height: `${Math.max(v > 0 ? 8 : 3, (v / max) * 100)}%`,
                      background: v === 0 ? 'var(--line)' : COMP_COLOR[r.comp] ?? 'var(--ok)',
                      opacity: r.done < r.total ? 0.45 : 1,
                    }
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function CompSplit({ p, comps }: { p: PlayerStat; comps: string[] }) {
  return (
    <ul className="csplit">
      {comps.map((c) => {
        const t = p.byComp[c];
        const pct = t && t.played ? (t.hits / t.played) * 100 : null;
        return (
          <li key={c}>
            <span className="cs-name">
              <i style={{ background: compColor(c) }} />
              {compName(c)}
            </span>
            <span className="cs-track">
              <i style={{ width: `${pct ?? 0}%`, background: compColor(c) }} />
            </span>
            <span className="cs-val">
              {pct == null ? '–' : `${fmt(pct)}%`}
              <small>{t ? ` · ${t.points} pts` : ''}</small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

type SortKey = 'points' | 'pct' | 'streak';

// Con quién coincide más (o menos) un jugador, según las parejas calculadas
function twin(pairs: Pair[], id: string, which: 'most' | 'least'): string {
  const mine = pairs.filter((p) => p.a === id || p.b === id);
  if (!mine.length) return '–';
  const p = which === 'most' ? mine[0] : mine[mine.length - 1];
  return `${p.a === id ? p.bName : p.aName} (${fmt(p.pct)}%)`;
}

function PlayerCards({ stats, meId }: { stats: StatsDTO; meId: string }) {
  const openProfile = useProfile();
  const [sort, setSort] = useState<SortKey>('points');
  const { rounds, series } = stats.evolution;
  const perOf = useMemo(() => new Map(series.map((s) => [s.playerId, s.per])), [series]);
  const sparkMax = Math.max(1, ...series.flatMap((s) => s.per.map((v) => v ?? 0)));

  const list = useMemo(() => {
    const val = (p: PlayerStat) => (sort === 'points' ? p.points : sort === 'pct' ? p.pct ?? -1 : p.bestStreak);
    return [...stats.players].sort(
      (a, b) => val(b) - val(a) || b.points - a.points || a.name.localeCompare(b.name, 'es')
    );
  }, [stats.players, sort]);

  const labels: Record<SortKey, string> = { points: 'Puntos', pct: 'Acierto', streak: 'Racha' };
  const multi = stats.comps.length > 1;

  return (
    <>
      <div className="seg" role="group" aria-label="Ordenar jugadores por">
        {(Object.keys(labels) as SortKey[]).map((k) => (
          <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>
            {labels[k]}
          </button>
        ))}
      </div>
      <ul className="players pcards">
        {list.map((p, idx) => (
          <li key={p.playerId} className={`pstat pcard${p.playerId === meId ? ' me' : ''}`}>
            <div className="pc-top">
              <button
                type="button"
                className="plink pc-photo"
                aria-label={`Ver perfil de ${p.name}`}
                onClick={() => openProfile({ id: p.playerId, name: p.name, avatar: p.avatar })}
              >
                <Avatar id={p.playerId} name={p.name} v={p.avatar} size={64} />
              </button>
              <div className="pc-id">
                <span className="pname">
                  <span className="pc-pos">{idx + 1}</span>
                  {p.name}
                  {p.style && (
                    <span className="stylebadge" title={p.style.detail}>
                      {p.style.label}
                    </span>
                  )}
                </span>
                <span className="pc-points">
                  <b>{p.points}</b> puntos
                </span>
                <span className="pline">
                  {p.hits} aciertos de {p.played} pronósticos
                  {p.missed > 0 && `, ${p.missed} sin pronosticar`}
                </span>
              </div>
              <Ring pct={p.pct} />
            </div>

            <FormDotsTip marks={p.form} info={p.formInfo} />
            <Spark per={perOf.get(p.playerId) ?? []} rounds={rounds} max={sparkMax} />
            {multi && <CompSplit p={p} comps={stats.comps} />}

            <div className="pboxes viz">
              {(['1', 'X', '2'] as const).map((k) => {
                const pc = pctOf(p.byPick[k]);
                return (
                  <span key={k} style={{ '--w': `${pc ?? 0}%` } as CSSProperties}>
                    <em>{k}</em>
                    <b>
                      {fmt(pc)}
                      {p.byPick[k].n ? '%' : ''}
                    </b>
                    <small>{p.byPick[k].n} veces</small>
                  </span>
                );
              })}
            </div>

            <details className="pmore">
              <summary>Todos los datos</summary>
              <dl className="pfacts">
                <Fact label="Racha actual" value={String(p.streak)} />
                <Fact label="Mejor racha" value={String(p.bestStreak)} />
                <Fact label="Mejor racha sin pleno al 15" value={String(p.bestStreakNoPleno)} />
                <Fact label="Mala racha (fallos)" value={String(p.worstStreak)} />
                <Fact label="Mejor jornada" value={p.best ? `${p.best.points} (${p.best.round})` : '–'} />
                <Fact label="Peor jornada" value={p.worst ? `${p.worst.points} (${p.worst.round})` : '–'} />
                <Fact label="Media por jornada" value={fmt(p.avg, 1)} />
                <Fact label="Jornadas ganadas" value={String(p.wins)} />
                <Fact label="Plenos (jornada perfecta)" value={String(p.plenos)} />
                <Fact label="Pleno al 15" value={p.pleno15.n ? `${p.pleno15.h} de ${p.pleno15.n}` : '–'} />
                <Fact label="Su siamés" value={twin(stats.siamese, p.playerId, 'most')} />
                <Fact label="Su opuesto" value={twin(stats.siamese, p.playerId, 'least')} />
                <Fact
                  label="La suegra (contra el grupo)"
                  value={p.brave.n ? `${fmt(pctOf(p.brave))}% de ${p.brave.n}` : '–'}
                />
                <Fact label="Equipo gafe" value={p.jinx ? `${p.jinx.team} (${fmt(p.jinx.pct)}%)` : '–'} />
              </dl>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/* ---------- Vista completa ---------- */
export default function PlayersView({ stats, meId }: { stats: StatsDTO; meId: string }) {
  if (!stats.players.length) return <p className="muted empty">Todavía no hay jugadores.</p>;
  if (stats.finished === 0) return <p className="muted empty">Aún no hay partidos terminados.</p>;
  return (
    <>
      <Awards stats={stats} meId={meId} />

      <h2 className="sh">Puntos{stats.comps.length > 1 ? ' por competición' : ''}</h2>
      <PointsBars stats={stats} meId={meId} />

      <h2 className="sh">Mapa de jornadas</h2>
      <Heatmap stats={stats} meId={meId} />

      <h2 className="sh">Cara a cara de jugadores</h2>
      <Versus stats={stats} meId={meId} />

      <h2 className="sh">Siamesismo</h2>
      <Siamesismo stats={stats} meId={meId} />

      <h2 className="sh">Cada jugador</h2>
      <PlayerCards stats={stats} meId={meId} />
    </>
  );
}
