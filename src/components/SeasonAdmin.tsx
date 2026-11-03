'use client';

import { useCallback, useEffect, useState } from 'react';
import { RankEditor, type TeamInfo } from './SeasonRank';
import {
  AWARDS,
  AWARD_GROUP_LABEL,
  ZONE_LABEL,
  ZONE_ORDER,
  Zones,
  fmtDeadline,
  isoToMadridLocal,
  madridLocalToIso,
} from '@/lib/seasonPicks';
import { clear as clearCache } from '@/lib/clientCache';

type AdminData = {
  available: boolean;
  deadline: string | null;
  deadlineSource: 'admin' | 'default' | 'jornada1' | 'none';
  closed: boolean;
  teams: TeamInfo[];
  zones: Zones;
  results: { order: string[] | null; source: string; awards: Record<string, string[]> };
  members: string[];
  progress: { done: number };
  pending: string[];
  primo: { stage: 'nominate' | 'list' | 'vote' | 'closed'; nominees: string[] };
  admin?: { deadlineOverride: string | null; officialOrder: string[] | null; liveOrder: string[] | null; primoStage: 'nominate' | 'vote' | 'closed' };
};

const SOURCE_TXT: Record<AdminData['deadlineSource'], string> = {
  admin: 'fijado por un admin',
  default: 'el de este año',
  jornada1: '1 minuto antes de la jornada 1',
  none: 'sin fecha (aún no hay partidos cargados)',
};

async function call(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/admin/season-picks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: j.error ?? 'No se pudo guardar.' };
  } catch {
    return { ok: false, error: 'Sin conexión.' };
  }
}

export default function SeasonAdmin({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [when, setWhen] = useState('');
  const [zones, setZones] = useState<Zones | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [winners, setWinners] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch('/api/season-picks', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: AdminData & { error?: string }) => {
        if (j.error) return setMsg({ ok: false, text: j.error });
        if (!j.available) return setMsg({ ok: false, text: 'Falta ejecutar supabase/migration-10-predicciones-temporada.sql en Supabase.' });
        setData(j);
        setWhen(j.deadline ? isoToMadridLocal(j.deadline) : '');
        setZones(j.zones);
        setOrder(j.admin?.officialOrder ?? j.results.order ?? j.teams.map((t) => t.name));
        setWinners(Object.fromEntries(Object.entries(j.results.awards).map(([k, v]) => [k, v.join('; ')])));
      })
      .catch(() => setMsg({ ok: false, text: 'No se pudo cargar.' }));
  }, []);
  useEffect(load, [load]);

  async function run(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    const r = await call(body);
    setBusy(false);
    setMsg({ ok: r.ok, text: r.ok ? okText : (r.error ?? 'No se pudo guardar.') });
    if (r.ok) {
      clearCache('seasonbrief');
      load();
      onChanged();
    }
  }

  if (!data || !zones) return <p className="muted">{msg ? '' : 'Cargando…'}{msg && <span className="notice">{msg.text}</span>}</p>;

  const teamCount = data.teams.length || 20;
  const stage = data.admin?.primoStage ?? 'nominate';

  return (
    <div className="sp-admin">
      {msg && <p className={msg.ok ? 'okmsg' : 'notice'}>{msg.text}</p>}

      <h4>Cierre de las predicciones</h4>
      <p className="muted small">
        Ahora: {data.deadline ? fmtDeadline(data.deadline) : '—'} ({SOURCE_TXT[data.deadlineSource]}).
      </p>
      <div className="row">
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Fecha y hora de cierre (hora de Madrid)" />
        <button
          type="button"
          className="seg-btn"
          disabled={busy || !when}
          onClick={() => {
            const iso = madridLocalToIso(when);
            if (iso) run({ action: 'deadline', deadline: iso }, 'Cierre actualizado.');
          }}
        >
          Guardar
        </button>
        {data.admin?.deadlineOverride && (
          <button type="button" className="link" disabled={busy} onClick={() => run({ action: 'deadline', deadline: null }, 'Vuelve el cierre por defecto.')}>
            Usar el de por defecto
          </button>
        )}
      </div>
      <p className="muted small">Hora de Madrid. Un año normal cierra 1 minuto antes de la jornada 1.</p>

      <h4>Tramos clave</h4>
      <p className="muted small">* Las plazas de Champions y Europa League pueden variar según el rendimiento europeo de LaLiga.</p>
      <div className="sp-zones">
        {ZONE_ORDER.map((k) => (
          <div key={k} className={`sp-zone-row z-${k}`}>
            <span>{ZONE_LABEL[k]}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={teamCount}
              value={zones[k][0]}
              aria-label={`${ZONE_LABEL[k]}: desde`}
              onChange={(e) => setZones({ ...zones, [k]: [Number(e.target.value), zones[k][1]] })}
            />
            <em>a</em>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={teamCount}
              value={zones[k][1]}
              aria-label={`${ZONE_LABEL[k]}: hasta`}
              onChange={(e) => setZones({ ...zones, [k]: [zones[k][0], Number(e.target.value)] })}
            />
          </div>
        ))}
      </div>
      <button type="button" className="seg-btn" disabled={busy} onClick={() => run({ action: 'zones', zones }, 'Tramos guardados.')}>
        Guardar tramos
      </button>

      <h4>Clasificación final oficial</h4>
      <p className="muted small">
        {data.admin?.officialOrder
          ? 'Hay una clasificación oficial guardada: es la que puntúa.'
          : 'Si no guardas ninguna, puntúa la calculada con los resultados (desempate: diferencia de goles). Guarda una oficial si el reglamento desempata de otra manera.'}
      </p>
      <div className="row">
        {data.admin?.liveOrder && (
          <button type="button" className="seg-btn" disabled={busy} onClick={() => setOrder(data.admin!.liveOrder!)}>
            Cargar la actual
          </button>
        )}
        <button type="button" className="seg-btn" disabled={busy} onClick={() => run({ action: 'order', order }, 'Clasificación oficial guardada.')}>
          Guardar como oficial
        </button>
        {data.admin?.officialOrder && (
          <button type="button" className="link danger" disabled={busy} onClick={() => run({ action: 'order', order: null }, 'Vuelve a puntuar la calculada.')}>
            Quitar la oficial
          </button>
        )}
      </div>
      <RankEditor order={order} teams={data.teams} zones={zones} onChange={setOrder} />

      <h4>Ganadores de los premios</h4>
      <p className="muted small">Si hay empate, sepáralos con punto y coma. Se acepta con o sin tildes y vale el apellido. Déjalo vacío hasta que se resuelva.</p>
      {(['liga', 'champions', 'mundial'] as const).map((g) => (
        <div key={g} className="sp-admin-awards">
          <b>{AWARD_GROUP_LABEL[g]}</b>
          {AWARDS.filter((a) => a.group === g).map((a) => (
            <label key={a.key} className="sp-award">
              <span>{a.label}</span>
              <input value={winners[a.key] ?? ''} maxLength={120} onChange={(e) => setWinners({ ...winners, [a.key]: e.target.value })} />
            </label>
          ))}
        </div>
      ))}
      <button type="button" className="seg-btn" disabled={busy} onClick={() => run({ action: 'awards', awards: winners }, 'Premios guardados.')}>
        Guardar premios
      </button>

      <h4>MVP de la temporada</h4>
      <p className="muted small">
        Fase actual:{' '}
        <b>
          {stage === 'nominate'
            ? data.closed
              ? 'candidatos publicados'
              : 'votos privados'
            : stage === 'vote'
              ? 'votación final abierta'
              : 'resultado publicado'}
        </b>
        . La lista de candidatos se publica al cerrar el plazo; la votación final se abre al acabar la temporada.
      </p>
      <div className="row">
        <button type="button" className="seg-btn" disabled={busy || !data.closed || stage === 'vote'} onClick={() => run({ action: 'primo', stage: 'vote' }, 'Votación final abierta.')}>
          Abrir votación final
        </button>
        <button type="button" className="seg-btn" disabled={busy || stage !== 'vote'} onClick={() => run({ action: 'primo', stage: 'closed' }, 'Votación cerrada: ya se ve el ganador.')}>
          Cerrar y publicar ganador
        </button>
        {stage !== 'nominate' && (
          <button type="button" className="link" disabled={busy} onClick={() => run({ action: 'primo', stage: 'nominate' }, 'Premio mundial reiniciado a la fase de candidatos.')}>
            Volver a candidatos
          </button>
        )}
      </div>
      {!data.closed && <p className="muted small">La votación final se podrá abrir cuando cierre el plazo de predicciones.</p>}
    </div>
  );
}
