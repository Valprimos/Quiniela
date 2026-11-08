'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchJson, load, peek } from '@/lib/clientCache';
import { untilText } from '@/lib/seasonPicks';

export type SeasonBrief = {
  available: boolean;
  season?: number;
  deadline?: string | null;
  closed?: boolean;
  done?: number;
  total?: number;
};

// Resumen mínimo para el aviso de arriba y la insignia del menú: una petición ligera, guardada en memoria
export function useSeasonBrief(meId: string | null) {
  const key = `seasonbrief:${meId}`;
  const [brief, setBrief] = useState<SeasonBrief | null>(() => (meId ? (peek<SeasonBrief>(key) ?? null) : null));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!meId) return;
    let alive = true;
    load(key, () => fetchJson<SeasonBrief>('/api/season-picks?brief=1'), { ttl: 60_000, tag: tick })
      .then((b) => alive && setBrief(b))
      .catch(() => alive && setBrief((cur) => cur ?? { available: false }));
    return () => {
      alive = false;
    };
  }, [key, meId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  let badge: string | null = null;
  if (brief?.available) {
    if (!brief.closed && (brief.done ?? 0) < (brief.total ?? 3)) badge = `${(brief.total ?? 3) - (brief.done ?? 0)} por hacer`;
  }
  return { brief, badge, refresh };
}

// Botón compacto junto a las competiciones (La Liga · Champions · 🏆 Temporada): siempre a un toque, sin ocupar una fila
export default function SeasonChip({ brief, now, onOpen }: { brief: SeasonBrief | null; now: number; onOpen: () => void }) {
  if (!brief?.available) return null;

  const total = brief.total ?? 3;
  const done = brief.done ?? 0;
  const left = brief.deadline ? new Date(brief.deadline).getTime() - now : null;
  const closed = !!brief.closed || (left != null && left <= 0);
  const missing = total - done;
  const urgent = !closed && missing > 0 && left != null && left < 24 * 3600e3;

  let tone = '';
  let label = 'Predicciones de temporada';
  if (closed) {
    label += ': cerradas, ya se ven las de todos';
  } else if (missing > 0) {
    tone = urgent ? 'urgent' : 'todo';
    label += `: te ${missing === 1 ? 'falta 1 apartado' : `faltan ${missing} apartados`}${left != null ? `, cierran en ${untilText(left)}` : ''}`;
  } else {
    tone = 'done';
    label += `: hechas${left != null ? `, cierran en ${untilText(left)}` : ''}`;
  }

  return (
    <button type="button" className={`sp-btn ${tone}`} onClick={onOpen} aria-label={label} title={label}>
      <span aria-hidden="true">🏆</span>
      <span className="sp-btn-txt" aria-hidden="true">
        Temporada
      </span>
      {!closed && missing > 0 && (
        <span className="sp-btn-n" aria-hidden="true">
          {missing}
        </span>
      )}
      {!closed && missing === 0 && (
        <span className="sp-btn-ok" aria-hidden="true">
          ✓
        </span>
      )}
    </button>
  );
}
