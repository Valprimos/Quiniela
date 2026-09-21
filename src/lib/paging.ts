// Supabase devuelve como máximo 1000 filas por petición: esto va pidiendo páginas hasta acabar.
export async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data } = await query(from, from + size - 1);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}
