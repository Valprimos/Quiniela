// Caché sencilla en memoria (solo navegador) para no repetir peticiones que ya se hicieron.
//   - Si hay una petición en curso con la misma clave, se comparte en vez de lanzar otra.
//   - Mientras un dato está "viejo" se sigue pudiendo mostrar (peek) y se actualiza por detrás.
//   - `tag` sirve para marcar de qué versión de los datos es: si cambia, se vuelve a pedir.
// Las claves incluyen el id del jugador, así no se mezclan datos de una liga o persona con otra.

type Entry = { at: number; tag?: unknown; data?: unknown; promise?: Promise<unknown> };
const store = new Map<string, Entry>();

export function peek<T>(key: string): T | undefined {
  return store.get(key)?.data as T | undefined;
}

export function load<T>(
  key: string,
  loader: () => Promise<T>,
  opts: { ttl?: number; tag?: unknown } = {}
): Promise<T> {
  const { ttl = 60_000, tag } = opts;
  const e = store.get(key);
  if (e?.promise) return e.promise as Promise<T>;
  const fresh = e && e.data !== undefined && Date.now() - e.at < ttl && (tag === undefined || e.tag === tag);
  if (fresh) return Promise.resolve(e!.data as T);

  const p = loader().then(
    (data) => {
      store.set(key, { at: Date.now(), tag, data });
      return data;
    },
    (err) => {
      // Si falla, se conserva lo anterior (aunque esté viejo) y se quita la marca de "en curso"
      if (e) store.set(key, { at: e.at, tag: e.tag, data: e.data });
      else store.delete(key);
      throw err;
    }
  );
  store.set(key, { at: e?.at ?? 0, tag: e?.tag, data: e?.data, promise: p });
  return p;
}

// Olvida lo guardado (todo, o solo las claves que empiezan por `prefix`)
export function clear(prefix = ''): void {
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}
