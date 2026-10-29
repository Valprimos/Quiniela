import type { SupabaseClient } from '@supabase/supabase-js';

// El "pleno al 15" es SIEMPRE el penúltimo partido de la jornada, por orden de fecha.
// Se recalcula cada vez que se mira la jornada y después de cada sincronización, para que
// siga siendo el penúltimo aunque cambien horarios, se aplace un partido o se publiquen
// fechas definitivas más tarde. Si un admin elige el pleno a mano (tabla pleno_overrides),
// esa jornada se deja como está.

export type PlenoRow = {
  id: number;
  matchday: number;
  utc_date: string;
  status: string;
  is_pleno?: boolean | null;
};

export type PlenoChange = { matchday: number; from: number[]; to: number };

const DAY = 86400e3;
// Partidos que no se van a jugar en su fecha: no pueden ser el pleno (nadie podría pronosticarlo)
export const NOT_PLAYED = ['POSTPONED', 'CANCELLED', 'CANCELED'];
// Partidos ya empezados o jugados, sea cual sea su hora
const PLAYED = ['IN_PLAY', 'PAUSED', 'LIVE', 'SUSPENDED', 'FINISHED', 'AWARDED'];

const time = (m: PlenoRow) => new Date(m.utc_date).getTime();
const byDate = (a: PlenoRow, b: PlenoRow) => time(a) - time(b) || a.id - b.id;

export function hasStarted(m: PlenoRow, now: number = Date.now()): boolean {
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

// Jornadas cuyo pleno no es el penúltimo partido. Por defecto solo propone moverlo mientras ni
// el pleno actual ni el nuevo han empezado (así no se reescriben puntos de partidos jugados);
// con `force` propone también las jornadas ya jugadas. `only` limita a ciertas jornadas.
export function planPleno(rows: PlenoRow[], opts: { force?: boolean; only?: number[] } = {}): PlenoChange[] {
  const now = Date.now();
  const byDay = new Map<number, PlenoRow[]>();
  for (const m of rows) (byDay.get(m.matchday) ?? byDay.set(m.matchday, []).get(m.matchday)!).push(m);

  const changes: PlenoChange[] = [];
  for (const [matchday, group] of byDay) {
    if (opts.only && !opts.only.includes(matchday)) continue;
    const to = plenoIdOf(group);
    if (to == null) continue;
    const current = group.filter((m) => m.is_pleno);
    if (current.length === 1 && current[0].id === to) continue;
    if (!opts.force) {
      const target = group.find((m) => m.id === to)!;
      if (hasStarted(target, now) || current.some((m) => hasStarted(m, now))) continue;
    }
    changes.push({ matchday, from: current.map((m) => m.id), to });
  }
  return changes;
}

// Jornadas (de las que se quieren cambiar) donde un admin eligió el pleno a mano.
// Si la tabla aún no existe (falta la migración), se considera que no hay ninguna.
export async function manualMatchdays(supabase: SupabaseClient, rows: PlenoRow[], matchdays: number[]): Promise<Set<number>> {
  const ids = rows.filter((m) => matchdays.includes(m.matchday)).map((m) => m.id);
  if (!ids.length) return new Set();
  const { data, error } = await supabase.from('pleno_overrides').select('match_id').in('match_id', ids);
  if (error || !data?.length) return new Set();
  const manual = new Set(data.map((x) => x.match_id as number));
  return new Set(rows.filter((m) => manual.has(m.id)).map((m) => m.matchday));
}

// Marca como pleno el partido indicado en cada cambio (y lo quita del anterior).
// Modifica `is_pleno` de las filas recibidas. Devuelve cuántas jornadas se han cambiado.
export async function applyPleno(supabase: SupabaseClient, rows: PlenoRow[], changes: PlenoChange[]): Promise<number> {
  let done = 0;
  for (const c of changes) {
    if (c.from.length) {
      const { error } = await supabase.from('matches').update({ is_pleno: false }).in('id', c.from);
      if (error) {
        console.error('No se pudo quitar el pleno anterior', error);
        continue;
      }
    }
    const { error } = await supabase.from('matches').update({ is_pleno: true }).eq('id', c.to);
    if (error) {
      console.error('No se pudo asignar el pleno al 15', error);
      continue;
    }
    for (const m of rows) {
      if (c.from.includes(m.id)) m.is_pleno = false;
      if (m.id === c.to) m.is_pleno = true;
    }
    done++;
  }
  return done;
}

// Deja el pleno de cada jornada de `rows` en el penúltimo partido, respetando lo elegido a mano.
// Es lo que se ejecuta solo (al abrir la jornada y tras sincronizar).
export async function reconcilePleno(supabase: SupabaseClient, rows: PlenoRow[], opts: { force?: boolean; only?: number[] } = {}): Promise<number> {
  let changes = planPleno(rows, opts);
  if (!changes.length) return 0;
  const manual = await manualMatchdays(supabase, rows, changes.map((c) => c.matchday));
  changes = changes.filter((c) => !manual.has(c.matchday));
  return applyPleno(supabase, rows, changes);
}
