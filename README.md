# Quiniela

Quiniela entre colegas para La Liga y Champions League. Los partidos y resultados se
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

Un selector arriba cambia entre La Liga y Champions. Cada una tiene su propia jornada,
clasificación de Liga y estadísticas. En la Champions, las eliminatorias (sin número de jornada
en los datos de origen) se agrupan por fase con un número de jornada interno; se ve la fase con
una etiqueta ("Octavos de final", etc.) debajo del número de jornada.

Al abrir la app se elige sola la competición que tenga antes su próximo partido (o uno en juego):
si juega antes la Champions que La Liga, se abre en Champions. Si luego cambias de competición a
mano, se respeta durante la sesión.

La Clasificación tiene tres vistas: por jornada, general de la competición elegida, y combinada
(la suma de La Liga y Champions). Cada fila muestra también el % de los puntos posibles que lleva
cada uno (puntos entre partidos terminados en ese ámbito), con una barra para verlo de un vistazo.

## Modo en vivo

Mientras un partido está en juego, los pronósticos se colorean como acierto o fallo provisional
(con un borde en vez de relleno, para distinguirlo de un acierto ya cerrado) y la clasificación de
la jornada muestra los puntos "en vivo" aparte. Se recalcula solo, sin que haga falta recargar.

## Historial de un equipo

Pinchar en el nombre o el escudo de cualquier equipo (en los partidos o en las estadísticas) abre
un panel con sus estadísticas de la temporada (goles a favor y en contra, % de victorias en casa y
fuera, porterías a cero, mayor goleada a favor y en contra...) y todos sus resultados, con un
icono de casa o avión según jugara en casa o fuera. Se abre ya colocado en la jornada actual, con las temporadas anteriores guardadas por encima
(separadas por temporada) y un selector para ver las estadísticas de esta temporada o las históricas.
Pinchar en el rival de cualquier fila lleva a su propio panel, y se puede volver atrás con el
botón de la esquina.

## Estadísticas

La pestaña abre en **Jugadores**, con un selector para ver **La Liga + Champions** juntas (por
defecto) o solo la competición elegida arriba. Jugadores incluye: premios (líder, más acertador,
mejor racha (también sin contar el pleno al 15) y peor racha, la suegra, rey del pleno...), puntos apilados por competición, un mapa de
calor jornada a jornada, un comparador de dos jugadores con gráfico de radar, y una tarjeta por
jugador con anillo de acierto, últimos 10 partidos, puntos por jornada y reparto 1/X/2. El
**Siamesismo** mide qué parejas de jugadores piensan más parecido (porcentaje de partidos en los que
ponen lo mismo, con un mínimo de 8 en común), y **La suegra** es quien más va contra la mayoría del
grupo. Los
"puntos" son los mismos de la clasificación (el pleno al 15 vale 3).

Dentro de "Cara a cara" se eligen dos equipos y se ven solo sus enfrentamientos directos de esta
temporada (normalmente uno o dos partidos), separado del historial normal de cada equipo. En
"Jugadores", cada uno lleva una etiqueta de estilo (Localista, Empatador, Forastero, Atrevido, De
favoritos o Equilibrado) calculada comparando sus pronósticos con lo que pasa de verdad y con la
mayoría del grupo; hace falta un mínimo de pronósticos para que salga.

## Clasificación

El podio tiene color propio: oro para el primero, plata para el segundo, bronce para el tercero (los
empatados comparten color) y un azul grisáceo para el resto. Quien gana una jornada completa lleva
la etiqueta 🏆 con la jornada (`🏆 J12`, o `🏆 Octavos` en las eliminatorias) y tu propia fila lleva
la marca "tú".

## Carga y peticiones

La app abre con una sola petición (la jornada actual). Las jornadas vecinas solo se traen cuando
acercas el dedo o el ratón a una flecha, y la petición se comparte si ya estaba en curso. Estadísticas,
perfil de jugador y ligas guardadas se guardan en memoria: se ven al instante y solo se piden de nuevo
pasado un minuto, si termina un partido o si cambias algo (foto, nombre, pronósticos). La jornada se
refresca cada 20 s si hay partidos en juego, cada 5 min si ya está cerrada y cada minuto en el resto,
y al volver a la pestaña. Mientras llegan los datos se ven esqueletos con la forma de lo que viene.

## Perfil y varias ligas

Arriba a la derecha cada persona tiene su **menú de usuario** (con su foto y su nombre):

- **Mis ligas:** las pandillas en las que ya has entrado desde este dispositivo. Un toque en una de
  ellas cambia de liga sin escribir el código, el nombre ni el PIN. "Añadir otra liga" abre el
  formulario de entrada (o de creación) sin salir de la actual.
- **Editar perfil:** foto de perfil y nombre. La foto se recorta en cuadrado y se reduce en el propio
  móvil (unos pocos KB) y se ve en la clasificación y junto a los pronósticos de los demás. Si hay
  varias ligas guardadas se puede usar la misma foto en todas. El nombre cambia solo en esa liga y
  tiene que ser único dentro de la pandilla.
- **Avisos, Cambiar PIN y Panel de admin** (este último solo para admins).

**Perfil de cada jugador:** tocar el nombre o la foto de cualquier jugador (en la clasificación, junto
a los pronósticos de los demás o en la pestaña Estadísticas) abre su perfil: foto grande, puesto y
puntos, porcentaje de acierto, mejor racha y racha actual, jornadas ganadas, pleno al 15, puntos por
competición, sus últimos 10 partidos, con quién piensa más parecido y con quién menos, La suegra y su
equipo gafe. En Estadísticas también salen las fotos en los premios, en puntos por competición, en el
mapa de jornadas, en el cara a cara, en el Siamesismo y en las tarjetas de cada jugador.

En los puntos de colores de "Últimos 10" (en el perfil y en las tarjetas de Estadísticas), pasar el
ratón o tocar un punto muestra el partido, cómo acabó y lo que había pronosticado esa persona (con ✓ o
✗; en el pleno al 15, el marcador exacto). El perfil es compacto y se desliza si el contenido no cabe.
Los submenús del menú de usuario (perfil, añadir liga, avisos, PIN y admin) se cierran al tocar en
cualquier sitio de fuera, o con Escape; desplazarse por la página no los cierra.
- **Salir de esta liga:** la quita de las guardadas y entra en otra si queda alguna.

Cómo funciona: las ligas guardadas van en una cookie firmada solo para el servidor (no se ve desde
JavaScript), igual que la sesión. Cambiar de liga equivale a tener la sesión abierta en cada una, por
eso no pide PIN; quien salga de una liga la borra de ese dispositivo. Si alguien es expulsado de una
pandilla, desaparece solo de la lista. Las fotos se guardan en la columna `avatar` de `players`:
ejecuta `supabase/migration-5-perfil.sql` una vez (hasta entonces la app funciona igual, pero sin
fotos). Los avisos del móvil van a un solo perfil por dispositivo: el último que los active.

## Avisos de jornada (PWA)

Cada jugador puede pulsar **Avisos** en la cabecera para activar notificaciones en ese dispositivo
y elegir con cuánta antelación quiere el aviso (1 h, 3 h, 12 h o 1 día). Si se acerca un partido
que no ha pronosticado, le llega una notificación; si ya lo tiene todo, no. Como mucho se avisa una
vez por jornada y día de partidos, y no se avisa de jornadas bloqueadas por un admin. Al salir de
sesión, ese dispositivo deja de recibir avisos de ese jugador.

Puesta en marcha (una sola vez):

1. Supabase > SQL Editor: ejecuta `supabase/migration-4-push.sql` (instalaciones nuevas: ya viene
   en `schema.sql`).
2. Genera las claves: `npx web-push generate-vapid-keys`.
3. Variables de entorno en Vercel (y redeploy, porque la pública se incrusta al compilar):
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (por ejemplo `mailto:tu@correo.com`) y
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (el mismo valor que `VAPID_PUBLIC_KEY`).
4. Los avisos los manda el mismo workflow `.github/workflows/sync.yml` (ver "Despliegue en Vercel"),
   cada 5 minutos, con los secretos `APP_URL` y `CRON_SECRET`.

Probar a mano qué se enviaría, sin enviar nada: `curl -H "Authorization: Bearer $CRON_SECRET"
"$APP_URL/api/cron/notify?dry=1"`.

En iPhone/iPad los avisos solo funcionan si la web está añadida a la pantalla de inicio (iOS 16.4
o superior). En Android y ordenador funcionan directamente desde el navegador.

## Panel de admin

Solo lo ve quien tiene `is_admin`. Se abre plegado, con un botón por herramienta (Jugadores y PIN,
Resultados, Pronósticos, Bloquear jornada, Archivar temporada, Historial y Equipos guardados). Las
herramientas de Resultados, Pronósticos y Bloquear jornada llevan su propio selector de competición
y jornada, así que se puede corregir cualquier jornada sin salir del panel ni cambiar la que se ve
en la app. Desde ahí se puede:

- Resetear el PIN de un colega que lo haya olvidado.
- Dar o quitar el rol de admin a otro jugador (no al propio, para no dejar la pandilla sin
  ningún admin por error).
- Expulsar a un jugador de la pandilla (borra también sus pronósticos). Si esa persona tiene la
  web abierta en ese momento, se le cierra la sesión sola la próxima vez que se actualice.
- Editar los pronósticos de cualquier jugador: poner uno que falta, cambiar el que tenía o quitarlo,
  incluso en partidos ya cerrados o terminados (en el pleno al 15 se pone el marcador exacto). Es
  para corregir errores; los puntos y las estadísticas se recalculan solos.
- Corregir a mano el resultado de un partido (queda marcado para que la próxima sincronización
  con football-data.org no lo vuelva a pisar), o devolverlo a la actualización automática.
- Bloquear o desbloquear a mano los pronósticos de una jornada entera.
- Ver de un vistazo quién no ha pronosticado (o no del todo) una jornada: **Sin pronosticar**.
- **Pleno al 15**: elegir a mano qué partido es el pleno de una jornada (queda fijo hasta que se pulse
  "Volver a automático") y revisar y corregir jornadas pasadas con el pleno mal puesto. Corregirlas cambia
  los puntos de quien tenga pronósticos en esos partidos, y el cambio se ve en todas las pandillas porque
  los partidos son comunes. Hace falta ejecutar `supabase/migration-7-pleno-manual.sql` una vez (hasta
  entonces la app funciona igual, pero sin poder elegir el pleno a mano).
- **xG e índice de suerte**: en Estadísticas > Grupo hay un índice de suerte por jugador (puntos reales
  menos los que "tocaban" según el xG de cada partido) y una clasificación "justa". El xG de La Liga se
  carga desde el panel de admin (xG): botón para importarlo de Understat (no tiene API oficial; si su web
  cambia o bloquea, falla con un aviso) y, para lo que falte, entrada a mano partido a partido (lo puesto a
  mano no lo pisa la importación). La Champions no tiene xG. Hace falta ejecutar
  `supabase/migration-8-xg.sql` una vez; hasta entonces la app funciona igual, sin ese índice. Con pocos
  partidos con xG el índice es ruido, y la pantalla lo avisa.
- Archivar la clasificación final de la temporada actual, para consultarla luego en "Archivo de
  temporadas" dentro de Clasificación.
- Traer las últimas 4 temporadas pasadas de la competición elegida (necesita la variable
  `API_FOOTBALL_KEY`, gratuita en https://dashboard.api-football.com/register). Rellena el
  historial del "Cara a cara" entre equipos; no toca la sincronización de la temporada actual.

## Despliegue en Vercel

Importa el repo y añade las variables de entorno. Al abrir la web, los datos se refrescan solos si
están viejos (cada 2 min con partidos en juego, cada 3 h el resto del tiempo).

### Actualizar los resultados sin que nadie abra la app

Hace falta el workflow `.github/workflows/sync.yml`: cada 5 minutos trae los resultados nuevos y manda
los avisos a quien no haya pronosticado. Sin él, los resultados solo se actualizan cuando alguien abre
la app.

1. **Crear el archivo.** Va dentro de una carpeta oculta (`.github`) y al subir archivos arrastrándolos
   a GitHub esa carpeta suele quedarse fuera. Lo más fiable: en el repositorio, *Add file → Create new
   file*, escribe `.github/workflows/sync.yml` como nombre (al escribir las barras se crean las
   carpetas) y pega el contenido del archivo.
2. **Secretos.** En GitHub > Settings > Secrets and variables > Actions: `APP_URL` (la dirección de la
   web, p. ej. `https://tu-quiniela.vercel.app`) y `CRON_SECRET` (el mismo valor que en las variables de
   entorno de Vercel).
3. **Probarlo.** Pestaña *Actions → Sincronizar resultados y avisos → Run workflow*. Tiene que salir en
   verde, y el registro de cada paso muestra qué ha actualizado.

Para comprobar el estado desde la propia app: **Panel de admin → Sincronización** muestra cuándo se
actualizó cada competición por última vez, el último error si lo hubo, y permite forzar una
sincronización al momento. (La migración `supabase/migration-6-sync.sql` es opcional: añade el dato del
último error.) También a mano:

```
curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/sync?force=1"
```

Cosas a tener en cuenta:

- **Plan gratuito de football-data.org:** sus resultados llegan con retraso (no son en tiempo real) y
  permite 10 llamadas por minuto. Para resultados al instante hace falta un plan de pago de esa API.
- **GitHub Actions** deja 5 minutos como mínimo entre ejecuciones y puede retrasarse unos minutos. Si
  el repositorio pasa 60 días sin actividad, GitHub pausa los workflows programados (se reactivan desde
  la pestaña Actions).
- **Alternativa:** un servicio de cron gratuito (por ejemplo cron-job.org) que llame cada minuto a
  `APP_URL/api/cron/sync` con la cabecera `Authorization: Bearer <CRON_SECRET>`.
- El cron nativo de Vercel en el plan Hobby solo puede ejecutarse una vez al día, por eso no se usa.

## Reglas

- Se puede cambiar o quitar el pronóstico hasta que empieza el partido; después se bloquea (o
  antes, si un admin bloquea la jornada a mano).
- Los pronósticos de los demás solo se ven cuando el partido ha empezado.
- 1 punto por acierto, solo en partidos terminados. Los empates en la clasificación comparten
  posición.
- **Pleno al 15**: el penúltimo partido de cada jornada (por orden de fecha) pide el marcador
  exacto en vez de 1X2. Acertarlo vale 3 puntos; fallarlo vale 0, aunque hubieras acertado quién
  gana. Se recalcula al abrir la jornada y tras cada sincronización, así que se corrige solo si
  cambian horarios o se aplaza un partido (un aplazado no cuenta, y uno reprogramado semanas
  después tampoco). Una vez empezado el partido del pleno ya no se mueve solo. Un admin puede
  elegirlo a mano (Panel de admin > Pleno al 15).
- **Invitar colegas**: en el menú de usuario, "Invitar colegas" da un enlace y un QR con el código de la
  pandilla ya puesto (`/login?codigo=...`), y se puede compartir o copiar. Quien lo abre solo elige nombre
  y PIN. Cualquier miembro puede invitar, porque ya conoce el código. Si el código del enlace ya no existe,
  se avisa en vez de crear una pandilla nueva.
- Los colegas se registran con el código de su pandilla, un nombre y un PIN (4-6 números).
