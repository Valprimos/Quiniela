'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { PlayerStat, StatsDTO } from '@/lib/stats';
import { COMPETITIONS } from '@/lib/competitions';
import Avatar from './Avatar';
import CompLogo from './CompLogo';
import FormDotsTip from './FormDotsTip';
import { ProfileSkeleton } from './Skeleton';
import { fetchJson, load, peek } from '@/lib/clientCache';
import { fmt, pctOf } from './statsUtil';

export type ProfileTarget = { id: string; name: string; avatar: number | null };

// Cualquier jugador que salga en la app (clasificación, pronósticos, estadísticas) abre su perfil con esto
export const ProfileCtx = createContext<(t: ProfileTarget) => void>(() => {});
export const useProfile = () => useContext(ProfileCtx);

function twinOf(stats: StatsDTO, id: string, which: 'most' | 'least'): string {
  const mine = stats.siamese.filter((p) => p.a === id || p.b === id);
  if (!mine.length) return '–';
  const p = which === 'most' ? mine[0] : mine[mine.length - 1];
  return `${p.a === id ? p.bName : p.aName} (${fmt(p.pct)}%)`;
}

// Ficha personal: cómo le va a un jugador con cada equipo (solo partidos terminados que pronosticó)
type TeamRow = { team: string; crest: string | null; n: number; h: number; backed: number };
const MIN_TEAM = 3; // pronósticos mínimos sobre un equipo para hablar de "bestia negra" o "siempre ganador"

function teamRows(stats: StatsDTO, id: string): TeamRow[] {
  const out: TeamRow[] = [];
  for (const t of stats.teams) {
    const c = t.acc[id]?.total;
    if (c && c.n > 0) out.push({ team: t.team, crest: t.crest, n: c.n, h: c.h, backed: t.backed?.[id] ?? 0 });
  }
  return out;
}

function Crest({ src, size = 28 }: { src: string | null; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className="thcrest" style={{ width: size, height: size }} />
  ) : (
    <span className="thcrest" style={{ width: size, height: size }} />
  );
}

function Ficha({ rows, mine }: { rows: TeamRow[]; mine: boolean }) {
  if (!rows.length) return null;
  const eligible = rows.filter((r) => r.n >= MIN_TEAM);
  // Bestia negra: el equipo con peor % de acierto (que falle al menos la mitad); si empatan, el que tiene más partidos
  const beast = eligible.filter((r) => r.h / r.n <= 0.5).sort((a, b) => a.h / a.n - b.h / b.n || b.n - a.n)[0];
  // Siempre ganador: el equipo al que más veces le da la victoria (al menos la mitad de sus pronósticos sobre él)
  const fav = [...eligible]
    .filter((r) => r.backed / r.n >= 0.5)
    .sort((a, b) => b.backed / b.n - a.backed / a.n || b.n - a.n)[0];
  const all = [...rows].sort((a, b) => b.n - a.n || b.h / b.n - a.h / a.n || a.team.localeCompare(b.team, 'es'));
  return (
    <section className="pficha" aria-label="Ficha personal">
      <h3 className="sh small">Ficha personal</h3>
      <div className="pficha-pair">
        <div className="pficha-card bad">
          <span className="pficha-label">Bestia negra</span>
          {beast ? (
            <>
              <Crest src={beast.crest} />
              <b>{beast.team}</b>
              <small>
                {mine ? 'Fallas' : 'Falla'} {beast.n - beast.h} de {beast.n} ({fmt((100 * (beast.n - beast.h)) / beast.n)}%)
              </small>
            </>
          ) : (
            <small>
              {eligible.length ? `Ningún equipo ${mine ? 'se te' : 'se le'} resiste` : `Faltan partidos (mínimo ${MIN_TEAM} por equipo)`}
            </small>
          )}
        </div>
        <div className="pficha-card good">
          <span className="pficha-label">Siempre ganador</span>
          {fav ? (
            <>
              <Crest src={fav.crest} />
              <b>{fav.team}</b>
              <small>
                {mine ? 'Lo pones' : 'Lo pone'} ganador {fav.backed} de {fav.n} veces
              </small>
            </>
          ) : (
            <small>Ningún equipo al que dé siempre la victoria</small>
          )}
        </div>
      </div>
      <details className="pficha-all">
        <summary>Acierto por equipo ({all.length})</summary>
        <ul>
          {all.map((r) => {
            const pct = (100 * r.h) / r.n;
            return (
              <li key={r.team}>
                <Crest src={r.crest} size={20} />
                <span className="pficha-team">{r.team}</span>
                <span className="pficha-bar" aria-hidden="true">
                  <i style={{ width: `${pct}%` }} />
                </span>
                <span className="pficha-num">
                  {r.h}/{r.n} · {fmt(pct)}%
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="ptile">
      <span className="ptile-label">{label}</span>
      <b className="ptile-val">{value}</b>
      {sub && <small className="ptile-sub">{sub}</small>}
    </div>
  );
}

export default function PlayerProfileModal({
  target,
  meId,
  group,
  version,
  onClose,
  onEdit,
}: {
  target: ProfileTarget;
  meId: string;
  group: string;
  version: number;
  onClose: () => void;
  onEdit: () => void;
}) {
  // Usa las estadísticas que ya se cargaron (pestaña Estadísticas u otro perfil): se ven al instante
  const key = `stats:${meId}:ALL`;
  const [stats, setStats] = useState<StatsDTO | null>(() => peek<StatsDTO>(key) ?? null);
  const [failed, setFailed] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    load(key, () => fetchJson<StatsDTO>('/api/stats?competition=ALL'), { ttl: 60_000, tag: version })
      .then((j) => alive && setStats(j))
      .catch(() => alive && !peek(key) && setFailed(true));
    return () => {
      alive = false;
    };
  }, [key, version]);

  useEffect(() => {
    closeBtn.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);

  const p: PlayerStat | undefined = stats?.players.find((x) => x.playerId === target.id);
  const position = stats && p ? 1 + stats.players.filter((x) => x.points > p.points).length : null;
  const mine = target.id === meId;

  return (
    <div className="pmodal-backdrop" onClick={onClose}>
      <div
        className="pmodal"
        role="dialog"
        aria-modal="true"
        aria-label={`Perfil de ${target.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeBtn} type="button" className="pmodal-close" aria-label="Cerrar" onClick={onClose}>
          ×
        </button>

        <div className="pmodal-head">
          <span className={`pmodal-photo${mine ? ' me' : ''}`}>
            <Avatar id={target.id} name={target.name} v={target.avatar} size={112} />
          </span>
          <h2 className="pmodal-name">{target.name}</h2>
          <p className="pmodal-sub">
            {group}
            {position != null && stats ? ` · ${position}º de ${stats.players.length}` : ''}
          </p>
          {p?.style && (
            <span className="stylebadge" title={p.style.detail}>
              {p.style.label}
            </span>
          )}
        </div>

        {!stats && !failed && <ProfileSkeleton />}
        {failed && <p className="notice">No se pudieron cargar las estadísticas.</p>}
        {stats && !p && <p className="muted">Todavía no hay estadísticas de este jugador.</p>}
        {stats && p && stats.finished === 0 && <p className="muted">Aún no hay partidos terminados.</p>}

        {stats && p && stats.finished > 0 && (
          <>
            <div className="ptiles">
              <Tile label="Puntos" value={String(p.points)} />
              <Tile
                label="Acierto"
                value={p.pct == null ? '–' : `${fmt(p.pct)}%`}
                sub={`${p.hits} de ${p.played}`}
              />
              <Tile label="Mejor racha" value={String(p.bestStreak)} sub={`ahora ${p.streak}`} />
              <Tile label="Jornadas ganadas" value={String(p.wins)} />
              <Tile
                label="Pleno al 15"
                value={p.pleno15.n ? `${p.pleno15.h}/${p.pleno15.n}` : '–'}
                sub={p.pleno15.n ? `${fmt(pctOf(p.pleno15))}% exacto` : undefined}
              />
              <Tile label="Media por jornada" value={fmt(p.avg, 1)} />
            </div>

            {stats.comps.length > 1 && (
              <ul className="pcomps" aria-label="Puntos por competición">
                {stats.comps.map((c) => (
                  <li key={c}>
                    <CompLogo code={c} size={22} />
                    <b>{p.byComp[c]?.points ?? 0}</b>
                    <small>{COMPETITIONS.find((x) => x.code === c)?.short} · pts</small>
                  </li>
                ))}
              </ul>
            )}

            <FormDotsTip marks={p.form} info={p.formInfo} />

            <Ficha rows={teamRows(stats, target.id)} mine={mine} />

            <dl className="pmodal-facts">
              <div>
                <dt>Piensa como</dt>
                <dd>{twinOf(stats, target.id, 'most')}</dd>
              </div>
              <div>
                <dt>Lo contrario que</dt>
                <dd>{twinOf(stats, target.id, 'least')}</dd>
              </div>
              <div>
                <dt>La suegra</dt>
                <dd>{p.brave.n ? `${fmt(pctOf(p.brave))}% de ${p.brave.n}` : '–'}</dd>
              </div>
            </dl>
          </>
        )}

        {mine && (
          <button type="button" className="seg-btn pmodal-edit" onClick={onEdit}>
            Editar mi perfil
          </button>
        )}
      </div>
    </div>
  );
}
