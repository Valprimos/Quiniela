-- xG (goles esperados) de cada partido, para el "índice de suerte" de Estadísticas > Grupo.
-- Ejecútalo una vez en Supabase > SQL Editor. Hasta entonces la app funciona igual, sin ese índice.
alter table matches add column if not exists home_xg numeric(4,2);
alter table matches add column if not exists away_xg numeric(4,2);
-- De dónde salió el dato: 'sofascore' (importado con scripts/import-xg.py), 'manual' (puesto por un admin; la
-- importación no lo pisa) o 'understat' (importaciones antiguas, siguen siendo válidas)
alter table matches add column if not exists xg_source text;
