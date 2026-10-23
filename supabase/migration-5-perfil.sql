-- Migración 5: foto de perfil. Ejecútala una vez en Supabase > SQL Editor.
-- (Si instalas desde cero con schema.sql, ya viene incluida.)

alter table players add column if not exists avatar text;
alter table players add column if not exists avatar_updated_at timestamptz;
