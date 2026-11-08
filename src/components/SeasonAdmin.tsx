'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RankEditor, type TeamInfo } from './SeasonRank';
import {
  AWARDS,
  AWARD_GROUP_LABEL,
  INDIVIDUAL_AWARD_KEYS,
  NameCluster,
  NameVariant,
  ZONE_LABEL,
  ZONE_ORDER,
  Zones,
  buildAliases,
  clustersFrom,
  fmtDeadline,
  isoToMadridLocal,
  madridLocalToIso,
  moveVariant,
  nameKey,
  renameCluster,
  resolveNames,
  separateVariant,
  variantsOf,
} from '@/lib/seasonPicks';
import { clear as clearCache } from '@/lib/clientCache';

type AdminData = {
  available: boolean;
  deadline: string | null;
  deadlineSource: 'admin' | 'default' | 'jornada1' | 'none';
  closed: boolean;
  teams: TeamInfo[];
  zones: Zones;
  results: { order: string[] | null; source: string; awards: Record<string, string[]>; aliases?: Record<string, string> };
  everyone: { playerId: string; name: string; awards: Record<string, string> }[] | null;
  members: string[];
  progress: { done: number };
  pending: string[];
  admin?: { deadlineOverride: string | null; officialOrder: string[] | null; liveOrder: string[] | null };
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

  const everyone = data?.everyone ?? null;
  const variants = useMemo(
    () => variantsOf((everyone ?? []).flatMap((e) => INDIVIDUAL_AWARD_KEYS.map((k) => e.awards?.[k]).filter((x): x is string => !!x))),
    [everyone]
  );
  const resolved = useMemo(() => resolveNames(variants, data?.results.aliases), [variants, data?.results.aliases]);

  if (!data || !zones) return <p className="muted">{msg ? '' : 'Cargando…'}{msg && <span className="notice">{msg.text}</span>}</p>;

  const teamCount = data.teams.length || 20;

  // Opciones de ganador: lo que ha puesto la gente (jugadores con el nombre ya unificado), con cuántos lo eligieron
  const chipsFor = (key: string): { name: string; n: number }[] => {
    const counts = new Map<string, { name: string; n: number }>();
    for (const e of everyone ?? []) {
      const picks =
        key === 'champions_finalistas' ? [e.awards?.champions_finalista1, e.awards?.champions_finalista2] : [e.awards?.[key]];
      const seen = new Set<string>();
      for (const raw of picks) {
        if (!raw) continue;
        const name = INDIVIDUAL_AWARD_KEYS.includes(key) ? (resolved[nameKey(raw)] ?? raw) : raw;
        const k = nameKey(name);
        if (seen.has(k)) continue;
        seen.add(k);
        const cur = counts.get(k) ?? { name, n: 0 };
        cur.n += 1;
        counts.set(k, cur);
      }
    }
    return [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'es'));
  };
  const winnerList = (key: string) => (winners[key] ?? '').split(/[;,\n]/).map((x) => x.trim()).filter(Boolean);
  const toggleWinner = (key: string, name: string) => {
    const list = winnerList(key);
    const has = list.some((x) => nameKey(x) === nameKey(name));
    const next = has ? list.filter((x) => nameKey(x) !== nameKey(name)) : [...list, name];
    setWinners({ ...winners, [key]: next.join('; ') });
  };
  const renderChips = (k: string) => {
    const chips = chipsFor(k);
    if (!chips.length) return null;
    const picked = winnerList(k);
    return (
      <div className="sp-win-chips" role="group" aria-label="Elegir ganador entre lo que ha puesto la gente">
        {chips.map((c) => (
          <button
            key={c.name}
            type="button"
            className="sp-win-chip"
            aria-pressed={picked.some((x) => nameKey(x) === nameKey(c.name))}
            onClick={() => toggleWinner(k, c.name)}
          >
            {c.name} <small>×{c.n}</small>
          </button>
        ))}
      </div>
    );
  };

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

      <h4>Unificar nombres de jugadores</h4>
      {everyone ? (
        <NameUnifier
          key={JSON.stringify(data.results.aliases ?? {}) + variants.length}
          variants={variants}
          aliases={data.results.aliases}
          busy={busy}
          onSave={(aliases) =>
            run({ action: 'aliases', aliases }, aliases ? 'Nombres unificados.' : 'Vuelve la propuesta automática.')
          }
        />
      ) : (
        <p className="muted small">Se podrán unificar cuando cierre el plazo, que es cuando se ven las predicciones de todos.</p>
      )}

      <h4>Ganadores de los premios</h4>
      <p className="muted small">Toca un nombre de lo que ha puesto la gente para marcarlo como ganador (si hay empate, toca varios). También puedes escribirlo; separa con punto y coma. Déjalo vacío hasta que se resuelva.</p>
      {(['liga', 'champions', 'mundial'] as const).map((g) => (
        <div key={g} className="sp-admin-awards">
          <b>{AWARD_GROUP_LABEL[g]}</b>
          {AWARDS.filter((a) => a.group === g).map((a) => (
            <label key={a.key} className="sp-award">
              <span>{a.label}</span>
              <input value={winners[a.key] ?? ''} maxLength={120} onChange={(e) => setWinners({ ...winners, [a.key]: e.target.value })} />
              {renderChips(a.key)}
            </label>
          ))}
        </div>
      ))}
      <div className="sp-admin-awards">
        <b>Resultado de Champions</b>
        <label className="sp-award">
          <span>Campeón</span>
          <input value={winners.champions_campeon ?? ''} maxLength={120} onChange={(e) => setWinners({ ...winners, champions_campeon: e.target.value })} />
          {renderChips('champions_campeon')}
        </label>
        <label className="sp-award">
          <span>Finalistas (separados por punto y coma)</span>
          <input value={winners.champions_finalistas ?? ''} maxLength={120} onChange={(e) => setWinners({ ...winners, champions_finalistas: e.target.value })} />
          {renderChips('champions_finalistas')}
        </label>
      </div>
      <button type="button" className="seg-btn" disabled={busy} onClick={() => run({ action: 'awards', awards: winners }, 'Premios guardados.')}>
        Guardar premios
      </button>


    </div>
  );
}

// Agrupa las distintas formas en que se ha escrito cada jugador. La propuesta automática une "Yamal", "Lamine" y
// "Lamine Yamal"; aquí se puede corregir (unir un apodo, separar a dos jugadores con el mismo apellido, renombrar).
function NameUnifier({
  variants,
  aliases,
  busy,
  onSave,
}: {
  variants: NameVariant[];
  aliases?: Record<string, string>;
  busy: boolean;
  onSave: (aliases: Record<string, string> | null) => void;
}) {
  const [clusters, setClusters] = useState<NameCluster[]>(() => clustersFrom(variants, resolveNames(variants, aliases)));
  const [touched, setTouched] = useState(false);
  const byKey = new Map(variants.map((v) => [v.key, v]));
  const countOf = (c: NameCluster) => c.keys.reduce((n, k) => n + (byKey.get(k)?.count ?? 0), 0);
  const multi = clusters.filter((c) => c.keys.length > 1).sort((a, b) => countOf(b) - countOf(a));
  const single = clusters.filter((c) => c.keys.length === 1).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const saved = !!aliases && Object.keys(aliases).length > 0;

  const change = (next: NameCluster[]) => {
    setClusters(next);
    setTouched(true);
  };

  const row = (c: NameCluster, k: string) => {
    const v = byKey.get(k)!;
    return (
      <li key={k} className="sp-un-var">
        <span>
          {v.text} <small>×{v.count}</small>
        </span>
        <select
          aria-label={`Mover «${v.text}» a otro jugador`}
          value=""
          onChange={(e) => {
            const to = e.target.value;
            if (to === '__sep') change(separateVariant(clusters, k, v.text, variants));
            else if (to) change(moveVariant(clusters, k, to, variants));
          }}
        >
          <option value="">Mover a…</option>
          {c.keys.length > 1 && <option value="__sep">Separar (es otro jugador)</option>}
          {clusters
            .filter((o) => o.id !== c.id)
            .sort((a, b) => a.name.localeCompare(b.name, 'es'))
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
        </select>
      </li>
    );
  };

  if (!variants.length) return <p className="muted small">Todavía no hay premios de jugadores escritos.</p>;

  return (
    <div className="sp-un">
      <p className="muted small">
        {multi.length > 0
          ? 'Estas escrituras parecen el mismo jugador. Cambia el nombre unificado si quieres, o mueve/separa lo que no encaje.'
          : 'No hay nombres que unir automáticamente. Si alguien escribió un apodo, muévelo al jugador que toca.'}
      </p>
      {multi.map((c) => (
        <div key={c.id} className="sp-un-cluster">
          <div className="sp-un-head">
            <input value={c.name} maxLength={60} aria-label="Nombre unificado" onChange={(e) => change(renameCluster(clusters, c.id, e.target.value))} />
            <small>{countOf(c)} votos</small>
          </div>
          <ul>{c.keys.map((k) => row(c, k))}</ul>
        </div>
      ))}
      {single.length > 0 && (
        <details className="sp-un-single">
          <summary>Nombres sueltos ({single.length})</summary>
          <p className="muted small">Si alguno es un apodo o una errata de otro jugador, muévelo a él.</p>
          <ul>
            {single.map((c) => (
              <li key={c.id} className="sp-un-var">
                <span>
                  {c.name} <small>×{countOf(c)}</small>
                </span>
                <select
                  aria-label={`Mover «${c.name}» a otro jugador`}
                  value=""
                  onChange={(e) => e.target.value && change(moveVariant(clusters, c.keys[0], e.target.value, variants))}
                >
                  <option value="">Mover a…</option>
                  {clusters
                    .filter((o) => o.id !== c.id)
                    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="row">
        <button type="button" className="seg-btn" disabled={busy || (!touched && saved)} onClick={() => onSave(buildAliases(clusters, variants))}>
          {saved && !touched ? 'Guardado' : 'Guardar nombres'}
        </button>
        {saved && (
          <button type="button" className="link danger" disabled={busy} onClick={() => onSave(null)}>
            Volver a la propuesta automática
          </button>
        )}
      </div>
    </div>
  );
}
