# Quiniela

Quiniela de Primera División entre colegas: los 10 partidos de cada jornada, 1 X 2, un punto por acierto,
clasificación por jornada y general. Los partidos y los resultados se sincronizan solos.

## Puesta en marcha

1. **Supabase**: crea un proyecto y ejecuta `supabase/schema.sql` en el SQL Editor.
2. **football-data.org**: regístrate y copia tu token (el plan gratuito incluye la Primera División).
3. Copia `.env.example` a `.env.local` y rellena las variables.
4. `npm install` y `npm run dev`.

## Despliegue en Vercel

Importa el repo y añade las mismas variables de entorno. Cuando alguien abre la web, los datos se
refrescan solos si están viejos (cada 2 min con partidos en juego, cada 3 h el resto del tiempo).

Para que también se actualicen sin que nadie entre, el repo trae un workflow de GitHub Actions
(`.github/workflows/sync.yml`, cada 10 min). Añade en GitHub > Settings > Secrets:
`APP_URL` (p. ej. `https://tu-quiniela.vercel.app`) y `CRON_SECRET` (el mismo de las variables de entorno).

> El cron nativo de Vercel en el plan Hobby solo puede ejecutarse una vez al día, por eso no se usa.

Comprobar la sincronización a mano:

```
curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/sync?force=1"
```

## Reglas

- Se puede cambiar el pronóstico hasta que empieza el partido; después se bloquea.
- Los pronósticos de los demás solo se ven cuando el partido ha empezado.
- 1 punto por acierto, solo en partidos terminados. Los empates en la clasificación comparten posición.
- Los colegas se registran con nombre + PIN (4-6 números) y el código de invitación (`INVITE_CODE`).
