import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { currentSeason } from '@/lib/season';
import {
  AWARDS,
  AWARD_KEYS,
  cleanName,
  maxPoints,
  sameName,
  sameTeam,
  scoreAwards,
  scoreRanking,
} from '@/lib/seasonPicks';
import {
  effectiveOrder,
  isClosed,
  loadLigaMatches,
  loadSettings,
  missingTable,
  resolveDeadline,
  teamsOf,
  zonesOf,
} from '@/lib/seasonPicksServer';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error, status }, { status });

type PickRow = {
  player_id: string;
  ranking: string[] | null;
  awards: Record<string, string> | null;
  primo: string | null;
};

const awardsFilled = (a: Record<string, string> | null | undefined) => AWARD_KEYS.filter((k) => cleanName(a?.[k])).length;

// Estado de un jugador: 3 tareas (clasificación, premios, Primo de Oro)
function progress(row: PickRow | null | undefined, teamCount: number) {
  const ranking = !!row?.ranking && row.ranking.length === teamCount && teamCount > 0;
  const awards = awardsFilled(row?.awards) === AWARD_KEYS.length;
  const primo = !!cleanName(row?.primo);
  return { ranking, awards, primo, done: Number(ranking) + Number(awards) + Number(primo), total: 3 };
}

// Lista de candidatos al Primo de Oro, sin repetidos y sin decir quién propuso a quién
function canonicalNominees(rows: PickRow[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const n = cleanName(r.primo);
    if (!n) continue;
    const i = out.findIndex((x) => sameName(x, n));
    if (i === -1) out.push(n);
    else if (n.length > out[i].length) out[i] = n;
  }
  return out.sort((a, b) => a.localeCompare(b, 'es'));
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('No autenticado', 401);

  const supabase = db();
  const season = currentSeason();
  const brief = req.nextUrl.searchParams.get('brief') === '1';

  const { settings, error: settingsError } = await loadSettings(supabase, session.gid, season);
  if (missingTable(settingsError)) {
    return NextResponse.json({ available: false, admin: session.admin });
  }

  const matches = await loadLigaMatches(supabase, season);
  const deadline = resolveDeadline(settings, season, matches);
  const closed = isClosed(deadline);
  const teams = teamsOf(matches);

  const { data: mineRow } = await supabase
    .from('season_picks')
    .select('player_id,ranking,awards,primo')
    .eq('player_id', session.pid)
    .eq('season', season)
    .maybeSingle();
  const mine = (mineRow as PickRow | null) ?? null;
  const prog = progress(mine, teams.length);

  if (brief) {
    return NextResponse.json({
      available: true,
      season,
      deadline: deadline.iso,
      closed,
      done: prog.done,
      total: prog.total,
      stage: settings?.primo_stage ?? 'nominate',
    });
  }

  // Jugadores de la pandilla (con foto si existe la columna)
  const withAvatar = await supabase.from('players').select('id,name,avatar_updated_at').eq('group_id', session.gid);
  const playerRows: { id: string; name: string; avatar_updated_at?: string | null }[] = withAvatar.error
    ? ((await supabase.from('players').select('id,name').eq('group_id', session.gid)).data ?? [])
    : (withAvatar.data ?? []);
  const avatarOf = (id: string) => {
    const ts = playerRows.find((p) => p.id === id)?.avatar_updated_at;
    return ts ? new Date(ts).getTime() : null;
  };
  const memberIds = playerRows.map((p) => p.id);

  const zones = zonesOf(settings, teams.length || 20);
  const maxPts = maxPoints(zones, teams.length || 20);

  const { data: allRows } = await supabase
    .from('season_picks')
    .select('player_id,ranking,awards,primo')
    .eq('season', season)
    .in('player_id', memberIds);
  const picks = (allRows as PickRow[] | null) ?? [];
  const byPlayer = new Map(picks.map((p) => [p.player_id, p]));

  const real = effectiveOrder(settings, matches);
  const winners = settings?.results?.awards ?? {};

  // Quién falta por completar (solo nombres: nunca el contenido)
  const pending = playerRows
    .filter((p) => progress(byPlayer.get(p.id), teams.length).done < 3)
    .map((p) => p.name)
    .sort((a, b) => a.localeCompare(b, 'es'));

  // Primo de Oro
  let stage: 'nominate' | 'list' | 'vote' | 'closed' = 'nominate';
  const pStage = settings?.primo_stage ?? 'nominate';
  if (closed) stage = pStage === 'vote' ? 'vote' : pStage === 'closed' ? 'closed' : 'list';
  const nominees = closed ? canonicalNominees(picks) : [];

  let myVote: string | null = null;
  let tally: { nominee: string; votes: number }[] | null = null;
  if (closed && (stage === 'vote' || stage === 'closed')) {
    const { data: votes } = await supabase.from('primo_votes').select('player_id,nominee').eq('season', season).in('player_id', memberIds);
    const rows = (votes as { player_id: string; nominee: string }[] | null) ?? [];
    myVote = rows.find((v) => v.player_id === session.pid)?.nominee ?? null;
    if (stage === 'closed') {
      // Solo se cuentan votos; jamás se devuelve quién votó a quién
      tally = nominees
        .map((n) => ({ nominee: n, votes: rows.filter((v) => sameName(v.nominee, n)).length }))
        .sort((a, b) => b.votes - a.votes || a.nominee.localeCompare(b.nominee, 'es'));
    }
  }

  // Lo que ve todo el mundo cuando se cierra el plazo: las predicciones de cada uno (salvo quién propuso a quién en el Primo)
  const everyone = closed
    ? playerRows
        .map((p) => {
          const row = byPlayer.get(p.id) ?? null;
          const r = scoreRanking(row?.ranking, real.order, zones);
          const a = scoreAwards(row?.awards, winners);
          return {
            playerId: p.id,
            name: p.name,
            avatar: avatarOf(p.id),
            hasPicks: !!row && (!!row.ranking?.length || awardsFilled(row.awards) > 0),
            ranking: row?.ranking ?? null,
            teamRows: r.rows,
            awards: row?.awards ?? {},
            awardRows: a.rows,
            rankingPoints: r.points,
            awardPoints: a.points,
            total: r.points + a.points,
          };
        })
        .sort((x, y) => Number(y.hasPicks) - Number(x.hasPicks) || y.total - x.total || x.name.localeCompare(y.name, 'es'))
    : null;

  const admin = session.admin
    ? {
        deadlineOverride: settings?.deadline ? new Date(settings.deadline).toISOString() : null,
        officialOrder: Array.isArray(settings?.results?.order) && settings!.results!.order!.length ? settings!.results!.order! : null,
        liveOrder: effectiveOrder(null, matches).order,
        primoStage: pStage,
      }
    : undefined;

  return NextResponse.json({
    available: true,
    season,
    deadline: deadline.iso,
    deadlineSource: deadline.source,
    closed,
    teams,
    zones,
    maxPoints: maxPts,
    awardsDef: AWARDS,
    mine: {
      ranking: mine?.ranking ?? null,
      awards: mine?.awards ?? {},
      primo: mine?.primo ?? null,
    },
    progress: prog,
    pending,
    members: playerRows.map((p) => p.name).sort((a, b) => a.localeCompare(b, 'es')),
    me: { id: session.pid, name: session.name },
    results: {
      order: real.order,
      source: real.source,
      final: real.final,
      awards: winners,
    },
    everyone,
    primo: { stage, nominees, myVote, tally },
    admin,
  });
}

// Guardar (o actualizar) mis predicciones: solo hasta que se cierra el plazo
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Sesión caducada. Vuelve a entrar.', 401);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return fail('Datos no válidos.');

  const supabase = db();
  const season = currentSeason();
  const { settings, error: settingsError } = await loadSettings(supabase, session.gid, season);
  if (missingTable(settingsError)) return fail('Esta sección todavía no está activada.', 503);

  const matches = await loadLigaMatches(supabase, season);
  const deadline = resolveDeadline(settings, season, matches);
  if (isClosed(deadline)) return fail('Las predicciones ya están cerradas.', 409);
  const teams = teamsOf(matches);

  const { data: existingRow } = await supabase
    .from('season_picks')
    .select('player_id,ranking,awards,primo')
    .eq('player_id', session.pid)
    .eq('season', season)
    .maybeSingle();
  const existing = (existingRow as PickRow | null) ?? null;

  let ranking = existing?.ranking ?? null;
  if (body.ranking !== undefined) {
    if (body.ranking === null) {
      ranking = null;
    } else {
      if (!Array.isArray(body.ranking)) return fail('La clasificación no es válida.');
      const canon: string[] = [];
      for (const raw of body.ranking) {
        const t = teams.find((x) => typeof raw === 'string' && sameTeam(x.name, raw));
        if (!t || canon.includes(t.name)) return fail('La clasificación tiene un equipo repetido o desconocido.');
        canon.push(t.name);
      }
      if (teams.length && canon.length !== teams.length) return fail(`Tienen que estar los ${teams.length} equipos.`);
      ranking = canon;
    }
  }

  let awards = { ...(existing?.awards ?? {}) };
  if (body.awards !== undefined) {
    if (!body.awards || typeof body.awards !== 'object') return fail('Los premios no son válidos.');
    for (const k of AWARD_KEYS) {
      if (k in body.awards) {
        const v = cleanName(body.awards[k]);
        if (v) awards[k] = v;
        else delete awards[k];
      }
    }
  }

  let primo = existing?.primo ?? null;
  if (body.primo !== undefined) primo = cleanName(body.primo) || null;

  const { error } = await supabase.from('season_picks').upsert(
    { player_id: session.pid, season, ranking, awards, primo, updated_at: new Date().toISOString() },
    { onConflict: 'player_id,season' }
  );
  if (error) return fail('No se pudo guardar.', 500);
  return NextResponse.json({ ok: true, progress: progress({ player_id: session.pid, ranking, awards, primo }, teams.length) });
}

// Votación final del Primo de Oro (cuando el admin la abre)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Sesión caducada. Vuelve a entrar.', 401);

  const body = await req.json().catch(() => null);
  if (body?.action !== 'vote') return fail('Acción no válida.');

  const supabase = db();
  const season = currentSeason();
  const { settings, error: settingsError } = await loadSettings(supabase, session.gid, season);
  if (missingTable(settingsError)) return fail('Esta sección todavía no está activada.', 503);
  if (settings?.primo_stage !== 'vote') return fail('La votación del Primo de Oro no está abierta.', 409);

  const { data: members } = await supabase.from('players').select('id').eq('group_id', session.gid);
  const ids = (members ?? []).map((m: { id: string }) => m.id);
  const { data: rows } = await supabase.from('season_picks').select('player_id,ranking,awards,primo').eq('season', season).in('player_id', ids);
  const nominees = canonicalNominees((rows as PickRow[] | null) ?? []);

  const wanted = cleanName(body.nominee);
  const nominee = nominees.find((n) => sameName(n, wanted) && sameName(wanted, n));
  if (!nominee) return fail('Ese nombre no está entre los candidatos.');
  // Votarse a uno mismo sería votar de manera desleal
  if (sameName(nominee, session.name) && sameName(session.name, nominee)) return fail('No puedes votarte a ti mismo.');

  const { error } = await supabase
    .from('primo_votes')
    .upsert({ player_id: session.pid, season, nominee, updated_at: new Date().toISOString() }, { onConflict: 'player_id,season' });
  if (error) return fail('No se pudo guardar tu voto.', 500);
  return NextResponse.json({ ok: true, nominee });
}
