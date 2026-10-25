import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { syncIfStale } from '@/lib/sync';
import { COMPETITIONS } from '@/lib/competitions';

export const dynamic = 'force-dynamic';

// Estado de la sincronización de resultados: cuándo fue la última vez que salió bien y si hubo un error
export async function GET() {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const supabase = db();
  let rows: { competition: string; last_synced: string | null; last_ok?: string | null; last_error?: string | null }[] = [];
  const full = await supabase.from('sync_state').select('competition,last_synced,last_ok,last_error');
  if (!full.error) {
    rows = full.data ?? [];
  } else {
    // Sin la migración 6 solo se conoce la última vez que se intentó
    const basic = await supabase.from('sync_state').select('competition,last_synced');
    rows = basic.data ?? [];
  }
  const by = new Map(rows.map((r) => [r.competition, r]));
  return NextResponse.json({
    competitions: COMPETITIONS.map((c) => {
      const r = by.get(c.code);
      return {
        code: c.code,
        name: c.short,
        lastOk: r?.last_ok ?? (full.error ? r?.last_synced ?? null : null),
        lastError: r?.last_error ?? null,
      };
    }),
    config: { footballToken: !!process.env.FOOTBALL_DATA_TOKEN, cronSecret: !!process.env.CRON_SECRET },
    detail: !full.error, // false = falta la migración 6 (no se puede mostrar el último error)
  });
}

// Fuerza una sincronización ahora mismo y devuelve el resultado de cada competición
export async function POST() {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  const results = await syncIfStale(true);
  return NextResponse.json({
    results: results.map((r) => ({
      code: r.competition,
      name: COMPETITIONS.find((c) => c.code === r.competition)?.short ?? r.competition,
      ok: r.synced,
      count: r.count ?? 0,
      error: r.error ?? null,
    })),
  });
}
