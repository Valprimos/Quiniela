// Todas las competiciones que usamos (Primera, Segunda, Champions) arrancan entre
// julio y agosto: de julio en adelante es la temporada que empieza ese año.
export function currentSeason(): number {
  if (process.env.SEASON) return Number(process.env.SEASON);
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}
