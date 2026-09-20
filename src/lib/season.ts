// La Liga empieza en agosto: de julio en adelante es la temporada que arranca ese año.
export function currentSeason(): number {
  if (process.env.SEASON) return Number(process.env.SEASON);
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}
