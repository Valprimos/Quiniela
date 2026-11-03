import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { currentSeason } from '@/lib/season';
import { AWARDS, AWARD_KEYS, CHAMPIONS_PICKS, INDIVIDUAL_AWARD_KEYS, cleanName, maxPoints, sameTeam, scoreAwards, scoreChampions, scoreRanking } from '@/lib/seasonPicks';
import {
  effectiveOrder,
  isClosed,
  loadChampionsTeams,
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

const awardsFilled = (a: Record<string, string> | null | undefined, keys = AWARD_KEYS) => keys.filter((k) => cleanName(a?.[k])).length;

// Estado de un jugador: clasificación y premios.
function progress(row: PickRow | null | undefined, teamCount: number) {
  const ranking = !!row?.ranking && row.ranking.length === teamCount && teamCount > 0;
  const picks: Record<string, string> = { ...row?.awards, mvp: row?.awards?.mvp ?? row?.primo ?? '' };
  const awards = awardsFilled(picks, INDIVIDUAL_AWARD_KEYS) === INDIVIDUAL_AWARD_KEYS.length;
  const champions = CHAMPIONS_PICKS.every((pick) => !!cleanName(picks[pick.key]));
  return { ranking, awards, champions, done: Number(ranking) + Number(awards) + Number(champions), total: 3 };
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
    });
  }

  const championsTeams = await loadChampionsTeams(supabase, season);

  // Jugadores de la pandilla (con foto si existe la columna)
  const withAvatar = await supabase.from('players').select('id,name,avatar_updated_at').eq('group_id', session.gid);
  const playerRows: { id: string; name: string; avatar_updated_at?: string | null }[] = withAvatar.error
    ? ((await supabase.from('players').select('id,name').eq('group_id', session.gid)).data ?? [])
    : (withAvatar.data ?? []);
  const memberIds = playerRows.map((p) => p.id);
  const avatarOf = (id: string) => {
    const ts = playerRows.find((p) => p.id === id)?.avatar_updated_at;
    return ts ? new Date(ts).getTime() : null;
  };

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

  // Lo que ve todo el mundo cuando se cierra el plazo: las predicciones de cada uno.
  const everyone = closed
    ? playerRows
        .map((p) => {
          const row = byPlayer.get(p.id) ?? null;
          const r = scoreRanking(row?.ranking, real.order, zones);
          const awardPicks = { ...row?.awards, mvp: row?.awards?.mvp ?? row?.primo ?? '' };
          const a = scoreAwards(awardPicks, winners);
          const champions = scoreChampions(awardPicks, winners);
          const awardRows = [...a.rows, ...champions.rows];
          return {
            playerId: p.id,
            name: p.name,
            avatar: avatarOf(p.id),
            hasPicks: !!row && (!!row.ranking?.length || awardsFilled(awardPicks) > 0),
            ranking: row?.ranking ?? null,
            teamRows: r.rows,
            awards: awardPicks,
            awardRows,
            rankingPoints: r.points,
            awardPoints: a.points + champions.points,
            total: r.points + a.points + champions.points,
          };
        })
        .sort((x, y) => Number(y.hasPicks) - Number(x.hasPicks) || y.total - x.total || x.name.localeCompare(y.name, 'es'))
    : null;

  const admin = session.admin
    ? {
        deadlineOverride: settings?.deadline ? new Date(settings.deadline).toISOString() : null,
        officialOrder: Array.isArray(settings?.results?.order) && settings!.results!.order!.length ? settings!.results!.order! : null,
        liveOrder: effectiveOrder(null, matches).order,
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
    championsPickDef: CHAMPIONS_PICKS,
    championsTeams,
    mine: {
      ranking: mine?.ranking ?? null,
      awards: { ...mine?.awards, mvp: mine?.awards?.mvp ?? mine?.primo ?? '' },
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
  const championsTeams = await loadChampionsTeams(supabase, season);

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
  if (!awards.mvp && existing?.primo) awards.mvp = existing.primo;
  if (body.awards !== undefined) {
    if (!body.awards || typeof body.awards !== 'object') return fail('Los premios no son válidos.');
    for (const k of AWARD_KEYS) {
      if (k in body.awards) {
        const v = cleanName(body.awards[k]);
        if (!v) {
          delete awards[k];
          continue;
        }
        if (CHAMPIONS_PICKS.some((pick) => pick.key === k)) {
          const team = championsTeams.find((name) => sameTeam(name, v));
          if (!team) return fail('Elige un equipo de la Champions de esta temporada.');
          awards[k] = team;
        } else awards[k] = v;
      }
    }
  }

  const finalists = [awards.champions_finalista1, awards.champions_finalista2].filter(Boolean);
  if (finalists.length === 2 && sameTeam(finalists[0], finalists[1])) return fail('Elige dos finalistas distintos.');
  if (awards.champions_campeon && !finalists.some((team) => sameTeam(team, awards.champions_campeon!))) {
    return fail('Elige al campeón entre los dos finalistas.');
  }

  const { error } = await supabase.from('season_picks').upsert(
    { player_id: session.pid, season, ranking, awards, primo: null, updated_at: new Date().toISOString() },
    { onConflict: 'player_id,season' }
  );
  if (error) return fail('No se pudo guardar.', 500);
  return NextResponse.json({ ok: true, progress: progress({ player_id: session.pid, ranking, awards, primo: null }, teams.length) });
}
