import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { currentSeason } from '@/lib/season';
import { AWARD_KEYS, ZONE_ORDER, cleanName, sameTeam } from '@/lib/seasonPicks';
import {
  SettingsRow,
  isClosed,
  loadLigaMatches,
  loadSettings,
  missingTable,
  resolveDeadline,
  teamsOf,
} from '@/lib/seasonPicksServer';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Acciones del admin sobre las predicciones de temporada de su pandilla:
//   deadline : { deadline: ISO | null }                       cambiar el cierre (null = el de por defecto)
//   zones    : { zones: { champions:[a,b], ... } }            tramos clave
//   order    : { order: [equipos] | null }                    clasificación final oficial (null = la calculada)
//   awards   : { awards: { clave: 'Nombre; Otro' } }          ganadores de los premios (varios si hay empate)
//   primo    : { stage: 'nominate' | 'vote' | 'closed' }      fase del Primo de Oro
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const action = body?.action;
  const supabase = db();
  const season = currentSeason();

  const { settings, error: loadError } = await loadSettings(supabase, session.gid, season);
  if (missingTable(loadError)) {
    return fail('Falta ejecutar supabase/migration-10-predicciones-temporada.sql en Supabase.', 503);
  }
  const matches = await loadLigaMatches(supabase, season);
  const teams = teamsOf(matches);

  const next: Pick<SettingsRow, 'deadline' | 'zones' | 'results' | 'primo_stage'> = {
    deadline: settings?.deadline ?? null,
    zones: settings?.zones ?? null,
    results: settings?.results ?? null,
    primo_stage: settings?.primo_stage ?? 'nominate',
  };

  if (action === 'deadline') {
    if (body.deadline === null) {
      next.deadline = null;
    } else {
      const t = new Date(body.deadline);
      if (!body.deadline || Number.isNaN(t.getTime())) return fail('Fecha no válida.');
      next.deadline = t.toISOString();
    }
  } else if (action === 'zones') {
    const z: Record<string, [number, number]> = {};
    for (const k of ZONE_ORDER) {
      const v = body.zones?.[k];
      const a = Math.round(Number(v?.[0]));
      const b = Math.round(Number(v?.[1]));
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a || b > (teams.length || 20)) {
        return fail('Los tramos no son válidos (de la posición 1 a la última, el inicio no puede superar el final).');
      }
      z[k] = [a, b];
    }
    next.zones = z;
  } else if (action === 'order') {
    if (body.order === null) {
      next.results = { ...(next.results ?? {}), order: null };
    } else {
      if (!Array.isArray(body.order)) return fail('Clasificación no válida.');
      const canon: string[] = [];
      for (const raw of body.order) {
        const t = teams.find((x) => typeof raw === 'string' && sameTeam(x.name, raw));
        if (!t || canon.includes(t.name)) return fail('Hay un equipo repetido o desconocido.');
        canon.push(t.name);
      }
      if (teams.length && canon.length !== teams.length) return fail(`Tienen que estar los ${teams.length} equipos.`);
      next.results = { ...(next.results ?? {}), order: canon };
    }
  } else if (action === 'awards') {
    if (!body.awards || typeof body.awards !== 'object') return fail('Premios no válidos.');
    const awards: Record<string, string[]> = { ...(next.results?.awards ?? {}) };
    for (const k of AWARD_KEYS) {
      if (!(k in body.awards)) continue;
      const names = String(body.awards[k] ?? '')
        .split(/[;,\n]/)
        .map((s) => cleanName(s))
        .filter(Boolean);
      if (names.length) awards[k] = names;
      else delete awards[k];
    }
    next.results = { ...(next.results ?? {}), awards };
  } else if (action === 'primo') {
    const stage = body.stage;
    if (!['nominate', 'vote', 'closed'].includes(stage)) return fail('Fase no válida.');
    // Las votaciones finales no pueden empezar hasta que se hayan publicado los candidatos
    const deadline = resolveDeadline(settings, season, matches);
    if (stage !== 'nominate' && !isClosed(deadline)) {
      return fail('Hasta que no cierre el plazo de predicciones no se puede abrir la votación final.', 409);
    }
    next.primo_stage = stage;
  } else {
    return fail('Acción no válida.');
  }

  const { error } = await supabase
    .from('season_settings')
    .upsert({ group_id: session.gid, season, ...next, updated_at: new Date().toISOString() }, { onConflict: 'group_id,season' });
  if (error) return fail('No se pudo guardar.', 500);
  return NextResponse.json({ ok: true });
}
