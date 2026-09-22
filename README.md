# Quiniela

Quiniela entre colegas para Primera División, Segunda División y Champions League. Los partidos y
resultados se sincronizan solos, con modo en vivo, clasificación por competición y combinada,
estadísticas detalladas, varias pandillas independientes y panel de admin.

> **Segunda División:** football-data.org no la trae en su plan gratuito, así que usa una fuente
> distinta, api-football.com, que sí es gratis para esto (100 peticiones al día). Hace falta una
> clave aparte: regístrate gratis en https://dashboard.api-football.com/register y ponla en
> `API_FOOTBALL_KEY`. Primera y Champions siguen viniendo de football-data.org.

## Puesta en marcha (instalación nueva)

1. **Supabase**: crea un proyecto y ejecuta `supabase/schema.sql` en el SQL Editor.
2. **football-data.org** (Primera y Champions) y **api-football.com** (Segunda): regístrate en
   los dos y copia sus claves.
3. Copia `.env.example` a `.env.local` y rellena las variables.
4. `npm install` y `npm run dev`.
5. Entra, pulsa "Soy nuevo o quiero crear una pandilla", inventa un código de pandilla y crea tu
   jugador. Serás admin de esa pandilla automáticamente.

## Si ya tenías la versión anterior en marcha

Ejecuta `supabase/migration-2-multigrupo.sql` en el SQL Editor (no `schema.sql`, que es solo para
instalaciones nuevas). Dentro del archivo hay dos líneas que tienes que ajustar a mano:

- El código de invitación de tu pandilla de siempre (para que tus colegas no se queden fuera).
- Quién de vosotros es el admin (`update players set is_admin = true where name_key = '...'`).

## Pandillas

Cualquiera puede crear una pandilla nueva con un código que se invente; si el código no existe
todavía, se crea la pandilla y esa persona queda como admin. Cada pandilla ve sus propios
jugadores, pronósticos y clasificaciones, pero comparten los mismos partidos y resultados.

## Competiciones

Un selector arriba cambia entre Primera, Segunda y Champions. Cada una tiene su propia jornada,
clasificación de Liga y estadísticas. En la Champions, las eliminatorias (sin número de jornada
en los datos de origen) se agrupan por fase con un número de jornada interno; se ve la fase con
una etiqueta ("Octavos de final", etc.) debajo del número de jornada.

La Clasificación tiene tres vistas: por jornada, general de la competición elegida, y combinada
(la suma de las tres competiciones).

## Modo en vivo

Mientras un partido está en juego, los pronósticos se colorean como acierto o fallo provisional
(con un borde en vez de relleno, para distinguirlo de un acierto ya cerrado) y la clasificación de
la jornada muestra los puntos "en vivo" aparte. Se recalcula solo, sin que haga falta recargar.

## Historial de un equipo

Pinchar en el nombre o el escudo de cualquier equipo (en los partidos o en las estadísticas) abre
todos sus resultados de la temporada.

## Panel de admin

Solo lo ve quien tiene `is_admin`. Desde ahí se puede:

- Resetear el PIN de un colega que lo haya olvidado.
- Corregir a mano el resultado de un partido (queda marcado para que la próxima sincronización
  con football-data.org no lo vuelva a pisar).
- Bloquear o desbloquear a mano los pronósticos de una jornada entera.
- Archivar la clasificación final de la temporada actual, para consultarla luego en "Archivo de
  temporadas" dentro de Clasificación.

## Despliegue en Vercel

Importa el repo y añade las mismas variables de entorno. Al abrir la web, los datos se refrescan
solos si están viejos (cada 2 min con partidos en juego, cada 3 h el resto del tiempo).

Para que también se actualicen sin que nadie entre, el repo trae un workflow de GitHub Actions
(`.github/workflows/sync.yml`, cada 10 min). Añade en GitHub > Settings > Secrets: `APP_URL`
(p. ej. `https://tu-quiniela.vercel.app`) y `CRON_SECRET` (el mismo de las variables de entorno).

> El cron nativo de Vercel en el plan Hobby solo puede ejecutarse una vez al día, por eso no se usa.

Comprobar la sincronización a mano:

```
curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/sync?force=1"
```

## Reglas

- Se puede cambiar o quitar el pronóstico hasta que empieza el partido; después se bloquea (o
  antes, si un admin bloquea la jornada a mano).
- Los pronósticos de los demás solo se ven cuando el partido ha empezado.
- 1 punto por acierto, solo en partidos terminados. Los empates en la clasificación comparten
  posición.
- Los colegas se registran con el código de su pandilla, un nombre y un PIN (4-6 números).
