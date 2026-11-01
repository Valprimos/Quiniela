#!/usr/bin/env node
// Restaura una copia de seguridad de la Quiniela (el JSON que descarga el panel de admin > Copia de seguridad).
//
// Uso (desde la raíz del proyecto, con Node 20 o superior):
//   node --env-file=.env.local scripts/restore-backup.mjs copia.json --dry-run     (solo muestra qué haría)
//   node --env-file=.env.local scripts/restore-backup.mjs copia.json               (restaura lo que falte)
//   node --env-file=.env.local scripts/restore-backup.mjs copia.json --pin 1234    (si hay que recrear jugadores)
//   node --env-file=.env.local scripts/restore-backup.mjs copia.json --overwrite   (pisa también lo que ya existe)
//
// Necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (las mismas que usa la app).
//
// Qué hace, por orden: partidos -> pandilla -> jugadores -> pronósticos -> archivo de temporadas.
// Por defecto NO pisa nada que ya exista (solo añade lo que falte), así que es seguro lanzarlo sobre una base
// de datos con datos más recientes. La copia no incluye PIN ni fotos de perfil ni el código de invitación:
//  - si hay que recrear jugadores, todos quedan con el PIN que pases en --pin (que cada uno lo cambie luego);
//  - si hay que recrear la pandilla, se genera un código de invitación nuevo (lo verás al terminar).

import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--pin');
const dryRun = flag('--dry-run');
const overwrite = flag('--overwrite');
const pin = valueOf('--pin');

function die(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!file) die('Falta el archivo de la copia. Ejemplo: node --env-file=.env.local scripts/restore-backup.mjs copia.json --dry-run');
if (pin !== undefined && !/^\d{4,6}$/.test(pin)) die('El PIN de --pin tiene que ser de 4 a 6 números.');

let backup;
try {
  backup = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  die(`No se pudo leer ${file}: ${e.message}`);
}
if (backup?.app !== 'quiniela' || backup?.formato !== 1) die('Ese archivo no parece una copia de la Quiniela (formato 1).');

const partidos = backup.partidos ?? [];
const jugadores = backup.jugadores ?? [];
const pronosticos = backup.pronosticos ?? [];
const archivo = backup.archivoTemporadas ?? [];
const pandilla = backup.pandilla ?? null;

console.log(`\nCopia de ${backup.exportadoEn ?? 'fecha desconocida'}${pandilla?.name ? ` · pandilla "${pandilla.name}"` : ''}`);
console.log(`  partidos: ${partidos.length} · jugadores: ${jugadores.length} · pronósticos: ${pronosticos.length} · archivo de temporadas: ${archivo.length}`);
console.log(`  modo: ${dryRun ? 'SIMULACIÓN (no escribe nada)' : overwrite ? 'pisando lo que ya exista' : 'solo añade lo que falte'}\n`);

// Coherencia mínima antes de tocar nada
const matchIds = new Set(partidos.map((m) => m.id));
const playerIds = new Set(jugadores.map((p) => p.id));
const orphanPreds = pronosticos.filter((p) => !matchIds.has(p.match_id) || !playerIds.has(p.player_id)).length;
if (orphanPreds) console.warn(`⚠ ${orphanPreds} pronósticos apuntan a un partido o jugador que no está en la copia; se intentarán igualmente.`);
if (dryRun) {
  console.log('Simulación terminada: no se ha escrito nada.\n');
  process.exit(0);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  die('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (usa --env-file=.env.local o expórtalas).');
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function upsertAll(table, rows, onConflict, label) {
  if (!rows.length) return;
  let done = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict, ignoreDuplicates: !overwrite });
    if (error) die(`${label}: ${error.message} (se detiene aquí; puedes volver a lanzarlo, no duplica nada)`);
    done += chunk.length;
  }
  console.log(`✓ ${label}: ${done} revisados`);
}

// 1) Partidos (comunes a todas las pandillas)
await upsertAll('matches', partidos, 'id', 'Partidos');

// 2) Pandilla
let newInviteCode = null;
if (pandilla?.id) {
  const { data: existing, error } = await supabase.from('groups').select('id').eq('id', pandilla.id).maybeSingle();
  if (error) die(`Pandilla: ${error.message}`);
  if (!existing) {
    newInviteCode = randomBytes(4).toString('hex').toUpperCase();
    const { error: insertError } = await supabase
      .from('groups')
      .insert({ id: pandilla.id, name: pandilla.name ?? 'Pandilla', invite_code: newInviteCode, created_at: pandilla.created_at });
    if (insertError) die(`Pandilla: ${insertError.message}`);
    console.log(`✓ Pandilla recreada (código de invitación nuevo: ${newInviteCode})`);
  } else {
    console.log('✓ Pandilla: ya existía');
  }
}

// 3) Jugadores: los que ya existen se dejan como están; los que faltan necesitan --pin
if (jugadores.length) {
  const { data: present, error } = await supabase.from('players').select('id').in('id', jugadores.map((p) => p.id));
  if (error) die(`Jugadores: ${error.message}`);
  const have = new Set((present ?? []).map((p) => p.id));
  const missing = jugadores.filter((p) => !have.has(p.id));
  if (missing.length && pin === undefined) {
    die(
      `Faltan ${missing.length} jugadores en la base de datos y la copia no guarda los PIN. ` +
        'Vuelve a lanzarlo con --pin 1234 (el PIN temporal que tendrán todos) o recréalos a mano.'
    );
  }
  if (missing.length) {
    const pin_hash = await bcrypt.hash(pin, 10);
    const rows = missing.map((p) => ({
      id: p.id,
      group_id: pandilla.id,
      name: p.name,
      is_admin: p.is_admin === true,
      created_at: p.created_at,
      pin_hash,
    }));
    const { error: insertError } = await supabase.from('players').insert(rows);
    if (insertError) die(`Jugadores: ${insertError.message}`);
    console.log(`✓ Jugadores recreados: ${missing.length} (todos con el PIN temporal que has indicado)`);
  } else {
    console.log('✓ Jugadores: ya existían todos');
  }
}

// 4) Pronósticos y 5) archivo de temporadas
await upsertAll('predictions', pronosticos, 'player_id,match_id', 'Pronósticos');
await upsertAll('season_archive', archivo, 'group_id,competition,season,player_id', 'Archivo de temporadas');

console.log('\nListo.');
if (newInviteCode) console.log(`Código de invitación de la pandilla recreada: ${newInviteCode}`);
console.log('');
