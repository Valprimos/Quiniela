# Quiniela

Quiniela entre colegas para Primera División y Champions League. Los partidos y resultados se
sincronizan solos, con modo en vivo, clasificación por competición y combinada, estadísticas
detalladas, varias pandillas independientes y panel de admin.

> **Segunda División:** no está incluida. football-data.org no la trae en su plan gratuito, y
> ninguna otra fuente gratuita encontrada daba datos fiables de la temporada en curso. La única
> vía real sería pagar (API-Football Pro, 19$/mes, o el plan de pago de football-data.org).
>
> **Historial para el "Cara a cara":** football-data.org limita su plan gratuito a la temporada
> en curso (varias temporadas es un paquete de pago aparte). Para esto sí hay una vía gratuita:
> api-football.com da acceso gratis a temporadas *viejas* (es la actual la que bloquea), así que
> el panel de admin puede traer de una tacada las últimas temporadas pasadas con esa clave.

## Puesta en marcha (instalación nueva)

1. **Supabase**: crea un proyecto y ejecuta `supabase/schema.sql` en el SQL Editor.
2. **football-data.org**: regístrate y copia tu token.
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

Un selector arriba cambia entre Primera y Champions. Cada una tiene su propia jornada,
clasificación de Liga y estadísticas. En la Champions, las eliminatorias (sin número de jornada
en los datos de origen) se agrupan por fase con un número de jornada interno; se ve la fase con
una etiqueta ("Octavos de final", etc.) debajo del número de jornada.

La Clasificación tiene tres vistas: por jornada, general de la competición elegida, y combinada
(la suma de Primera y Champions). Cada fila muestra también el % de los puntos posibles que lleva
cada uno (puntos entre partidos terminados en ese ámbito), con una barra para verlo de un vistazo.

## Modo en vivo

Mientras un partido está en juego, los pronósticos se colorean como acierto o fallo provisional
(con un borde en vez de relleno, para distinguirlo de un acierto ya cerrado) y la clasificación de
la jornada muestra los puntos "en vivo" aparte. Se recalcula solo, sin que haga falta recargar.

## Historial de un equipo

Pinchar en el nombre o el escudo de cualquier equipo (en los partidos o en las estadísticas) abre
un panel con sus estadísticas de la temporada (goles a favor y en contra, % de victorias en casa y
fuera, porterías a cero, mayor goleada a favor y en contra...) y todos sus resultados, con un
icono de casa o avión según jugara en casa o fuera. Se abre ya colocado en la jornada actual.
Pinchar en el rival de cualquier fila lleva a su propio panel, y se puede volver atrás con el
botón de la esquina.

## Estadísticas

Dentro de "Cara a cara" se eligen dos equipos y se ven solo sus enfrentamientos directos de esta
temporada (normalmente uno o dos partidos), separado del historial normal de cada equipo. En
"Jugadores", cada uno lleva una etiqueta de estilo (Localista, Empatador, Forastero, Atrevido, De
favoritos o Equilibrado) calculada comparando sus pronósticos con lo que pasa de verdad y con la
mayoría del grupo; hace falta un mínimo de pronósticos para que salga.

## Panel de admin

Solo lo ve quien tiene `is_admin`. Desde ahí se puede:

- Resetear el PIN de un colega que lo haya olvidado.
- Dar o quitar el rol de admin a otro jugador (no al propio, para no dejar la pandilla sin
  ningún admin por error).
- Expulsar a un jugador de la pandilla (borra también sus pronósticos). Si esa persona tiene la
  web abierta en ese momento, se le cierra la sesión sola la próxima vez que se actualice.
- Corregir a mano el resultado de un partido (queda marcado para que la próxima sincronización
  con football-data.org no lo vuelva a pisar).
- Bloquear o desbloquear a mano los pronósticos de una jornada entera.
- Archivar la clasificación final de la temporada actual, para consultarla luego en "Archivo de
  temporadas" dentro de Clasificación.
- Traer las últimas 4 temporadas pasadas de la competición elegida (necesita la variable
  `API_FOOTBALL_KEY`, gratuita en https://dashboard.api-football.com/register). Rellena el
  historial del "Cara a cara" entre equipos; no toca la sincronización de la temporada actual.

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
