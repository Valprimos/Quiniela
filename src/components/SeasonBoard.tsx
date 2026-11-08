'use client';

import Avatar from './Avatar';
import { Crest, type TeamInfo } from './SeasonRank';
import { INDIVIDUAL_AWARD_KEYS, ZoneKey, Zones, averageRanking, nameKey, resolveNames, variantsOf, zoneOf, type Aliases } from '@/lib/seasonPicks';

export type BoardPlayer = {
  playerId: string;
  name: string;
  avatar: number | null;
  awards: Record<string, string>;
  awardRows: { key: string; hit: boolean; pts: number; decided: boolean }[];
};

// Una "tarjeta" del tablero: un premio (o los finalistas de la Champions) y de dónde salen las elecciones
export type BoardDef = {
  id: string;
  label: string;
  pts: number;
  keys: string[]; // claves de lo que eligió cada jugador (los finalistas tienen dos casillas)
  winners: string[]; // lo que haya fijado el admin
  team?: boolean; // equipos (con escudo) en vez de jugadores
};

type Group = { name: string; players: BoardPlayer[]; win: boolean; pts: number };

// Todo lo que hemos puesto, junto: por cada premio, cada nombre con quién lo eligió. Nada de pinchar jugador a jugador.
export function AwardsBoard({
  defs,
  everyone,
  meId,
  aliases,
  teams,
}: {
  defs: BoardDef[];
  everyone: BoardPlayer[];
  meId: string;
  aliases: Aliases;
  teams?: TeamInfo[];
}) {
  const crest = new Map((teams ?? []).map((t) => [nameKey(t.name), t.crest]));
  // Los nombres de jugadores se unifican entre todos los premios (Yamal = Lamine Yamal en todos)
  const resolved = resolveNames(
    variantsOf(everyone.flatMap((e) => INDIVIDUAL_AWARD_KEYS.map((k) => e.awards?.[k]).filter((x): x is string => !!x))),
    aliases
  );
  const total = everyone.length || 1;

  return (
    <div className="sp-bd">
      {defs.map((def) => {
        const map = new Map<string, Group>();
        const none: BoardPlayer[] = [];
        const decided = def.winners.length > 0;
        for (const e of everyone) {
          const picks: string[] = [];
          for (const k of def.keys) {
            const raw = (e.awards?.[k] ?? '').trim();
            if (raw && !picks.some((p) => nameKey(p) === nameKey(raw))) picks.push(raw);
          }
          if (!picks.length) {
            none.push(e);
            continue;
          }
          for (const raw of picks) {
            const name = def.team ? raw : (resolved[nameKey(raw)] ?? raw);
            const key = nameKey(name);
            const g = map.get(key) ?? { name, players: [], win: false, pts: 0 };
            g.players.push(e);
            if (def.team) {
              if (def.winners.some((w) => nameKey(w) === key)) {
                g.win = true;
                g.pts = def.pts;
              }
            } else {
              // Los aciertos de jugadores salen de la misma puntuación que el ranking (respeta los nombres unificados)
              const rows = def.keys.map((k) => e.awardRows.find((r) => r.key === k)).filter(Boolean);
              const hit = rows.find((r) => r!.hit);
              if (hit) {
                g.win = true;
                g.pts = Math.max(g.pts, hit.pts);
              }
            }
            map.set(key, g);
          }
        }
        const groups = [...map.values()].sort((a, b) => b.players.length - a.players.length || a.name.localeCompare(b.name, 'es'));
        return (
          <section key={def.id} className="sp-bd-card">
            <header className="sp-bd-head">
              <b>{def.label}</b>
              <small>+{def.pts}</small>
              {decided && <span className="sp-bd-winner">Ganó: {def.winners.join(' · ')}</span>}
            </header>
            {groups.length === 0 ? (
              <p className="muted empty">Nadie ha elegido nada.</p>
            ) : (
              <ul className="sp-bd-list">
                {groups.map((g) => (
                  <li key={nameKey(g.name)} className={`sp-bd-item${g.win ? ' win' : decided ? ' lose' : ''}`}>
                    <div className="sp-bd-top">
                      {def.team && <Crest src={crest.get(nameKey(g.name))} size={22} />}
                      <b className="sp-bd-name">{g.name}</b>
                      <span className="sp-bd-n" aria-label={`${g.players.length} ${g.players.length === 1 ? 'jugador' : 'jugadores'}`}>
                        ×{g.players.length}
                      </span>
                      {g.win && <em className="sp-bd-pts">+{g.pts || def.pts}</em>}
                    </div>
                    <div className="sp-bd-bar" aria-hidden="true">
                      <i style={{ width: `${Math.max(6, (g.players.length / total) * 100)}%` }} />
                    </div>
                    <ul className="sp-bd-who">
                      {g.players.map((p) => (
                        <li key={p.playerId} className={p.playerId === meId ? 'me' : undefined}>
                          <Avatar id={p.playerId} name={p.name} v={p.avatar} size={30} />
                          <span>{p.name}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            {none.length > 0 && <p className="sp-bd-none">Sin elegir: {none.map((p) => p.name).join(', ')}</p>}
          </section>
        );
      })}
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Clasificación media: la posición media de cada equipo según las clasificaciones de todos
export function AverageTable({
  lists,
  teams,
  zones,
  real,
}: {
  lists: { name: string; ranking: string[] }[];
  teams: TeamInfo[];
  zones: Zones;
  real: string[] | null;
}) {
  const crest = new Map(teams.map((t) => [nameKey(t.name), t.crest]));
  const realPos = new Map((real ?? []).map((t, i) => [nameKey(t), i + 1]));
  const rows = averageRanking(
    lists.map((l) => l.ranking),
    teams.map((t) => t.name)
  );
  const N = Math.max(teams.length, 2);
  const pct = (pos: number) => ((pos - 1) / (N - 1)) * 100;

  return (
    <>
      <p className="sp-hint">
        Media de las clasificaciones de <b>{lists.length}</b> {lists.length === 1 ? 'jugador' : 'jugadores'}. La barra va del
        puesto más alto al más bajo que le dio alguien; la marca es la media.
      </p>
      <ol className="sp-avg">
        {rows.map((r, i) => {
          const zone: ZoneKey | null = zoneOf(i + 1, zones);
          const hoy = realPos.get(nameKey(r.team));
          const left = pct(r.min);
          const width = Math.max(pct(r.max) - left, 1.5);
          return (
            <li key={r.team} className={`sp-avg-row${zone ? ` z-${zone}` : ''}`}>
              <div className="sp-avg-top">
                <span className="sp-pos static">{i + 1}</span>
                <Crest src={crest.get(nameKey(r.team))} size={22} />
                <span className="sp-team">{r.team}</span>
                {hoy != null && <small className="sp-real">hoy {hoy}.º</small>}
                <b className="sp-avg-num" aria-label={`posición media ${fmt(r.avg)}`}>
                  {fmt(r.avg)}
                </b>
              </div>
              <div className="sp-avg-line">
                <div className="sp-avg-bar" aria-hidden="true">
                  <i className="sp-avg-range" style={{ left: `${left}%`, width: `${width}%` }} />
                  <i className="sp-avg-mark" style={{ left: `${pct(r.avg)}%` }} />
                </div>
                <small className="sp-avg-rng">
                  {r.min === r.max ? `${r.min}.º` : `${r.min}.º–${r.max}.º`}
                  {r.firsts > 0 && ` · ${r.firsts} lo ${r.firsts === 1 ? 'pone' : 'ponen'} campeón`}
                </small>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
