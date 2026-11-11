# Importar el xG de La Liga (Sofascore)

`scripts/import-xg.py` descarga el xG de los partidos terminados de La Liga desde Sofascore y lo guarda en la
tabla `matches` de Supabase (`home_xg`, `away_xg`, `xg_source = 'sofascore'`). Se ejecuta **a mano en tu
ordenador** después de cada jornada: Sofascore bloquea las IPs de centros de datos, así que no puede correr en
Vercel ni en GitHub Actions.

## Preparación (una vez)

1. Python 3 y la librería `curl_cffi` (imita la huella TLS de Chrome; `requests` o `httpx` reciben 403):

   ```bash
   pip install -U curl_cffi
   ```

2. Variables de entorno, las mismas que usa la app en `src/lib/db.ts`. Lo más cómodo es copiar `.env.example`
   a `.env` en la raíz del repo y rellenarlo (`.env` está en `.gitignore`, no se sube):

   ```bash
   cp .env.example .env
   ```

   | Variable | Para qué |
   | --- | --- |
   | `SUPABASE_URL` | URL del proyecto de Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | clave service role (nunca en el repo) |
   | `SEASON` | opcional, igual que en la app |
   | `SOFASCORE_USER_AGENT` | opcional, User-Agent de un Chrome actual |

## Uso

```bash
python3 scripts/import-xg.py --dry-run   # simulacro: muestra qué actualizaría, sin escribir
python3 scripts/import-xg.py             # escribe en Supabase
```

Opciones útiles:

- `--only-missing`: no descarga el xG de partidos que ya son de Sofascore (mucho más rápido; los que no tienen xG
  o son de Understat sí se descargan; no detecta correcciones posteriores de Sofascore).
- `--season 2026`: año de inicio de la temporada (por defecto, la actual de la app).
- `--tournament-id N` / `--sofascore-season-id N`: si Sofascore cambia los ids o falla la detección.

Reglas:

- Nunca toca filas con `xg_source = 'manual'` (ni siquiera si cambian durante la ejecución).
- Por defecto vuelve a descargar TODOS los partidos terminados, también los que ya tienen xG. Los de Understat se
  sustituyen por el valor de Sofascore (aunque coincida, se marcan como `sofascore`).
- No reescribe filas de Sofascore cuyo xG no ha cambiado.
- Si un partido no tiene xG publicado, lo salta sin error.
- Pausa aleatoria de 1-2 s entre peticiones y reintentos con espera creciente ante 403/429.

Al final imprime un resumen: terminados, emparejados, con xG, importados, saltados por manuales y sin emparejar.
Si algún equipo no casa, lista los nombres y su `teamKey` para que puedas ampliar `STOP`/`team_key` en el script
(y `teamKey` en `src/lib/xg.ts`, que debe mantenerse igual).

## Si Sofascore bloquea

Verás "Sofascore bloquea las peticiones (HTTP 403)". Prueba desde tu IP de casa (sin VPN ni proxy), actualiza
`curl_cffi` (`pip install -U curl_cffi`), revisa que el User-Agent sea de un Chrome actual (`DEFAULT_UA` en el
script) o inténtalo más tarde. Lo descargado antes del bloqueo se guarda; el resto se importa en la siguiente
ejecución.
