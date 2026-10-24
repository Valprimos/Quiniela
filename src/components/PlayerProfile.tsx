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
              <div>
                <dt>Equipo gafe</dt>
                <dd>{p.jinx ? `${p.jinx.team} (${fmt(p.jinx.pct)}%)` : '–'}</dd>
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
