import { db } from './db';

export type PlayerInfo = {
  id: string;
  name: string;
  group_id: string;
  is_admin: boolean;
  avatar_updated_at: string | null;
};

// Datos actuales de varios jugadores. Si todavía no se ha ejecutado la migración de la foto
// de perfil, se piden sin esa columna para que nada se rompa.
export async function loadPlayers(ids: string[]): Promise<PlayerInfo[]> {
  if (!ids.length) return [];
  const supabase = db();
  const first = await supabase.from('players').select('id,name,group_id,is_admin,avatar_updated_at').in('id', ids);
  if (!first.error) return (first.data ?? []) as PlayerInfo[];
  const second = await supabase.from('players').select('id,name,group_id,is_admin').in('id', ids);
  return ((second.data ?? []) as Omit<PlayerInfo, 'avatar_updated_at'>[]).map((p) => ({ ...p, avatar_updated_at: null }));
}

export async function groupNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data } = await db().from('groups').select('id,name').in('id', unique);
  return new Map((data ?? []).map((g) => [g.id as string, g.name as string]));
}

// Versión de la foto (para que el navegador la vuelva a pedir al cambiarla)
export const avatarVersion = (ts: string | null | undefined): number | null => (ts ? new Date(ts).getTime() : null);
