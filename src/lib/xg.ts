// Emparejado de nombres de equipo para la importación del xG de La Liga.
//
// El xG ya no se importa desde la app: se ejecuta a mano scripts/import-xg.py en local (Sofascore bloquea
// las IPs de centros de datos, así que no puede correr en Vercel ni en GitHub Actions). Ese script lleva un
// port a Python de teamKey y pairWithDb: si cambias la lógica de emparejado aquí, cámbiala también allí.
// El xG también se puede poner a mano en el panel de admin (XgAdmin).

export type RemoteMatch = {
  home: string;
  away: string;
  xgH: number;
  xgA: number;
  at: number; // instante en ms
};

// ---------- Emparejar nombres de equipo (fuente externa vs. football-data.org) ----------

const STOP = new Set(['fc', 'cf', 'cd', 'ud', 'sd', 'rc', 'rcd', 'ca', 'club', 'de', 'del', 'real', 'deportivo', 'balompie', 'futbol', 'las', 'la', 'el']);

// "Athletic Club" y "Athletic" -> "athletic"; "Atlético de Madrid" y "Atleti" -> "atletico"; "Barça" -> "barcelona"
export function teamKey(name: string): string {
  const n = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .trim();
  if (/\batleti/.test(n)) return 'atletico';
  if (/\bbarca/.test(n)) return 'barcelona';
  const words = n.split(/\s+/).filter((w) => w && !STOP.has(w));
  return words[0] ?? n;
}

export type DbMatchRef = { id: number; home_name: string; away_name: string; utc_date: string };

const DAY = 86400e3;

// Cada partido de la fuente externa se empareja con el de la base que tenga los mismos equipos y la fecha
// más cercana (hasta 3 días de margen por aplazamientos u horarios). Un partido de la base se usa una vez.
export function pairWithDb(u: RemoteMatch[], db: DbMatchRef[]): { id: number; xgH: number; xgA: number }[] {
  const byTeams = new Map<string, DbMatchRef[]>();
  for (const m of db) {
    const k = `${teamKey(m.home_name)}|${teamKey(m.away_name)}`;
    (byTeams.get(k) ?? byTeams.set(k, []).get(k)!).push(m);
  }
  const used = new Set<number>();
  const out: { id: number; xgH: number; xgA: number }[] = [];
  for (const x of u) {
    const cands = byTeams.get(`${teamKey(x.home)}|${teamKey(x.away)}`) ?? [];
    let best: DbMatchRef | null = null;
    let bestD = 3 * DAY + 1;
    for (const c of cands) {
      if (used.has(c.id)) continue;
      const d = Math.abs(Date.parse(c.utc_date) - x.at);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    if (best) {
      used.add(best.id);
      out.push({ id: best.id, xgH: Math.round(x.xgH * 100) / 100, xgA: Math.round(x.xgA * 100) / 100 });
    }
  }
  return out;
}
