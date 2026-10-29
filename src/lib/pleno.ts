import type { SupabaseClient } from '@supabase/supabase-js';

// El "pleno al 15" es SIEMPRE el penúltimo partido de la jornada, por orden de fecha.
// Se recalcula cada vez que se mira la jornada y después de cada sincronización, para que
// siga siendo el penúltimo aunque cambien horarios, se aplace un partido o se publiquen
// fechas definitivas más tarde.

export type PlenoRow = {
  id: number;
  matchday: number;
  utc_date: string;
  status: string;
  is_pleno?: boolean | null;
};

const DAY = 86400e3;
// Partidos que no se van a jugar en su fecha: no pueden ser el pleno (nadie podría pronosticarlo)
const NOT_PLAYED = ['POSTPONED', 'CANCELLED', 'CANCELED'];
// Partidos ya empezados o jugados, sea cual sea su hora
const PLAYED = ['IN_PLAY', 'PAUSED', 'LIVE', 'SUSPENDED', 'FINISHED', 'AWARDED'];

const time = (m: PlenoRow) => new Date(m.utc_date).getTime();
const byDate = (a: PlenoRow, b: PlenoRow) => time(a) - time(b) || a.id - b.id;

function hasStarted(m: PlenoRow, now: number): boolean {
  if (PLAYED.includes(m.status)) return true;
  if (NOT_PLAYED.includes(m.status)) return false;
  return time(m) <= now;
}

// Id del partido que debe ser el pleno en una jornada (el penúltimo), o null si no hay al menos 2.
export function plenoIdOf(rows: PlenoRow[]): number | null {
  const playable = rows.filter((m) => !NOT_PLAYED.includes(m.status)).sort(byDate);
  if (playable.length < 2) return null;

  // Un partido aplazado y reprogramado semanas después no es "el último de la jornada":
  // en la fase de liga solo cuentan los partidos cercanos a la fecha típica de la jornada.
  // (Las eliminatorias, matchday >= 100, juntan ida y vuelta, así que no se filtran.)
  let core = playable;
  if (rows[0].matchday < 100 && playable.length > 2) {
    const median = time(playable[Math.floor(playable.length / 2)]);
    const near = playable.filter((m) => Math.abs(time(m) - median) <= 5 * DAY);
    if (near.length >= 2) core = near;
  }
  return core[core.length - 2].id;
}

// Deja marcado como pleno el penúltimo partido de cada jornada de `rows` (que pueden ser
// de varias jornadas). Modifica `is_pleno` de las filas recibidas y guarda los cambios.
//
// Solo se asigna o se mueve mientras el pleno (el actual y el nuevo) aún no ha empezado:
// así nunca se reescriben los puntos de un partido ya jugado ni se deja a nadie sin poder
// poner su marcador exacto.
export async function reconcilePleno(supabase: SupabaseClient, rows: PlenoRow[]): Promise<number> {
  const now = Date.now();
  const byDay = new Map<number, PlenoRow[]>();
  for (const m of rows) (byDay.get(m.matchday) ?? byDay.set(m.matchday, []).get(m.matchday)!).push(m);

  let changes = 0;
  for (const group of byDay.values()) {
    const targetId = plenoIdOf(group);
    if (targetId == null) continue;
    const current = group.filter((m) => m.is_pleno);
    if (current.length === 1 && current[0].id === targetId) continue;

    const target = group.find((m) => m.id === targetId)!;
    if (hasStarted(target, now) || current.some((m) => hasStarted(m, now))) continue;

    const oldIds = current.map((m) => m.id);
    if (oldIds.length) {
      const { error } = await supabase.from('matches').update({ is_pleno: false }).in('id', oldIds);
      if (error) {
        console.error('No se pudo quitar el pleno anterior', error);
        continue;
      }
    }
    const { error } = await supabase.from('matches').update({ is_pleno: true }).eq('id', targetId);
    if (error) {
      console.error('No se pudo asignar el pleno al 15', error);
      continue;
    }
    for (const m of current) m.is_pleno = false;
    target.is_pleno = true;
    changes++;
  }
  return changes;
}
