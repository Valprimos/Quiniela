import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { currentSeason } from '@/lib/season';
import { fetchAll } from '@/lib/paging';
import { XgError, fetchUnderstatLaLiga, pairWithDb } from '@/lib/xg';

export const dynamic = 'force-dynamic';

const NEEDS_MIGRATION = 'Falta ejecutar supabase/migration-8-xg.sql en Supabase (SQL Editor).';

type Row = {
  id: number;
  matchday: number;
  utc_date: string;
  home_name: string;
  away_name: string;
  home_score: number;
  away_score: number;
  home_xg: number | null;
  away_xg: number | null;
  xg_source: string | null;
};

// El xG solo se maneja para La Liga: Understat no cubre la Champions
async function finishedPd(): Promise<Row[] | null> {
  const supabase = db();
  let failed = false;
  const rows = await fetchAll<Row>(async (from, to) => {
    const res = await supabase
      .from('matches')
      .select('id,matchday,utc_date,home_name,away_name,home_score,away_score,home_xg,away_xg,xg_source')
      .eq('competition', 'PD')
      .eq('season', currentSeason())
      .eq('status', 'FINISHED')
      .order('utc_date', { ascending: false })
      .range(from, to);
    if (res.error) failed = true;
    return res as { data: Row[] | null };
  });
  return failed ? null : rows;
}

// Estado: cuántos partidos terminados tienen xG y cuáles faltan (los más recientes primero)
export async function GET() {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  const rows = await finishedPd();
  if (!rows) return NextResponse.json({ error: NEEDS_MIGRATION, needsMigration: true }, { status: 400 });
  const missing = rows.filter((r) => r.home_xg == null || r.away_xg == null);
  return NextResponse.json({
    finished: rows.length,
    withXg: rows.length - missing.length,
    missing: missing.slice(0, 30).map((r) => ({
      id: r.id,
      matchday: r.matchday,
      home: r.home_name,
      away: r.away_name,
      score: `${r.home_score}-${r.away_score}`,
    })),
    missingTotal: missing.length,
  });
}

const validXg = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 8 ? Math.round(n * 100) / 100 : null;
};

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const supabase = db();

  if (action === 'set' || action === 'clear') {
    const matchId = Number(body?.matchId);
    if (!Number.isInteger(matchId)) return NextResponse.json({ error: 'Partido no válido.' }, { status: 400 });
    let patch: { home_xg: number | null; away_xg: number | null; xg_source: string | null };
    if (action === 'clear') {
      patch = { home_xg: null, away_xg: null, xg_source: null };
    } else {
      const h = validXg(body?.homeXg);
      const a = validXg(body?.awayXg);
      if (h == null || a == null) return NextResponse.json({ error: 'El xG debe ser un número entre 0 y 8.' }, { status: 400 });
      patch = { home_xg: h, away_xg: a, xg_source: 'manual' };
    }
    const { error } = await supabase.from('matches').update(patch).eq('id', matchId);
    if (error) return NextResponse.json({ error: error.message.includes('xg') ? NEEDS_MIGRATION : 'No se pudo guardar el xG.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'import') {
    const rows = await finishedPd();
    if (!rows) return NextResponse.json({ error: NEEDS_MIGRATION, needsMigration: true }, { status: 400 });
    let remote;
    try {
      remote = await fetchUnderstatLaLiga(currentSeason());
    } catch (e) {
      return NextResponse.json({ error: e instanceof XgError ? e.message : 'No se pudo leer Understat.' }, { status: 502 });
    }
    // Lo puesto a mano manda sobre lo importado
    const manual = new Set(rows.filter((r) => r.xg_source === 'manual').map((r) => r.id));
    const pairs = pairWithDb(
      remote,
      rows.filter((r) => !manual.has(r.id)).map((r) => ({ id: r.id, home_name: r.home_name, away_name: r.away_name, utc_date: r.utc_date }))
    );
    const unchanged = new Map(rows.map((r) => [r.id, r]));
    const todo = pairs.filter((p) => {
      const cur = unchanged.get(p.id);
      return !cur || cur.home_xg !== p.xgH || cur.away_xg !== p.xgA;
    });
    for (let i = 0; i < todo.length; i += 20) {
      const results = await Promise.all(
        todo.slice(i, i + 20).map((p) => supabase.from('matches').update({ home_xg: p.xgH, away_xg: p.xgA, xg_source: 'understat' }).eq('id', p.id))
      );
      if (results.some((r) => r.error)) return NextResponse.json({ error: 'No se pudo guardar el xG importado.' }, { status: 500 });
    }
    const covered = new Set([...pairs.map((p) => p.id), ...manual, ...rows.filter((r) => r.home_xg != null && r.away_xg != null).map((r) => r.id)]);
    return NextResponse.json({
      ok: true,
      imported: todo.length,
      found: remote.length,
      skippedManual: manual.size,
      finished: rows.length,
      stillMissing: rows.length - covered.size,
    });
  }

  return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });
}
