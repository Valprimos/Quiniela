'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { StatsDTO, Rec, TeamAcc, MatchInsight } from '@/lib/stats';
import type { LigaRow, Rec5 } from '@/lib/league';
import { H2HBody } from './H2HModal';
import PlayersView from './PlayersView';
import LuckCard from './LuckCard';
import CompLogo from './CompLogo';
import { StatsSkeleton } from './Skeleton';
import { fetchJson, load, peek } from '@/lib/clientCache';
import { compColor, compName, fmt, pctOf } from './statsUtil';
import { COMPETITIONS } from '@/lib/competitions';

type View = 'equipos' | 'jugadores' | 'liga' | 'grupo' | 'h2h';
type Key = 'total' | 'home' | 'away';

const MIN_TOTAL = 6; // mínimo de pronósticos para sacar conclusiones de un equipo
const MIN_SIDE = 3;

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
  onClick?: (name: string, crest: string | null) => void;
}) {
  const img = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className="screst" />
  ) : (
    <span className="screst" />
  );
  if (!name || !onClick) return img;
  return (
    <button type="button" className="crestbtn" onClick={() => onClick(name, src)}>
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
function Equipos({ stats, onTeamClick }: { stats: StatsDTO; onTeamClick: (name: string, crest: string | null) => void }) {
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

      <p className="hint">Toca una columna para ordenar.</p>
      <div className="agrid head">
        <span />
        {head('total', 'Total')}
        {head('home', 'Local')}
        {head('away', 'Visitante')}
      </div>
      <ul className="alist">
        {rows.map((r) => (
          <li key={r.t.team} className="agrid">
            <button type="button" className="ateam ateambtn" onClick={() => onTeamClick(r.t.team, r.t.crest)}>
              <Crest src={r.t.crest} />
              <span className="aname">{r.t.team}</span>
            </button>
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

/* ---------- Clasificación real de la Liga ---------- */
function Liga({ liga, onTeamClick }: { liga: LigaRow[]; onTeamClick: (name: string, crest: string | null) => void }) {
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
            <button type="button" className="ateam ateambtn" onClick={() => onTeamClick(r.team, r.crest)}>
              <Crest src={r.crest} />
              <span className="aname">{r.team}</span>
            </button>
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
      <p className="hint">Calculada con los resultados de la app.</p>
    </>
  );
}

/* ---------- Evolución (gráfica) ---------- */
const PALETTE = ['#1fa970', '#2f8fe0', '#e0577f', '#8a63e8', '#e8782c', '#17a5b0', '#8fb21a', '#c24fd6', '#5b6ee0', '#b98550'];

function Evolution({ ev, meId, comps }: { ev: StatsDTO['evolution']; meId: string; comps: number }) {
  if (ev.rounds.length < 2) {
    return (
      <p className="muted">Disponible tras dos jornadas.</p>
    );
  }
  const W = 480;
  const H = 230;
  const pad = { l: 30, r: 10, t: 10, b: 26 };
  const n = ev.rounds.length;
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
      <svg viewBox={`0 0 ${W} ${H}`} className="evo" role="img" aria-label="Evolución de puntos acumulados por jornada">
        {ticks.map((t, k) => (
          <g key={k}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="evo-grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="evo-txt">
              {t}
            </text>
          </g>
        ))}
        {ev.rounds.map((r, i) =>
          i % step === 0 || i === n - 1 ? (
            <text
              key={r.key}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              className="evo-txt"
              style={comps > 1 ? { fill: compColor(r.comp) } : undefined}
            >
              {r.short}
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
          <span className="imd">{m.round}</span>
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

      {stats.comps.length > 1 && (
        <>
          <h2 className="sh">Acierto por competición</h2>
          <ul className="csplit grpsplit">
            {stats.comps.map((c) => {
              const pc = pctOf(g.byComp[c]);
              return (
                <li key={c}>
                  <span className="cs-name">
                    <i style={{ background: compColor(c) }} />
                    {compName(c)}
                  </span>
                  <span className="cs-track">
                    <i style={{ width: `${pc ?? 0}%`, background: compColor(c) }} />
                  </span>
                  <span className="cs-val">
                    {pc == null ? '–' : `${fmt(pc)}%`}
                    <small>{g.byComp[c]?.n ? ` · ${g.byComp[c].h}/${g.byComp[c].n}` : ''}</small>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h2 className="sh">Evolución de puntos</h2>
      <Evolution ev={stats.evolution} meId={meId} comps={stats.comps.length} />

      <h2 className="sh">Índice de suerte</h2>
      <LuckCard luck={stats.luck} meId={meId} />

      <h2 className="sh">Los partidos que más engañaron</h2>
      <InsightList items={g.hardest} />

      <h2 className="sh">Los más fáciles</h2>
      <InsightList items={g.easiest} />
    </>
  );
}

/* ---------- Cara a cara ---------- */
function H2H({ teams }: { teams: { team: string; crest: string | null }[] }) {
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const crestOf = (name: string) => teams.find((t) => t.team === name)?.crest ?? null;

  return (
    <>
      <div className="h2hpick">
        <select value={teamA} onChange={(e) => setTeamA(e.target.value)}>
          <option value="">Elige un equipo</option>
          {teams.map((t) => (
            <option key={t.team} value={t.team} disabled={t.team === teamB}>
              {t.team}
            </option>
          ))}
        </select>
        <span className="h2hvs">vs</span>
        <select value={teamB} onChange={(e) => setTeamB(e.target.value)}>
          <option value="">Elige un equipo</option>
          {teams.map((t) => (
            <option key={t.team} value={t.team} disabled={t.team === teamA}>
              {t.team}
            </option>
          ))}
        </select>
      </div>

      {!teamA || !teamB ? (
        <p className="muted empty">Elige dos equipos para ver sus enfrentamientos directos.</p>
      ) : teamA === teamB ? (
        <p className="muted empty">Elige dos equipos distintos.</p>
      ) : (
        <H2HBody teamA={teamA} teamB={teamB} crestA={crestOf(teamA)} crestB={crestOf(teamB)} />
      )}
    </>
  );
}

/* ---------- Contenedor ---------- */
type Scope = 'comp' | 'all';
const SCOPED: View[] = ['equipos', 'jugadores', 'grupo'];

// Las estadísticas se guardan en memoria: al volver a una vista (o abrir el perfil de un jugador) se ven
// al instante y solo se piden de nuevo si han pasado más de 60 s o ha terminado algún partido.
function useStats(meId: string, competition: string, version: number, enabled: boolean) {
  const key = `stats:${meId}:${competition}`;
  const [stats, setStats] = useState<StatsDTO | null>(() => (enabled ? peek<StatsDTO>(key) ?? null : null));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setStats(peek<StatsDTO>(key) ?? null);
    setFailed(false);
    load(key, () => fetchJson<StatsDTO>(`/api/stats?competition=${competition}`), { ttl: 60_000, tag: version })
      .then((j) => alive && setStats(j))
      .catch(() => alive && !peek(key) && setFailed(true));
    return () => {
      alive = false;
    };
  }, [key, version, enabled, competition]);
  return { stats, failed };
}

export default function Stats({
  meId,
  competition,
  version,
  onTeamClick,
}: {
  meId: string;
  competition: string;
  version: number;
  onTeamClick: (name: string, crest: string | null) => void;
}) {
  const [view, setView] = useState<View>('jugadores');
  const [scope, setScope] = useState<Scope>('comp');

  const wantAll = scope === 'all' && SCOPED.includes(view);
  const one = useStats(meId, competition, version, !wantAll);
  const all = useStats(meId, 'ALL', version, wantAll);
  const cur = wantAll ? all : one;
  const stats = cur.stats;

  const views: [View, string][] = [
    ['jugadores', 'Jugadores'],
    ['grupo', 'Grupo'],
    ['equipos', 'Equipos'],
    ['liga', 'Liga'],
    ['h2h', 'Cara a cara'],
  ];
  const compShort = COMPETITIONS.find((c) => c.code === competition)?.short ?? '';
  const scoped = SCOPED.includes(view);

  return (
    <>
      <div className="seg wrapseg" role="group" aria-label="Tipo de estadísticas">
        {views.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>
            {label}
          </button>
        ))}
      </div>

      {scoped && (
        <div className="scope" role="group" aria-label="Qué competiciones incluir">
          <button type="button" aria-pressed={scope === 'comp'} onClick={() => setScope('comp')}>
            <span className="scope-logos">
              <CompLogo code={competition} size={24} />
            </span>
            {compShort}
          </button>
          <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
            <span className="scope-logos">
              {COMPETITIONS.map((c) => (
                <CompLogo key={c.code} code={c.code} size={24} />
              ))}
            </span>
            {COMPETITIONS.map((c) => c.short).join(' + ')}
          </button>
        </div>
      )}

      {view === 'jugadores' && (
        <p className="hint">
          Aciertos cuenta los signos 1/X/2 correctos. Puntos aplica la regla del Pleno al 15 (3 puntos solo por marcador exacto).
          Para comparar con la clasificación, mira Puntos con el mismo filtro de arriba: solo la competición, o La Liga + Champions.
        </p>
      )}

      {cur.failed && !stats && <p className="notice">No se pudieron cargar las estadísticas.</p>}
      {!stats && !cur.failed && <StatsSkeleton />}
      {stats && (
        <>
          {view === 'jugadores' && <PlayersView stats={stats} meId={meId} />}
          {view === 'equipos' && <Equipos stats={stats} onTeamClick={onTeamClick} />}
          {view === 'liga' && <Liga liga={stats.liga} onTeamClick={onTeamClick} />}
          {view === 'grupo' && <Grupo stats={stats} meId={meId} />}
          {view === 'h2h' && (
            <H2H teams={[...stats.teams].sort((a, b) => a.team.localeCompare(b.team, 'es')).map((t) => ({ team: t.team, crest: t.crest }))} />
          )}
        </>
      )}
    </>
  );
}
