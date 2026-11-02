'use client';

import { ZONE_LABEL, ZoneKey, Zones, zoneOf, type TeamScore } from '@/lib/seasonPicks';

export type TeamInfo = { name: string; crest: string | null };

export function Crest({ src, size = 22 }: { src: string | null | undefined; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className="sp-crest" style={{ width: size, height: size }} />
  ) : (
    <span className="sp-crest" style={{ width: size, height: size }} />
  );
}

// Clasificación que se ordena con flechas (o tocando el número para saltar a otra posición)
export function RankEditor({
  order,
  teams,
  zones,
  onChange,
  disabled = false,
}: {
  order: string[];
  teams: TeamInfo[];
  zones: Zones;
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const crest = new Map(teams.map((t) => [t.name, t.crest]));
  const n = order.length;

  const move = (from: number, to: number) => {
    if (disabled || to < 0 || to >= n || to === from) return;
    const next = order.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };

  return (
    <ol className="sp-rank">
      {order.map((team, i) => {
        const pos = i + 1;
        const zone = zoneOf(pos, zones);
        const first = zone && zoneOf(pos - 1, zones) !== zone;
        return (
          <li key={team} className={`sp-row${zone ? ` z-${zone}` : ''}${first ? ' z-first' : ''}`}>
            {first && zone && <span className="sp-zone-tag">{ZONE_LABEL[zone]}</span>}
            <label className="sp-pos" aria-label={`Posición de ${team}`}>
              <select value={pos} disabled={disabled} onChange={(e) => move(i, Number(e.target.value) - 1)}>
                {order.map((_, k) => (
                  <option key={k} value={k + 1}>
                    {k + 1}
                  </option>
                ))}
              </select>
              <span aria-hidden="true">{pos}</span>
            </label>
            <Crest src={crest.get(team)} />
            <span className="sp-team">{team}</span>
            <span className="sp-arrows">
              <button type="button" aria-label={`Subir ${team}`} disabled={disabled || i === 0} onClick={() => move(i, i - 1)}>
                ▲
              </button>
              <button
                type="button"
                aria-label={`Bajar ${team}`}
                disabled={disabled || i === n - 1}
                onClick={() => move(i, i + 1)}
              >
                ▼
              </button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// Una predicción ya cerrada, con lo que ha acertado cada equipo
export function RankReadOnly({ rows, teams, zones }: { rows: TeamScore[]; teams: TeamInfo[]; zones: Zones }) {
  const crest = new Map(teams.map((t) => [t.name, t.crest]));
  return (
    <ol className="sp-rank ro">
      {rows.map((r) => {
        const zone: ZoneKey | null = zoneOf(r.predPos, zones);
        return (
          <li key={r.team} className={`sp-row${zone ? ` z-${zone}` : ''}`}>
            <span className="sp-pos static">{r.predPos}</span>
            <Crest src={crest.get(r.team)} size={20} />
            <span className="sp-team">{r.team}</span>
            {r.actualPos != null && <small className="sp-real">{r.actualPos}.º</small>}
            <span className={`sp-pts ${r.kind}`}>{r.pts > 0 ? `+${r.pts}` : '0'}</span>
          </li>
        );
      })}
    </ol>
  );
}
