-- Migración 6: saber cuándo fue la última sincronización correcta y por qué falló la última.
-- Ejecútala una vez en Supabase > SQL Editor. (Opcional: sin ella todo funciona igual, pero el panel
-- de admin no podrá mostrar el último error.)

alter table sync_state add column if not exists last_ok timestamptz;
alter table sync_state add column if not exists last_error text;
