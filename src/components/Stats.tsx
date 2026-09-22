'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { StatsDTO, Rec, TeamAcc, MatchInsight } from '@/lib/stats';
import type { LigaRow, Rec5 } from '@/lib/league';

type View = 'equipos' | 'jugadores' | 'liga' | 'grupo';
type Key = 'total' | 'home' | 'away';

const MIN_TOTAL = 6; // mínimo de pronósticos para sacar conclusiones de un equipo
const MIN_SIDE = 3;

const pctOf = (r: Rec | undefined): number | null => (r && r.n > 0 ? (r.h / r.n) * 100 : null);
const fmt = (n: number | null, d = 0) =>
  n == null ? '–' : n.toLocaleString('es-ES', { maximumFractionDigits: d });

function pickBy<T>(items: T[], f: (x: T) => number | null, dir: 1 | -1): T | null {
  let best: T | null = null;
  let bestV = 0;
  for (const it of items) {
    const v = f(it);
    if (v == null) continue;
    if (best == null || (v - bestV) * dir > 0) {
      best = it;
      bestV = v;
    }
  }
  return best;
}

function Crest({
  src,
  name,
  onClick,
}: {
  src: string | null;
  name?: string;
  onClick?: (name: string) => void;
}) {
  const img = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className="screst" />
  ) : (
    <span className="screst" />
  );
  if (!name || !onClick) return img;
  return (
    <button type="button" className="crestbtn" onClick={() => onClick(name)}>
      {img}
    </button>
  );
}

function PctCell({ rec }: { rec: Rec }) {
  const p = pctOf(rec);
  const style = p != null ? ({ '--w': `${p}%` } as CSSProperties) : undefined;
  return (
    <span className="pct" style={style}>
      <b>{p != null ? `${fmt(p)}%` : '–'}</b>
      <small>{rec.n ? `${rec.h}/${rec.n}` : ''}</small>
    </span>
  );
}

/* ---------- Equipos: % de acierto por equipo ---------- */
function Equipos({ stats, onTeamClick }: { stats: StatsDTO; onTeamClick: (name: string) => void }) {
  const [who, setWho] = useState('*');
  const [sortKey, setSortKey] = useState<Key>('total');

  const rows = useMemo(() => {
    const zero: Rec = { h: 0, n: 0 };
    return stats.teams
      .map((t) => {
        const c = t.acc[who];
        return { t, total: c?.total ?? zero, home: c?.home ?? zero, away: c?.away ?? zero };
      })
      .sort((a, b) => {
        const pa = pctOf(a[sortKey]);
        const pb = pctOf(b[sortKey]);
        if (pa == null && pb == null) return a.t.team.localeCompare(b.t.team, 'es');
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pb - pa || b[sortKey].n - a[sortKey].n || a.t.team.localeCompare(b.t.team, 'es');
      });
  }, [stats.teams, who, sortKey]);

  const withData = rows.filter((r) => r.total.n > 0);
  const insights: { label: string; t: TeamAcc; text: string }[] = [];
  const add = (label: string, t: TeamAcc | undefined, text: string) => {
    if (t) insights.push({ label, t, text });
  };

  const top = pickBy(withData.filter((r) => r.total.n >= MIN_TOTAL), (r) => pctOf(r.total), 1);
  const low = pickBy(withData.filter((r) => r.total.n >= MIN_TOTAL), (r) => pctOf(r.total), -1);
  const homeTop = pickBy(rows.filter((r) => r.home.n >= MIN_SIDE), (r) => pctOf(r.home), 1);
  const awayLow = pickBy(rows.filter((r) => r.away.n >= MIN_SIDE), (r) => pctOf(r.away), -1);
  if (top) add('Más predecible', top.t, `${fmt(pctOf(top.total))}% de acierto`);
  if (low) add('El que más engaña', low.t, `${fmt(pctOf(low.total))}% de acierto`);
  if (homeTop) add('Más fácil en casa', homeTop.t, `${fmt(pctOf(homeTop.home))}% de acierto de local`);
  if (awayLow) add('Más difícil fuera', awayLow.t, `${fmt(pctOf(awayLow.away))}% de acierto de visitante`);

  if (who === '*') {
    const gap = (t: TeamAcc) =>
      t.pj >= 4 && t.pickedN > 0 ? (t.pickedWin / t.pickedN - t.won / t.pj) * 100 : null;
    const over = pickBy(stats.teams, gap, 1);
    const under = pickBy(stats.teams, gap, -1);
    const line = (t: TeamAcc) =>
      `Le dais la victoria el ${fmt((t.pickedWin / t.pickedN) * 100)}% de las veces y gana el ${fmt(
        (t.won / t.pj) * 100
      )}%`;
    if (over && (gap(over) ?? 0) > 5) add('Sobrevalorado', over, line(over));
    if (under && (gap(under) ?? 0) < -5) add('Infravalorado', under, line(under));
  }

  const head = (key: Key, label: string) => (
    <button
      type="button"
      className="hbtn"
      aria-pressed={sortKey === key}
      onClick={() => setSortKey(key)}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="field inline">
        <label htmlFor="who">Ver el acierto de</label>
        <select id="who" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="*">Todo el grupo</option>
          {stats.players.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {insights.length > 0 && (
        <ul className="insights">
          {insights.map((i) => (
            <li key={i.label}>
              <span className="il">{i.label}</span>
              <span className="iv">
                <Crest src={i.t.crest} name={i.t.team} onClick={onTeamClick} />
                {i.t.team}
              </span>
              <span className="is">{i.text}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="hint">
        Porcentaje de pronósticos acertados en los partidos de cada equipo. Pulsa una columna para
        ordenar.
      </p>
      <div className="agrid head">
        <span />
        {head('total', 'Total')}
        {head('home', 'Local')}
        {head('away', 'Visitante')}
      </div>
      <ul className="alist">
        {rows.map((r) => (
          <li key={r.t.team} className="agrid">
            <span className="ateam">
              <Crest src={r.t.crest} name={r.t.team} onClick={onTeamClick} />
              <span className="aname">{r.t.team}</span>
            </span>
            <PctCell rec={r.total} />
            <PctCell rec={r.home} />
            <PctCell rec={r.away} />
          </li>
        ))}
      </ul>
      {withData.length === 0 && (
        <p className="muted empty">Aún no hay partidos terminados con pronósticos.</p>
      )}
    </>
  );
}

/* ---------- Jugadores ---------- */
function Jugadores({ stats, meId }: { stats: StatsDTO; meId: string }) {
  if (!stats.players.length) return <p className="muted empty">Todavía no hay jugadores.</p>;
  return (
    <ul className="players">
      {stats.players.map((p) => (
        <li key={p.playerId} className={`pstat${p.playerId === meId ? ' me' : ''}`}>
          <div className="phead">
            <span className="pname">{p.name}</span>
            <span className="ppct">{p.pct != null ? `${fmt(p.pct)}%` : '–'}</span>
          </div>
          <p className="pline">
            {p.hits} aciertos de {p.played} pronósticos
            {p.missed > 0 && `, ${p.missed} sin pronosticar`}
          </p>
          <div className="pboxes">
            {(['1', 'X', '2'] as const).map((k) => (
              <span key={k}>
                <em>{k}</em>
                <b>{fmt(pctOf(p.byPick[k]))}{p.byPick[k].n ? '%' : ''}</b>
                <small>{p.byPick[k].n} veces</small>
              </span>
            ))}
          </div>
          <dl className="pfacts">
            <div>
              <dt>Racha actual</dt>
              <dd>{p.streak}</dd>
            </div>
            <div>
              <dt>Mejor racha</dt>
              <dd>{p.bestStreak}</dd>
            </div>
            <div>
              <dt>Jornadas ganadas</dt>
              <dd>{p.wins}</dd>
            </div>
            <div>
              <dt>Plenos</dt>
              <dd>{p.plenos}</dd>
            </div>
            <div>
              <dt>Mejor jornada</dt>
              <dd>{p.best ? `${p.best.points} (J${p.best.matchday})` : '–'}</dd>
            </div>
            <div>
              <dt>Peor jornada</dt>
              <dd>{p.worst ? `${p.worst.points} (J${p.worst.matchday})` : '–'}</dd>
            </div>
            <div>
              <dt>Media por jornada</dt>
              <dd>{fmt(p.avg, 1)}</dd>
            </div>
            <div>
              <dt>Valentía (contra el grupo)</dt>
              <dd>{p.brave.n ? `${fmt(pctOf(p.brave))}% de ${p.brave.n}` : '–'}</dd>
            </div>
            <div>
              <dt>Equipo gafe</dt>
              <dd>{p.jinx ? `${p.jinx.team} (${fmt(p.jinx.pct)}%)` : '–'}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Clasificación real de la Liga ---------- */
function Liga({ liga, onTeamClick }: { liga: LigaRow[]; onTeamClick: (name: string) => void }) {
  const [scope, setScope] = useState<Key>('total');
  const rows = useMemo(() => {
    const dg = (r: Rec5) => r.gf - r.gc;
    return [...liga]
      .sort(
        (a, b) =>
          b[scope].pts - a[scope].pts ||
          dg(b[scope]) - dg(a[scope]) ||
          b[scope].gf - a[scope].gf ||
          a.team.localeCompare(b.team, 'es')
      )
      .map((r, i) => ({ r, pos: i + 1, s: r[scope] }));
  }, [liga, scope]);

  const labels: Record<Key, string> = { total: 'General', home: 'Local', away: 'Visitante' };
  return (
    <>
      <div className="seg" role="group" aria-label="Tipo de clasificación de la Liga">
        {(['total', 'home', 'away'] as Key[]).map((k) => (
          <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)}>
            {labels[k]}
          </button>
        ))}
      </div>
      <div className="lgrid head">
        <span>#</span>
        <span>Equipo</span>
        <span>PJ</span>
        <span>DG</span>
        <span>Pts</span>
        <span>Forma</span>
      </div>
      <ol className="llist">
        {rows.map(({ r, pos, s }) => (
          <li key={r.team} className="lgrid">
            <span className="lpos">{pos}</span>
            <span className="ateam">
              <Crest src={r.crest} name={r.team} onClick={onTeamClick} />
              <span className="aname">{r.team}</span>
            </span>
            <span>{s.pj}</span>
            <span>{s.gf - s.gc > 0 ? `+${s.gf - s.gc}` : s.gf - s.gc}</span>
            <b>{s.pts}</b>
            <span className="form" aria-hidden={scope !== 'total'}>
              {scope === 'total' &&
                r.form.map((f, i) => <i key={i} className={`f f-${f}`} />)}
            </span>
          </li>
        ))}
      </ol>
      <p className="hint">
        Calculada con los resultados de la app. Desempate simplificado: diferencia de goles y goles a
        favor.
      </p>
    </>
  );
}

/* ---------- Evolución (gráfica) ---------- */
const PALETTE = ['#45d89c', '#5ab1ff', '#ff8fab', '#b79cff', '#ff9f5a', '#7fe0e6', '#c5e063', '#f2a6ff', '#9aa9ff', '#e0b48a'];

function Evolution({ ev, meId }: { ev: StatsDTO['evolution']; meId: string }) {
  if (ev.matchdays.length < 2) {
    return (
      <p className="muted">La gráfica aparece cuando se hayan jugado partidos de dos jornadas.</p>
    );
  }
  const W = 480;
  const H = 230;
  const pad = { l: 30, r: 10, t: 10, b: 26 };
  const n = ev.matchdays.length;
  const maxY = Math.max(1, ...ev.series.flatMap((s) => s.values));
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (n - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / maxY);
  const step = Math.ceil(n / 8);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxY * f));

  const colorOf = (id: string, i: number) => (id === meId ? 'var(--foco)' : PALETTE[i % PALETTE.length]);
  const ordered = ev.series
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.playerId === meId ? 1 : 0) - (b.s.playerId === meId ? 1 : 0));
  const legend = [...ev.series]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.values[n - 1] - a.s.values[n - 1] || a.s.name.localeCompare(b.s.name, 'es'));

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="evo" role="img" aria-label="Evolución de aciertos acumulados por jornada">
        {ticks.map((t, k) => (
          <g key={k}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="evo-grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="evo-txt">
              {t}
            </text>
          </g>
        ))}
        {ev.matchdays.map((md, i) =>
          i % step === 0 || i === n - 1 ? (
            <text key={md} x={x(i)} y={H - 6} textAnchor="middle" className="evo-txt">
              J{md}
            </text>
          ) : null
        )}
        {ordered.map(({ s, i }) => (
          <polyline
            key={s.playerId}
            fill="none"
            stroke={colorOf(s.playerId, i)}
            strokeWidth={s.playerId === meId ? 3.5 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={s.values.map((v, k) => `${x(k)},${y(v)}`).join(' ')}
          />
        ))}
      </svg>
      <ul className="legend">
        {legend.map(({ s, i }) => (
          <li key={s.playerId}>
            <i style={{ background: colorOf(s.playerId, i) }} />
            {s.name}
            <b>{s.values[n - 1]}</b>
          </li>
        ))}
      </ul>
    </>
  );
}

function InsightList({ items }: { items: MatchInsight[] }) {
  if (!items.length) return <p className="muted">Todavía no hay partidos suficientes.</p>;
  return (
    <ul className="ilist">
      {items.map((m) => (
        <li key={m.matchId}>
          <span className="imd">J{m.matchday}</span>
          <span className="imatch">
            {m.home} {m.homeScore}-{m.awayScore} {m.away}
          </span>
          <span className="ihits">
            {m.hits} de {m.n}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Grupo ---------- */
function Grupo({ stats, meId }: { stats: StatsDTO; meId: string }) {
  const g = stats.group;
  const totalRes = g.results['1'] + g.results.X + g.results['2'];
  const totalPicks = g.picks['1'] + g.picks.X + g.picks['2'];
  const rows: { k: '1' | 'X' | '2'; label: string }[] = [
    { k: '1', label: 'Gana el local (1)' },
    { k: 'X', label: 'Empate (X)' },
    { k: '2', label: 'Gana el visitante (2)' },
  ];
  const share = (n: number, t: number) => (t ? `${fmt((n / t) * 100)}%` : '–');

  return (
    <>
      <h2 className="sh">Lo que pasa y lo que pronosticáis</h2>
      {totalRes === 0 ? (
        <p className="muted">Aún no hay partidos terminados.</p>
      ) : (
        <div className="ggrid">
          <span />
          <span className="gh">Pasa</span>
          <span className="gh">Pronosticáis</span>
          <span className="gh">Acertáis</span>
          {rows.map((r) => (
            <div key={r.k} className="grow">
              <span className="glabel">{r.label}</span>
              <b>{share(g.results[r.k], totalRes)}</b>
              <b>{share(g.picks[r.k], totalPicks)}</b>
              <b>{fmt(pctOf(g.hitByResult[r.k]))}{g.hitByResult[r.k].n ? '%' : ''}</b>
            </div>
          ))}
        </div>
      )}

      <h2 className="sh">Evolución de aciertos</h2>
      <Evolution ev={stats.evolution} meId={meId} />

      <h2 className="sh">Los partidos que más engañaron</h2>
      <InsightList items={g.hardest} />

      <h2 className="sh">Los más fáciles</h2>
      <InsightList items={g.easiest} />
    </>
  );
}

/* ---------- Contenedor ---------- */
export default function Stats({
  meId,
  competition,
  version,
  onTeamClick,
}: {
  meId: string;
  competition: string;
  version: number;
  onTeamClick: (name: string) => void;
}) {
  const [stats, setStats] = useState<StatsDTO | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>('equipos');

  useEffect(() => {
    let alive = true;
    fetch(`/api/stats?competition=${competition}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((j: StatsDTO) => {
        if (alive) {
          setStats(j);
          setFailed(false);
        }
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [version, competition]);

  if (failed && !stats) return <p className="notice">No se pudieron cargar las estadísticas.</p>;
  if (!stats) return <p className="muted empty">Calculando estadísticas…</p>;

  const views: [View, string][] = [
    ['equipos', 'Equipos'],
    ['jugadores', 'Jugadores'],
    ['liga', 'Liga'],
    ['grupo', 'Grupo'],
  ];

  return (
    <>
      <div className="seg wrapseg" role="group" aria-label="Tipo de estadísticas">
        {views.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>
            {label}
          </button>
        ))}
      </div>
      <p className="hint">{stats.finished} partidos terminados en la temporada.</p>
      {view === 'equipos' && <Equipos stats={stats} onTeamClick={onTeamClick} />}
      {view === 'jugadores' && <Jugadores stats={stats} meId={meId} />}
      {view === 'liga' && <Liga liga={stats.liga} onTeamClick={onTeamClick} />}
      {view === 'grupo' && <Grupo stats={stats} meId={meId} />}
    </>
  );
}
