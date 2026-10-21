import { STAGE_LABEL, competitionDef } from './competitions';

// Lógica pura (sin red ni base de datos) que decide a quién se avisa y con qué texto.
// Así se puede probar sola y el cron solo tiene que leer datos y enviar.

export type OpenMatch = {
  id: number;
  competition: string;
  matchday: number;
  stage: string | null;
  utc_date: string;
  status: string;
  admin_locked?: boolean;
};

export type Sub = { id: string; playerId: string; leadHours: number };

export type Reminder = {
  subId: string;
  keys: string[]; // grupos que se dan por avisados al enviar
  payload: { title: string; body: string; url: string; tag: string };
};

const OPEN_STATUSES = ['SCHEDULED', 'TIMED'];

// Fecha (día) en hora de Madrid: un aviso como mucho por jornada y día de partidos
function madridDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(iso));
}

export function relativeTime(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function roundLabel(m: OpenMatch): string {
  const comp = competitionDef(m.competition).short;
  if (m.matchday >= 100) return `${comp} · ${(m.stage && STAGE_LABEL[m.stage]) || 'eliminatoria'}`;
  return `${comp} · J${m.matchday}`;
}

export function planReminders(input: {
  now: number;
  matches: OpenMatch[];
  subs: Sub[];
  predicted: Set<string>; // `${playerId}:${matchId}`
  sent: Set<string>; // `${subId}|${key}`
}): Reminder[] {
  const { now, matches, subs, predicted, sent } = input;

  // Solo partidos que todavía admiten pronóstico
  const open = matches.filter(
    (m) =>
      OPEN_STATUSES.includes(m.status) &&
      !m.admin_locked &&
      new Date(m.utc_date).getTime() > now
  );
  const out: Reminder[] = [];

  for (const sub of subs) {
    const mine = open.filter((m) => !predicted.has(`${sub.playerId}:${m.id}`));
    const horizon = now + sub.leadHours * 3600e3;
    const inWindow = mine.filter((m) => new Date(m.utc_date).getTime() <= horizon);
    if (!inWindow.length) continue;

    // Un grupo = una jornada de una competición, en un día de partidos
    const groups = new Map<string, OpenMatch[]>();
    for (const m of inWindow) {
      const key = `${m.competition}|${m.matchday}|${madridDay(m.utc_date)}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
    }

    const fresh = [...groups.entries()]
      .filter(([key]) => !sent.has(`${sub.id}|${key}`))
      .map(([key, ms]) => {
        const sorted = [...ms].sort((a, b) => a.utc_date.localeCompare(b.utc_date) || a.id - b.id);
        const first = sorted[0];
        // Cuántos le faltan en total en esa jornada, no solo los de la ventana
        const pending = mine.filter((m) => m.competition === first.competition && m.matchday === first.matchday).length;
        return { key, first, pending };
      })
      .sort((a, b) => a.first.utc_date.localeCompare(b.first.utc_date));
    if (!fresh.length) continue;

    const when = relativeTime(new Date(fresh[0].first.utc_date).getTime() - now);
    // Los grupos son jornada + día: para el texto se cuentan las jornadas distintas
    const rounds = new Map<string, { first: OpenMatch; pending: number }>();
    for (const g of fresh) {
      const k = `${g.first.competition}|${g.first.matchday}`;
      if (!rounds.has(k)) rounds.set(k, { first: g.first, pending: g.pending });
    }
    const list = [...rounds.values()];
    let body: string;
    if (list.length === 1) {
      const { first, pending } = list[0];
      body = `${roundLabel(first)}: te ${pending === 1 ? 'falta 1 partido' : `faltan ${pending} partidos`} por pronosticar. El primero empieza en ${when}.`;
    } else {
      const total = list.reduce((n, g) => n + g.pending, 0);
      body = `Te faltan ${total} partidos por pronosticar en ${list.length} jornadas. El primero empieza en ${when}.`;
    }
    out.push({
      subId: sub.id,
      keys: fresh.map((g) => g.key),
      payload: { title: 'Quiniela', body, url: '/', tag: 'quiniela-aviso' },
    });
  }
  return out;
}
