'use client';

import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
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
  const listRef = useRef<HTMLOListElement>(null);
  const previousRects = useRef<Map<string, DOMRect> | null>(null);
  const dragFrom = useRef<number | null>(null);
  const dragTo = useRef<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  useLayoutEffect(() => {
    const before = previousRects.current;
    previousRects.current = null;
    if (!before) return;
    listRef.current?.querySelectorAll<HTMLElement>('[data-rank-team]').forEach((row) => {
      const team = row.dataset.rankTeam;
      if (!team) return;
      const oldRect = before.get(team);
      if (!oldRect) return;
      const newRect = row.getBoundingClientRect();
      const dy = oldRect.top - newRect.top;
      if (dy) row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }, [order]);

  const move = (from: number, to: number) => {
    if (disabled || to < 0 || to >= n || to === from) return;
    previousRects.current = new Map(
      Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-rank-team]') ?? [])
        .map((row) => [row.dataset.rankTeam ?? '', row.getBoundingClientRect()])
    );
    const next = order.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };

  const startDrag = (from: number, e: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    e.preventDefault();
    dragFrom.current = from;
    dragTo.current = from;
    setDragging(from);
    setOver(from);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const trackDrag = (e: PointerEvent<HTMLOListElement>) => {
    if (dragFrom.current == null) return;
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-rank-index]');
    const index = row ? Number(row.dataset.rankIndex) : null;
    if (index == null || !Number.isInteger(index)) return;
    dragTo.current = index;
    setOver(index);
  };

  const finishDrag = (cancel = false) => {
    const from = dragFrom.current;
    const to = dragTo.current;
    dragFrom.current = null;
    dragTo.current = null;
    setDragging(null);
    setOver(null);
    if (!cancel && from != null && to != null) move(from, to);
  };

  return (
    <ol ref={listRef} className="sp-rank" onPointerMove={trackDrag} onPointerUp={() => finishDrag()} onPointerCancel={() => finishDrag(true)}>
      {order.map((team, i) => {
        const pos = i + 1;
        const zone = zoneOf(pos, zones);
        const first = zone && zoneOf(pos - 1, zones) !== zone;
        return (
          <li
            key={team}
            data-rank-team={team}
            data-rank-index={i}
            className={`sp-row${zone ? ` z-${zone}` : ''}${first ? ' z-first' : ''}${dragging === i ? ' is-dragging' : ''}${over === i && dragging !== null ? ' is-drop-target' : ''}`}
          >
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
            <button
              type="button"
              className="sp-drag"
              aria-label={`Arrastrar ${team} a otra posición`}
              title="Arrastrar para cambiar de posición"
              disabled={disabled}
              onPointerDown={(e) => startDrag(i, e)}
            >
              ⠿
            </button>
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
