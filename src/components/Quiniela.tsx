'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Stats from './Stats';
import CompLogo from './CompLogo';
import NotifyPanel from './NotifyPanel';
import UserMenu from './UserMenu';
import ProfilePanel from './ProfilePanel';
import LoginForm from './LoginForm';
import Avatar from './Avatar';
import { AppSkeleton, MatchesSkeleton, RankingSkeleton } from './Skeleton';
import { clear as clearCache } from '@/lib/clientCache';
import PlayerProfileModal, { ProfileCtx, useProfile, type ProfileTarget } from './PlayerProfile';
import { unsubscribeBrowser } from '@/lib/pushClient';
import TeamModal from './TeamModal';
import H2HModal from './H2HModal';
import Archive from './Archive';
import AdminPanel from './AdminPanel';

type Pick = '1' | 'X' | '2';
type Mark = 'G' | 'E' | 'P';
type Team = { name: string; crest: string | null; pos: number | null; form: Mark[] };
type MatchDTO = {
  id: number;
  utcDate: string;
  status: string;
  home: Team;
  away: Team;
  homeScore: number | null;
  awayScore: number | null;
  result: Pick | null;
  liveResult: Pick | null;
  provisional: boolean;
  started: boolean;
  locked: boolean;
  isPleno: boolean;
  myPick: Pick | null;
  myPlenoGuess: { home: number; away: number } | null;
  picks: { playerId: string; name: string; avatar: number | null; pick: Pick; plenoGuess: { home: number; away: number } | null }[];
};
type RankRow = { playerId: string; name: string; avatar: number | null; points: number; delta: number; maxPts: number };
type CompetitionInfo = { code: string; name: string; short: string };
type StateDTO = {
  me: { id: string; name: string; admin: boolean; avatar: number | null; group: string };
  season: number;
  competition: string;
  competitions: CompetitionInfo[];
  matchday: number;
  stageLabel: string | null;
  currentMatchday: number;
  matchdays: number[];
  matches: MatchDTO[];
  finished: number;
  finishedTotal: number;
  finishedTotalCombined: number;
  jornadaComplete: boolean;
  jornadaLive: boolean;
  liveCount: number;
  rankingJornada: RankRow[];
  rankingGeneral: RankRow[];
  rankingCombinada: RankRow[];
  syncNotice: string[] | null;
};

const PICKS: Pick[] = ['1', 'X', '2'];
const MARK_TXT: Record<Mark, string> = { G: 'ganó', E: 'empató', P: 'perdió' };

function whenLabel(m: MatchDTO): string {
  switch (m.status) {
    case 'IN_PLAY':
    case 'LIVE':
      return 'En juego';
    case 'PAUSED':
      return 'Descanso';
    case 'FINISHED':
      return 'Final';
    case 'POSTPONED':
      return 'Aplazado';
    case 'SUSPENDED':
      return 'Suspendido';
    case 'CANCELLED':
      return 'Cancelado';
  }
  const d = new Date(m.utcDate);
  const day = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  const hour = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${hour}`;
}

function pickLabel(p: Pick, m: MatchDTO): string {
  return p === '1' ? `Gana ${m.home.name}` : p === '2' ? `Gana ${m.away.name}` : 'Empate';
}

function untilLabel(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'en menos de un minuto';
  if (min < 60) return `en ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `en ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
  const d = Math.round(h / 24);
  return `en ${d} ${d === 1 ? 'día' : 'días'}`;
}

function FormDots({ form }: { form: Mark[] }) {
  if (!form.length) return null;
  return (
    <span
      className="form"
      role="img"
      aria-label={`Últimos partidos: ${form.map((f) => MARK_TXT[f]).join(', ')}`}
    >
      {form.map((f, i) => (
        <i key={i} className={`f f-${f}`} />
      ))}
    </span>
  );
}

function TeamLine({
  team,
  score,
  chipWon,
  onOpen,
}: {
  team: Team;
  score?: number | null;
  chipWon?: boolean;
  onOpen: (name: string, crest: string | null) => void;
}) {
  return (
    <button
      type="button"
      className={`team teambtn${score != null ? ' hasscore' : ''}`}
      onClick={() => onOpen(team.name, team.crest)}
    >
      {team.crest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.crest} alt="" loading="lazy" />
      ) : (
        <span className="crest-empty" />
      )}
      <span className={`name${chipWon ? ' name-won' : ''}`}>{team.name}</span>
      <span className="tmeta">
        {team.pos != null && (
          <span className="tpos" title="Puesto en la Liga">
            {team.pos}º
          </span>
        )}
        <FormDots form={team.form} />
      </span>
      {score != null && <span className={`scorechip${chipWon ? ' scorechip-won' : ''}`}>{score}</span>}
    </button>
  );
}

function ResultBadge({ m }: { m: MatchDTO }) {
  const final = m.status === 'FINISHED';
  const real = final ? m.result : m.provisional ? m.liveResult : null;
  if (real == null || m.myPick == null) return null;
  const hit = m.myPick === real;
  if (!final) {
    return (
      <span className={`resultbadge live${hit ? ' hit' : ' miss'}`}>{hit ? 'Vas acertando' : 'Vas fallando'}</span>
    );
  }
  return <span className={`resultbadge${hit ? ' hit' : ' miss'}`}>{hit ? 'Acertaste +1' : 'Fallaste'}</span>;
}


function Consensus({ m }: { m: MatchDTO }) {
  const n = m.picks.length;
  if (!n) return null;
  const count: Record<Pick, number> = { '1': 0, X: 0, '2': 0 };
  for (const c of m.picks) count[c.pick]++;
  const real = m.result ?? (m.provisional ? m.liveResult : null);
  const hits = real ? count[real] : null;
  return (
    <div className="consensus">
      <div className="bar">
        {PICKS.filter((p) => count[p] > 0).map((p) => (
          <span
            key={p}
            className={`cseg${real === p ? (m.result ? ' real' : ' live') : ''}`}
            style={{ flex: count[p] }}
          >
            {p} {Math.round((count[p] / n) * 100)}%
          </span>
        ))}
      </div>
      <span className="chits">
        {hits != null
          ? `${m.provisional ? 'Van' : 'Acertaron'} ${hits} de ${n}`
          : `${n} ${n === 1 ? 'pronóstico' : 'pronósticos'}`}
      </span>
    </div>
  );
}

function PlenoSlip({ m, onSave }: { m: MatchDTO; onSave: (home: number, away: number) => void }) {
  const [home, setHome] = useState(m.myPlenoGuess?.home?.toString() ?? '');
  const [away, setAway] = useState(m.myPlenoGuess?.away?.toString() ?? '');

  useEffect(() => {
    setHome(m.myPlenoGuess?.home?.toString() ?? '');
    setAway(m.myPlenoGuess?.away?.toString() ?? '');
  }, [m.myPlenoGuess?.home, m.myPlenoGuess?.away]);

  function commit() {
    const h = Number(home);
    const a = Number(away);
    if (home === '' || away === '' || !Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) return;
    if (h === m.myPlenoGuess?.home && a === m.myPlenoGuess?.away) return;
    onSave(h, a);
  }

  if (m.result) {
    const played = m.myPlenoGuess != null;
    const hit = played && m.myPlenoGuess!.home === m.homeScore && m.myPlenoGuess!.away === m.awayScore;
    return (
      <div className={`plenoslip plenoslip-done${played ? (hit ? ' pleno-hit' : ' pleno-miss') : ''}`}>
        <span className="plenolabel">Tu marcador</span>
        <span className="plenoscore">{played ? `${m.myPlenoGuess!.home}-${m.myPlenoGuess!.away}` : 'Sin jugar'}</span>
        {played && <span className="plenopts">{hit ? '+3' : '+0'}</span>}
      </div>
    );
  }

  return (
    <div className="plenoslip">
      <span className="plenolabel">Marcador exacto</span>
      <div className="plenoinputs">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={20}
          value={home}
          onChange={(e) => setHome(e.target.value)}
          onBlur={commit}
          disabled={m.locked}
          className="plenoinput"
          aria-label={`Goles de ${m.home.name}`}
        />
        <span className="plenodash">-</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={20}
          value={away}
          onChange={(e) => setAway(e.target.value)}
          onBlur={commit}
          disabled={m.locked}
          className="plenoinput"
          aria-label={`Goles de ${m.away.name}`}
        />
      </div>
    </div>
  );
}

function MatchRow({
  m,
  onPick,
  onSavePleno,
  onOpenTeam,
  onOpenH2H,
}: {
  m: MatchDTO;
  onPick: (m: MatchDTO, p: Pick) => void;
  onSavePleno: (m: MatchDTO, home: number, away: number) => void;
  onOpenTeam: (name: string, crest: string | null) => void;
  onOpenH2H: (home: Team, away: Team) => void;
}) {
  const openProfile = useProfile();
  return (
    <li className={`match${m.provisional ? ' live' : ''}${m.isPleno ? ' pleno' : ''}`}>
      <div className="when">
        {m.provisional && <i className="livedot" aria-hidden="true" />}
        {whenLabel(m)}
        {m.isPleno && <span className="plenobadge">Pleno al 15</span>}
        {!m.isPleno && <ResultBadge m={m} />}
      </div>

      <div className="match-info">
        <TeamLine
          team={m.home}
          score={m.started ? m.homeScore : null}
          chipWon={m.result === '1' || (m.provisional && m.liveResult === '1')}
          onOpen={onOpenTeam}
        />
        <button type="button" className="h2htrigger" onClick={() => onOpenH2H(m.home, m.away)}>
          Cara a cara
        </button>
        <TeamLine
          team={m.away}
          score={m.started ? m.awayScore : null}
          chipWon={m.result === '2' || (m.provisional && m.liveResult === '2')}
          onOpen={onOpenTeam}
        />
      </div>

      {m.isPleno ? (
        <PlenoSlip m={m} onSave={(h, a) => onSavePleno(m, h, a)} />
      ) : (
        <div className="slip" role="group" aria-label={`Pronóstico: ${m.home.name} contra ${m.away.name}`}>
          {PICKS.map((p) => {
            const selected = m.myPick === p;
            const real = m.result ?? (m.provisional ? m.liveResult : null);
            const cls = ['box'];
            if (selected) cls.push('sel');
            if (real) {
              if (p === real) cls.push('real');
              if (selected) cls.push(p === real ? (m.provisional ? 'hit-live' : 'hit') : m.provisional ? 'miss-live' : 'miss');
            }
            return (
              <button
                key={p}
                type="button"
                className={cls.join(' ')}
                disabled={m.locked}
                aria-pressed={selected}
                aria-label={pickLabel(p, m)}
                onClick={() => onPick(m, p)}
              >
                {p}
              </button>
            );
          })}
        </div>
      )}

      <Consensus m={m} />

      {m.picks.length > 0 && (
        <ul className="chips" aria-label="Pronósticos de los jugadores">
          {m.picks.map((c, i) => {
            if (m.isPleno) {
              const hit = m.result != null && c.plenoGuess != null && c.plenoGuess.home === m.homeScore && c.plenoGuess.away === m.awayScore;
              const state = m.result ? (c.plenoGuess ? (hit ? 'hit' : 'miss') : '') : '';
              return (
                <li key={i} className={`chip ${state}`}>
                  <button
                    type="button"
                    className="plink"
                    aria-label={`Ver perfil de ${c.name}`}
                    onClick={() => openProfile({ id: c.playerId, name: c.name, avatar: c.avatar })}
                  >
                    <Avatar id={c.playerId} name={c.name} v={c.avatar} size={28} />
                    {c.name}
                  </button>
                  <b>{c.plenoGuess ? `${c.plenoGuess.home}-${c.plenoGuess.away}` : '–'}</b>
                </li>
              );
            }
            const real = m.result ?? (m.provisional ? m.liveResult : null);
            const state = real ? (c.pick === real ? 'hit' : 'miss') : '';
            return (
              <li key={i} className={`chip ${state}`}>
                <button
                  type="button"
                  className="plink"
                  aria-label={`Ver perfil de ${c.name}`}
                  onClick={() => openProfile({ id: c.playerId, name: c.name, avatar: c.avatar })}
                >
                  <Avatar id={c.playerId} name={c.name} v={c.avatar} size={28} />
                  {c.name}
                </button>
                <b>{c.pick}</b>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

// Nombre corto de la fase para la etiqueta del ganador (🏆 Octavos)
const STAGE_SHORT: Record<string, string> = {
  Playoff: 'Playoff',
  'Octavos de final': 'Octavos',
  'Cuartos de final': 'Cuartos',
  Semifinales: 'Semis',
  Final: 'Final',
};

function Ranking({
  rows,
  meId,
  showDelta,
  crown,
  roundLabel,
}: {
  rows: RankRow[];
  meId: string;
  showDelta: boolean;
  crown: boolean;
  roundLabel: string;
}) {
  const openProfile = useProfile();
  let pos = 0;
  let prev: number | null = null;
  const topPoints = Math.max(1, ...rows.map((r) => r.points));
  return (
    <ol className="rank">
      {rows.map((r, i) => {
        if (r.points !== prev) {
          pos = i + 1;
          prev = r.points;
        }
        // El % es sobre lo que ESTE jugador podía sacar según sus propios pronósticos,
        // no sobre el total de partidos de la competición (si no, no cuadra si alguien
        // se ha saltado algún pronóstico o empezó a jugar más tarde).
        const pct = r.maxPts > 0 ? Math.round((r.points / r.maxPts) * 100) : null;
        const barWidth = (r.points / topPoints) * 100;
        return (
          // Oro, plata y bronce para el podio (los empatados comparten color); el resto, un tono neutro
          <li key={r.playerId} className={`${pos <= 3 ? `m${pos}` : 'mn'}${r.playerId === meId ? ' me' : ''}`}>
            <span
              className="rankbar"
              style={{ width: `${barWidth}%` }}
              aria-hidden="true"
            />
            <span className="pos">{pos}</span>
            <span className="who">
              <button
                type="button"
                className="plink"
                aria-label={`Ver perfil de ${r.name}`}
                onClick={() => openProfile({ id: r.playerId, name: r.name, avatar: r.avatar })}
              >
                <Avatar id={r.playerId} name={r.name} v={r.avatar} size={52} />
                <span className="whotxt">
                  <span className="whoname">{r.name}</span>
                  {r.playerId === meId && <span className="metag">tú</span>}
                  {crown && pos === 1 && r.points > 0 && (
                    <span className="badge" title="Ganó la jornada" aria-label="Ganó la jornada">
                      🏆 {roundLabel}
                    </span>
                  )}
                </span>
              </button>
            </span>
            <span className="delta">
              {showDelta && r.delta > 0 && <span className="up">▲{r.delta}</span>}
              {showDelta && r.delta < 0 && <span className="down">▼{-r.delta}</span>}
            </span>
            <span className="pctpts">{pct != null ? `${pct}%` : ''}</span>
            <span className="pts">{r.points}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PinPanel({ onClose }: { onClose: () => void }) {
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch('/api/account', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin, newPin }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: 'PIN cambiado.' });
      setPin('');
      setNewPin('');
    } else {
      setMsg({ ok: false, text: json.error ?? 'No se pudo cambiar el PIN.' });
    }
  }

  return (
    <form className="pinpanel" onSubmit={submit}>
      <div className="field">
        <label htmlFor="pin-old">PIN actual</label>
        <input
          id="pin-old"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          maxLength={6}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="pin-new">PIN nuevo (4 a 6 números)</label>
        <input
          id="pin-new"
          type="password"
          inputMode="numeric"
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
          maxLength={6}
          autoComplete="new-password"
          required
        />
      </div>
      {msg && (
        <p className={msg.ok ? 'okmsg' : 'notice'} role="status">
          {msg.text}
        </p>
      )}
      <div className="row">
        <button className="primary" type="submit" disabled={busy}>
          Guardar PIN
        </button>
        <button className="link" type="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </form>
  );
}

export default function Quiniela() {
  const router = useRouter();
  const cache = useRef(new Map<string, StateDTO>());
  const [data, setData] = useState<StateDTO | null>(null);
  // Vacío = automático: el servidor elige la competición con el partido más próximo
  const [competition, setCompetition] = useState('');
  const resolved = useRef<string | null>(null);
  const [md, setMd] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'pronosticos' | 'clasificacion' | 'estadisticas'>('pronosticos');
  const [scope, setScope] = useState<'jornada' | 'general' | 'combinada'>('jornada');
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Solo un panel abierto a la vez (los abre el menú de usuario)
  const [panel, setPanel] = useState<'pin' | 'notify' | 'admin' | 'profile' | 'league' | null>(null);
  const [menuKey, setMenuKey] = useState(0);
  const [profile, setProfile] = useState<ProfileTarget | null>(null);
  const openProfile = useCallback((t: ProfileTarget) => setProfile(t), []);
  const showPin = panel === 'pin';
  const showNotify = panel === 'notify';
  const showAdmin = panel === 'admin';
  const showProfile = panel === 'profile';
  const showLeague = panel === 'league';
  const openPanel = (p: NonNullable<typeof panel>) => setPanel((cur) => (cur === p ? null : p));

  // Un submenú abierto (perfil, añadir liga, avisos, PIN, admin) se cierra al tocar en cualquier sitio de fuera.
  // Se usa el final del toque (no el inicio) para que desplazarse por la página no lo cierre.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!panel) return;
    const openedAt = performance.now(); // ignora el propio toque que lo abrió
    let startedOutside = false;
    const outside = (t: EventTarget | null) => !!panelRef.current && !panelRef.current.contains(t as Node);
    const down = (e: PointerEvent) => {
      startedOutside = e.timeStamp > openedAt && outside(e.target);
    };
    const up = (e: PointerEvent) => {
      if (startedOutside && e.timeStamp > openedAt && outside(e.target)) setPanel(null);
      startedOutside = false;
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setPanel(null);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('keydown', key);
    };
  }, [panel]);
  const [showArchive, setShowArchive] = useState(false);
  const [teamStack, setTeamStack] = useState<{ name: string; crest: string | null }[]>([]);
  const openTeamModal = (name: string, crest: string | null) => setTeamStack([{ name, crest }]);
  const [h2h, setH2h] = useState<{ a: Team; b: Team } | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  // Qué jornada se está mostrando de verdad (para saber cuándo poner el esqueleto al cambiar de jornada)
  const [shownKey, setShownKey] = useState('');
  const cacheAt = useRef(new Map<string, number>());
  const inflight = useRef(new Map<string, Promise<StateDTO | null>>());

  const keyOf = (comp: string, matchday: number | null) => `${comp}:${matchday ?? 'current'}`;

  const fetchState = useCallback(
    async (comp: string, matchday: number | null): Promise<StateDTO | null> => {
      const params = new URLSearchParams();
      if (comp) params.set('competition', comp);
      if (matchday) params.set('matchday', String(matchday));
      const qs = params.size ? `?${params}` : '';
      const res = await fetch(`/api/state${qs}`, { cache: 'no-store' });
      if (res.status === 401) {
        router.replace('/login');
        return null;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Error desconocido');
      }
      return (await res.json()) as StateDTO;
    },
    [router]
  );

  // Si ya hay una petición igual en curso, se comparte en vez de lanzar otra
  const fetchShared = useCallback(
    (comp: string, matchday: number | null) => {
      const k = keyOf(comp, matchday);
      const running = inflight.current.get(k);
      if (running) return running;
      const p = fetchState(comp, matchday).finally(() => inflight.current.delete(k));
      inflight.current.set(k, p);
      return p;
    },
    [fetchState]
  );

  // Precarga de una jornada vecina, solo cuando el usuario está a punto de pulsar la flecha
  const prefetch = useCallback(
    (comp: string, md: number | null) => {
      if (md == null) return;
      const k = keyOf(comp, md);
      if (cache.current.has(k) || inflight.current.has(k)) return;
      fetchShared(comp, md)
        .then((s) => {
          if (!s) return;
          cache.current.set(k, s);
          cacheAt.current.set(k, Date.now());
        })
        .catch(() => {});
    },
    [fetchShared]
  );

  const load = useCallback(
    async (comp: string, matchday: number | null) => {
      const key = keyOf(comp, matchday);
      // La primera carga ya dejó los datos en pantalla al descubrir la competición: no repetirla
      if (resolved.current === key) {
        resolved.current = null;
        return;
      }
      const cached = cache.current.get(key);
      if (cached) {
        setData(cached);
        setShownKey(key);
        setError(null);
        // Datos de hace pocos segundos (por ejemplo, recién precargados): no se piden otra vez
        if (Date.now() - (cacheAt.current.get(key) ?? 0) < 15_000) return;
      } else {
        setLoading(true);
      }
      try {
        const fresh = await fetchShared(comp, matchday);
        if (!fresh) return;
        if (!comp) {
          // Apertura de la app: el servidor ha elegido la competición
          comp = fresh.competition;
          resolved.current = keyOf(comp, null);
          setCompetition(comp);
        }
        const k = keyOf(comp, matchday);
        cache.current.set(k, fresh);
        cacheAt.current.set(k, Date.now());
        setData(fresh);
        setShownKey(k);
        setError(null);
      } catch (e) {
        if (!cached) setError(e instanceof Error && e.message ? e.message : 'No se pudo cargar la jornada. Reintentando en un minuto.');
      } finally {
        setLoading(false);
      }
    },
    [fetchShared]
  );

  useEffect(() => {
    load(competition, md);
  }, [competition, md, load]);

  // Refresco automático: cada 20 s si hay algo en juego, cada 5 min en una jornada ya cerrada y cada
  // minuto en el resto. Al volver a la pestaña se actualiza al momento (si los datos tienen más de 15 s).
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) load(competition, md);
    };
    const t = setInterval(refresh, data?.jornadaLive ? 20_000 : data?.jornadaComplete ? 300_000 : 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [competition, md, load, data?.jornadaLive, data?.jornadaComplete]);

  // Reloj para las cuentas atrás
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  function changeCompetition(next: string) {
    if (next === competition) return;
    setCompetition(next);
    setMd(null);
    setScope('jornada');
  }

  // Pulsar la casilla ya marcada quita el pronóstico
  async function choose(m: MatchDTO, pick: Pick) {
    if (m.locked || !data) return;
    const next: Pick | null = m.myPick === pick ? null : pick;
    const updated = { ...data, matches: data.matches.map((x) => (x.id === m.id ? { ...x, myPick: next } : x)) };
    setData(updated);
    cache.current.set(keyOf(competition, md), updated);
    const res = await fetch('/api/predict', {
      method: next ? 'POST' : 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next ? { matchId: m.id, pick: next } : { matchId: m.id }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? 'No se pudo guardar el pronóstico.');
      cache.current.delete(keyOf(competition, md));
      load(competition, md);
    } else {
      setError(null);
    }
  }

  async function savePleno(m: MatchDTO, home: number, away: number) {
    if (m.locked || !data) return;
    const updated = {
      ...data,
      matches: data.matches.map((x) => (x.id === m.id ? { ...x, myPlenoGuess: { home, away } } : x)),
    };
    setData(updated);
    cache.current.set(keyOf(competition, md), updated);
    const res = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matchId: m.id, plenoHome: home, plenoAway: away }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? 'No se pudo guardar el marcador.');
      cache.current.delete(keyOf(competition, md));
      load(competition, md);
    } else {
      setError(null);
    }
  }

  async function logout() {
    clearCache(); // no dejar datos de esta persona en memoria
    // Al salir, este dispositivo deja de recibir los avisos de este jugador
    try {
      const endpoint = await unsubscribeBrowser();
      if (endpoint) {
        await fetch('/api/push', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
      }
    } catch {
      /* no bloquea la salida */
    }
    // Sale de esta liga; si hay otra guardada en el dispositivo, entra en ella sin pedir nada
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'leave' }),
    }).catch(() => null);
    const out = await res?.json().catch(() => ({}));
    if (out?.switched) {
      window.location.reload();
      return;
    }
    router.replace('/login');
    router.refresh();
  }

  function refreshNow() {
    // Tras un cambio (foto, nombre, pronóstico editado por el admin...) lo guardado en memoria ya no vale
    clearCache(`stats:${data?.me.id ?? ''}`);
    cache.current.delete(keyOf(competition, md));
    cacheAt.current.delete(keyOf(competition, md));
    load(competition, md);
  }

  if (!data) {
    if (error) {
      return (
        <main className="wrap">
          <p className="muted">{error}</p>
        </main>
      );
    }
    return <AppSkeleton />;
  }

  const idx = data.matchdays.indexOf(data.matchday);
  const prevMd = idx > 0 ? data.matchdays[idx - 1] : null;
  const nextMd = idx >= 0 && idx < data.matchdays.length - 1 ? data.matchdays[idx + 1] : null;
  // Al acercar el dedo o el ratón a una flecha ya se empieza a traer esa jornada
  const hint = (n: number | null) => ({
    onPointerEnter: () => prefetch(competition, n),
    onPointerDown: () => prefetch(competition, n),
    onFocus: () => prefetch(competition, n),
  });
  // Solo hay esqueleto si lo que se pide no es lo que se está mostrando (no al refrescar la misma jornada)
  const showSk = loading && shownKey !== keyOf(competition, md) && tab !== 'estadisticas';
  const seasonLabel = `${String(data.season).slice(2)}/${String(data.season + 1).slice(2)}`;
  const myPoints = data.rankingJornada.find((r) => r.playerId === data.me.id)?.points ?? 0;

  const open = data.matches.filter((m) => !m.locked);
  const missing = open.filter((m) => !m.myPick).length;
  const nextClose = open.length
    ? Math.min(...open.map((m) => new Date(m.utcDate).getTime())) - now
    : null;

  const rankRows =
    scope === 'jornada' ? data.rankingJornada : scope === 'general' ? data.rankingGeneral : data.rankingCombinada;

  async function shareRanking() {
    if (!data) return;
    const compLabel = data.competitions.find((c) => c.code === data.competition)?.short ?? '';
    const title =
      scope === 'jornada'
        ? `Quiniela ${compLabel} ${seasonLabel}, jornada ${data.matchday}`
        : scope === 'general'
          ? `Quiniela ${compLabel} ${seasonLabel}, clasificación general`
          : `Quiniela ${seasonLabel}, clasificación combinada`;
    let pos = 0;
    let prev: number | null = null;
    const lines = rankRows.map((r, i) => {
      if (r.points !== prev) {
        pos = i + 1;
        prev = r.points;
      }
      return `${pos}. ${r.name}: ${r.points}`;
    });
    const text = `${title}\n${lines.join('\n')}`;
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setShareMsg('Copiado. Ya puedes pegarlo en el grupo.');
      }
    } catch {
      /* el usuario canceló */
    }
  }

  return (
    <ProfileCtx.Provider value={openProfile}>
    <main className="wrap">
      <header className="top">
        <span className="brand">Quiniela {seasonLabel}</span>
        <UserMenu
          me={data.me}
          refreshKey={menuKey}
          onProfile={() => openPanel('profile')}
          onNotify={() => openPanel('notify')}
          onPin={() => openPanel('pin')}
          onAdmin={() => openPanel('admin')}
          onAddLeague={() => openPanel('league')}
          onLeave={logout}
        />
      </header>

      <div className="seg complist" role="group" aria-label="Competición">
        {data.competitions.map((c) => (
          <button
            key={c.code}
            type="button"
            aria-pressed={competition === c.code}
            onClick={() => changeCompetition(c.code)}
          >
            <CompLogo code={c.code} />
            {c.short}
          </button>
        ))}
      </div>

      <div ref={panelRef}>
      {showProfile && (
        <ProfilePanel
          me={data.me}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setMenuKey((k) => k + 1);
            refreshNow();
          }}
        />
      )}
      {showLeague && <LoginForm embedded onDone={() => window.location.reload()} />}
      {showNotify && <NotifyPanel onClose={() => setPanel(null)} />}
      {showPin && <PinPanel onClose={() => setPanel(null)} />}
      {showAdmin && (
        <AdminPanel
          competition={competition}
          matchday={data.matchday}
          matches={data.matches}
          meId={data.me.id}
          onClose={() => setPanel(null)}
          onChanged={refreshNow}
        />
      )}
      </div>
      {teamStack.length > 0 && (
        <TeamModal
          team={teamStack[teamStack.length - 1]}
          competition={competition}
          onClose={() => setTeamStack([])}
          onNavigate={(name, crest) => setTeamStack((s) => [...s, { name, crest }])}
          onBack={teamStack.length > 1 ? () => setTeamStack((s) => s.slice(0, -1)) : undefined}
        />
      )}
      {h2h && (
        <H2HModal
          teamA={h2h.a.name}
          teamB={h2h.b.name}
          crestA={h2h.a.crest}
          crestB={h2h.b.crest}
          onClose={() => setH2h(null)}
        />
      )}

      <section className="jornada" aria-label="Jornada">
        <button
          type="button"
          className="arrow"
          disabled={prevMd == null}
          {...hint(prevMd)}
          onClick={() => prevMd != null && setMd(prevMd)}
          aria-label="Jornada anterior"
        >
          ‹
        </button>
        <div className="jtitle">
          <span className="jlabel">Jornada</span>
          <span className="jnum">{data.matchday}</span>
          <span className="jcaret" aria-hidden="true">
            ▾
          </span>
          <select
            className="jselect"
            aria-label="Ir a la jornada"
            value={data.matchday}
            onChange={(e) => setMd(Number(e.target.value))}
          >
            {data.matchdays.map((n) => (
              <option key={n} value={n}>
                Jornada {n}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="arrow"
          disabled={nextMd == null}
          {...hint(nextMd)}
          onClick={() => nextMd != null && setMd(nextMd)}
          aria-label="Jornada siguiente"
        >
          ›
        </button>
      </section>
      {data.stageLabel && <p className="stagelabel">{data.stageLabel}</p>}

      <p className="progress">
        {data.finished} de {data.matches.length} partidos jugados
        {data.finished > 0 && `. Llevas ${myPoints} ${myPoints === 1 ? 'punto' : 'puntos'}`}
        {data.matchday !== data.currentMatchday && (
          <>
            {' '}
            <button type="button" className="link" onClick={() => setMd(null)}>
              Ir a la jornada actual
            </button>
          </>
        )}
      </p>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {data.syncNotice && data.syncNotice.length > 0 && (
        <p className="notice" role="alert">
          No se ha podido traer datos de: {data.syncNotice.join(' · ')}
        </p>
      )}

      <div className="tabs" role="tablist">
        {(
          [
            ['pronosticos', 'Pronósticos'],
            ['clasificacion', 'Clasificación'],
            ['estadisticas', 'Estadísticas'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={`fadebox${loading ? ' loading' : ''}${showSk ? ' showsk' : ''}`}>
        {showSk && (tab === 'clasificacion' ? <RankingSkeleton /> : <MatchesSkeleton />)}
        {tab === 'pronosticos' &&
          (data.matches.length ? (
            <>
              {open.length > 0 && (
                <p className={`reminder${missing ? ' warn' : ''}`}>
                  {missing
                    ? `Te faltan ${missing} ${missing === 1 ? 'partido' : 'partidos'} por rellenar.`
                    : 'Tienes todos los pronósticos puestos.'}{' '}
                  {nextClose != null && `Próximo cierre ${untilLabel(Math.max(0, nextClose))}.`}
                </p>
              )}
              <ul className="matches">
                {data.matches.map((m) => (
                  <MatchRow key={m.id} m={m} onPick={choose} onSavePleno={savePleno} onOpenTeam={openTeamModal} onOpenH2H={(a, b) => setH2h({ a, b })} />
                ))}
              </ul>
            </>
          ) : (
            <p className="muted empty">Aún no hay partidos cargados para esta jornada.</p>
          ))}

        {tab === 'clasificacion' && (
          <>
            <div className="seg" role="group" aria-label="Tipo de clasificación">
              <button type="button" aria-pressed={scope === 'jornada'} onClick={() => setScope('jornada')}>
                Jornada {data.matchday}
              </button>
              <button type="button" aria-pressed={scope === 'general'} onClick={() => setScope('general')}>
                General
              </button>
              <button type="button" aria-pressed={scope === 'combinada'} onClick={() => setScope('combinada')}>
                Combinada
              </button>
            </div>
            {scope === 'jornada' && data.liveCount > 0 && (
              <p className="hint">{data.liveCount} en juego · la clasificación puede cambiar</p>
            )}
            <Ranking
              rows={rankRows}
              meId={data.me.id}
              showDelta={scope === 'general'}
              crown={scope === 'jornada' && data.jornadaComplete}
              roundLabel={data.matchday >= 100 ? STAGE_SHORT[data.stageLabel ?? ''] ?? data.stageLabel ?? '' : `J${data.matchday}`}
            />
            <div className="share">
              <button type="button" className="link" onClick={shareRanking}>
                Compartir clasificación
              </button>
              {shareMsg && <span className="muted"> {shareMsg}</span>}
              {' · '}
              <button type="button" className="link" onClick={() => setShowArchive((v) => !v)}>
                Archivo de temporadas
              </button>
            </div>
            {showArchive && <Archive competition={competition} />}
          </>
        )}

        {tab === 'estadisticas' && (
          <Stats meId={data.me.id} competition={competition} version={data.finishedTotal} onTeamClick={openTeamModal} />
        )}
      </div>

      {profile && (
        <PlayerProfileModal
          target={profile}
          meId={data.me.id}
          group={data.me.group}
          version={data.finishedTotal}
          onClose={() => setProfile(null)}
          onEdit={() => {
            setProfile(null);
            setPanel('profile');
          }}
        />
      )}
    </main>
    </ProfileCtx.Provider>
  );
}
