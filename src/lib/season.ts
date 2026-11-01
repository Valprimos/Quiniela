// Todas las competiciones que usamos (Primera, Champions) arrancan entre julio y agosto:
// de julio en adelante es la temporada que empieza ese año.
function calendarSeason(): number {
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

// La variable SEASON (opcional) sirve para adelantarse a una temporada, no para quedarse en una vieja:
// si se quedó fijada en un año anterior al que toca por fecha, se ignora y el cambio de temporada es automático.
export function currentSeason(): number {
  const calendar = calendarSeason();
  const forced = Number(process.env.SEASON);
  return Number.isInteger(forced) && forced >= calendar ? forced : calendar;
}
