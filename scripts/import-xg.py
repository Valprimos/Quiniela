#!/usr/bin/env python3
"""Importa el xG de La Liga desde Sofascore a la tabla `matches` de Supabase.

Se ejecuta A MANO en tu ordenador (IP residencial) después de cada jornada:
Sofascore bloquea las IPs de centros de datos, así que no sirve desde Vercel ni GitHub Actions.

    python3 scripts/import-xg.py --dry-run     # muestra qué actualizaría, sin escribir
    python3 scripts/import-xg.py               # escribe en Supabase

Variables de entorno (o fichero .env en la raíz del repo, que NO se sube a GitHub):
    SUPABASE_URL                 igual que en src/lib/db.ts
    SUPABASE_SERVICE_ROLE_KEY    igual que en src/lib/db.ts
    SEASON                       (opcional) igual que en src/lib/season.ts
    SOFASCORE_USER_AGENT         (opcional) User-Agent de un Chrome actual
    SOFASCORE_API_BASE           (opcional) por si Sofascore cambia el host de su API

Requiere: pip install -U curl_cffi
"""

from __future__ import annotations

import argparse
import math
import os
import random
import re
import sys
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from curl_cffi import requests as cffi
except ImportError:  # pragma: no cover
    cffi = None

# ---------------------------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------------------------

COMPETITION = "PD"  # La Liga en la tabla matches
DEFAULT_TOURNAMENT_ID = 8  # id de "unique tournament" de LaLiga en Sofascore (SIN VERIFICAR, ver README)
API_BASE = os.environ.get("SOFASCORE_API_BASE", "https://api.sofascore.com/api/v1").rstrip("/")

# Chrome 157 estable (3 nov 2026). Chrome congela la versión menor en "157.0.0.0".
# Sofascore rechaza los User-Agent de Chrome antiguos: actualiza esto (o usa SOFASCORE_USER_AGENT).
DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/157.0.0.0 Safari/537.36"
)

BROWSER_HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Referer": "https://www.sofascore.com/",
    "Origin": "https://www.sofascore.com",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
}

MAX_RETRIES = 4  # reintentos por petición (espera creciente)
DAY_MS = 86400 * 1000


def sec_ch_ua(major: int) -> str:
    """Cabecera sec-ch-ua que enviaría un Chrome de esa versión mayor (algoritmo GREASE de Chromium).

    curl_cffi envía la de la versión de Chrome que imita (la de la librería instalada). Si el User-Agent
    declara otra versión, las dos cabeceras se contradicen; por eso se recalcula a partir del User-Agent.
    """
    chars = [" ", "(", ":", "-", ".", "/", ")", ";", "=", "?", "_"]
    grease = f'"Not{chars[major % 11]}A{chars[(major + 1) % 11]}Brand";v="{["8", "99", "24"][major % 3]}"'
    order = [(0, 1, 2), (0, 2, 1), (1, 0, 2), (1, 2, 0), (2, 0, 1), (2, 1, 0)][major % 6]
    items: list[str] = [""] * 3
    for brand, pos in zip((grease, f'"Chromium";v="{major}"', f'"Google Chrome";v="{major}"'), order):
        items[pos] = brand
    return ", ".join(items)


class SofascoreError(Exception):
    pass


class SofascoreBlocked(SofascoreError):
    pass


class SupabaseError(Exception):
    pass


# ---------------------------------------------------------------------------------------------
# teamKey / pairWithDb: port fiel de src/lib/xg.ts (mantener sincronizados)
# ---------------------------------------------------------------------------------------------

STOP = {
    "fc", "cf", "cd", "ud", "sd", "rc", "rcd", "ca", "club", "de", "del", "real",
    "deportivo", "balompie", "futbol", "las", "la", "el",
}


def team_key(name: str) -> str:
    n = unicodedata.normalize("NFD", name)
    n = re.sub(r"[\u0300-\u036f]", "", n)
    n = n.lower()
    n = re.sub(r"[^a-z0-9 ]+", " ", n).strip()
    if re.search(r"\batleti", n):
        return "atletico"
    if re.search(r"\bbarca", n):
        return "barcelona"
    words = [w for w in n.split() if w and w not in STOP]
    return words[0] if words else n


def js_round2(x: float) -> float:
    """Math.round(x * 100) / 100 de JavaScript (la mitad hacia arriba)."""
    return math.floor(x * 100 + 0.5) / 100


def parse_iso_ms(value: str) -> int:
    """'2026-08-15T19:00:00+00:00' (o con Z / fracciones) -> milisegundos UTC."""
    s = value.strip().replace(" ", "T")
    if s.endswith("Z") or s.endswith("z"):
        s = s[:-1] + "+00:00"
    m = re.match(
        r"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:([+-])(\d{2}):?(\d{2})?)?$", s
    )
    if not m:
        raise ValueError(f"fecha no válida: {value!r}")
    y, mo, d, h, mi, se = (int(m.group(i)) for i in range(1, 7))
    micro = int((m.group(7) or "0")[:6].ljust(6, "0"))
    dt = datetime(y, mo, d, h, mi, se, micro, tzinfo=timezone.utc)
    if m.group(8):
        off = timedelta(hours=int(m.group(9)), minutes=int(m.group(10) or 0))
        dt = dt - off if m.group(8) == "+" else dt + off
    return int(dt.timestamp() * 1000)


def pair_with_db(remote: list[dict], db_rows: list[dict]) -> tuple[list[tuple[dict, dict]], list[dict]]:
    """Empareja cada partido de Sofascore con el de la base que tenga los mismos equipos y la fecha
    más cercana (hasta 3 días de margen). Un partido de la base se usa una sola vez.

    remote: dicts con home, away, at (ms UTC). db_rows: dicts con id, home_name, away_name, utc_date.
    Devuelve (parejas [(remoto, fila_db)], remotos sin pareja).
    """
    by_teams: dict[str, list[dict]] = {}
    for m in db_rows:
        k = f"{team_key(m['home_name'])}|{team_key(m['away_name'])}"
        by_teams.setdefault(k, []).append(m)
    used: set[int] = set()
    pairs: list[tuple[dict, dict]] = []
    unmatched: list[dict] = []
    for x in remote:
        cands = by_teams.get(f"{team_key(x['home'])}|{team_key(x['away'])}", [])
        best = None
        best_d = 3 * DAY_MS + 1
        for c in cands:
            if c["id"] in used:
                continue
            d = abs(parse_iso_ms(c["utc_date"]) - x["at"])
            if d < best_d:
                best, best_d = c, d
        if best is not None:
            used.add(best["id"])
            pairs.append((x, best))
        else:
            unmatched.append(x)
    return pairs, unmatched


# ---------------------------------------------------------------------------------------------
# Entorno / .env
# ---------------------------------------------------------------------------------------------


def load_dotenv(path: Path) -> None:
    """Lector mínimo de .env (no pisa variables ya definidas en el entorno)."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "'\"":
            val = val[1:-1]
        os.environ.setdefault(key, val)


def current_season() -> int:
    """Igual que currentSeason() de src/lib/season.ts."""
    now = datetime.now(timezone.utc)
    calendar = now.year if now.month >= 7 else now.year - 1
    try:
        forced = int(os.environ.get("SEASON", ""))
    except ValueError:
        return calendar
    return forced if forced >= calendar else calendar


# ---------------------------------------------------------------------------------------------
# Supabase (API REST)
# ---------------------------------------------------------------------------------------------


class Supabase:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    def _check(self, resp, what: str) -> None:
        if resp.status_code < 400:
            return
        text = resp.text[:300]
        if "42703" in text or "home_xg" in text or "xg_source" in text:
            raise SupabaseError("Falta ejecutar supabase/migration-8-xg.sql en Supabase (SQL Editor).")
        raise SupabaseError(f"Supabase respondió {resp.status_code} al {what}: {text}")

    def finished_matches(self, season: int) -> list[dict]:
        rows: list[dict] = []
        page = 1000
        offset = 0
        while True:
            resp = cffi.get(
                f"{self.url}/rest/v1/matches",
                headers=self.headers,
                params={
                    "select": "id,utc_date,home_name,away_name,home_xg,away_xg,xg_source",
                    "competition": f"eq.{COMPETITION}",
                    "season": f"eq.{season}",
                    "status": "eq.FINISHED",
                    "order": "utc_date.asc,id.asc",
                    "limit": str(page),
                    "offset": str(offset),
                },
                timeout=30,
            )
            self._check(resp, "leer los partidos")
            batch = resp.json()
            rows.extend(batch)
            if len(batch) < page:
                return rows
            offset += page

    def update_xg(self, match_id: int, home: float, away: float) -> bool:
        """Devuelve False si no se tocó ninguna fila (p. ej. pasó a 'manual' mientras corría el script)."""
        resp = cffi.patch(
            f"{self.url}/rest/v1/matches",
            headers={**self.headers, "Content-Type": "application/json", "Prefer": "return=representation"},
            params={
                "id": f"eq.{match_id}",
                "select": "id",
                # Nunca pisar lo puesto a mano, ni siquiera si cambia durante la ejecución
                "or": "(xg_source.is.null,xg_source.neq.manual)",
            },
            json={"home_xg": home, "away_xg": away, "xg_source": "sofascore"},
            timeout=30,
        )
        self._check(resp, f"actualizar el partido {match_id}")
        return len(resp.json()) > 0


# ---------------------------------------------------------------------------------------------
# Sofascore
# ---------------------------------------------------------------------------------------------


class Sofascore:
    def __init__(self, user_agent: str, min_delay: float, max_delay: float):
        self.headers = {**BROWSER_HEADERS, "User-Agent": user_agent}
        m = re.search(r"Chrome/(\d+)", user_agent)
        if m:
            self.headers["sec-ch-ua"] = sec_ch_ua(int(m.group(1)))
        self.min_delay, self.max_delay = min_delay, max_delay
        self._last = 0.0
        self.requests = 0

    def _pause(self) -> None:
        if self.requests:
            wait = random.uniform(self.min_delay, self.max_delay) - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)

    def get(self, path: str, allow_404: bool = False):
        """GET con pausa aleatoria y reintentos con espera creciente ante 403/429/5xx/red."""
        url = f"{API_BASE}{path}"
        last_status = 0
        for attempt in range(MAX_RETRIES + 1):
            self._pause()
            try:
                resp = cffi.get(url, headers=self.headers, impersonate="chrome", timeout=25)
            except Exception as e:  # red caída, DNS, timeout...
                self._last = time.monotonic()
                self.requests += 1
                last_status = 0
                if attempt == MAX_RETRIES:
                    raise SofascoreError(f"No se pudo conectar con Sofascore ({type(e).__name__}: {e}).") from e
                self._backoff(attempt, f"error de red ({type(e).__name__})")
                continue
            self._last = time.monotonic()
            self.requests += 1
            last_status = resp.status_code
            if resp.status_code == 200:
                try:
                    return resp.json()
                except ValueError as e:
                    raise SofascoreError(f"Sofascore devolvió algo que no es JSON en {path}.") from e
            if resp.status_code == 404 and allow_404:
                return None
            if resp.status_code in (403, 429) or resp.status_code >= 500:
                if attempt == MAX_RETRIES:
                    break
                self._backoff(attempt, f"HTTP {resp.status_code}")
                continue
            raise SofascoreError(f"Sofascore respondió HTTP {resp.status_code} en {path}.")
        if last_status in (403, 429):
            raise SofascoreBlocked(
                f"Sofascore bloquea las peticiones (HTTP {last_status}). Prueba desde tu IP de casa "
                "(sin VPN ni proxy), actualiza curl_cffi (pip install -U curl_cffi) o inténtalo más tarde."
            )
        raise SofascoreError(f"Sofascore respondió HTTP {last_status} en {path} tras {MAX_RETRIES + 1} intentos.")

    def _backoff(self, attempt: int, why: str) -> None:
        wait = (4 * 2**attempt) + random.uniform(0, 2)  # ~4, 8, 16, 32 s
        print(f"  ... {why}; reintento en {wait:.0f} s", flush=True)
        time.sleep(wait)


def find_season_id(sofa: Sofascore, tournament_id: int, start_year: int) -> tuple[int, str]:
    data = sofa.get(f"/unique-tournament/{tournament_id}/seasons")
    seasons = (data or {}).get("seasons") or []
    short = f"{start_year % 100:02d}/{(start_year + 1) % 100:02d}"
    long_ = f"{start_year}/{start_year + 1}"
    for s in seasons:
        year = str(s.get("year") or "")
        name = str(s.get("name") or "")
        if year in (short, long_) or name.endswith(short) or name.endswith(long_):
            return int(s["id"]), name or year
    available = ", ".join(f"{s.get('year') or s.get('name')} (id {s.get('id')})" for s in seasons[:6])
    raise SofascoreError(
        f"No encuentro la temporada {short} en el torneo {tournament_id}. Temporadas que devuelve Sofascore: "
        f"{available or 'ninguna'}. Usa --sofascore-season-id para indicarla a mano."
    )


def check_tournament(sofa: Sofascore, tournament_id: int) -> str:
    data = sofa.get(f"/unique-tournament/{tournament_id}", allow_404=True)
    name = ((data or {}).get("uniqueTournament") or {}).get("name") or ""
    if not name:
        raise SofascoreError(
            f"No puedo leer el torneo {tournament_id} en Sofascore. Revisa el id con --tournament-id."
        )
    if "liga" not in name.lower():
        raise SofascoreError(
            f"El torneo {tournament_id} se llama {name!r}, no parece La Liga. Usa --tournament-id con el id correcto."
        )
    return name


def round_numbers(sofa: Sofascore, tournament_id: int, season_id: int) -> list[int]:
    data = sofa.get(f"/unique-tournament/{tournament_id}/season/{season_id}/rounds", allow_404=True)
    if not data:
        return list(range(1, 39))
    nums = sorted({r["round"] for r in data.get("rounds", []) if isinstance(r.get("round"), int)})
    current = (data.get("currentRound") or {}).get("round")
    if isinstance(current, int):
        nums = [n for n in nums if n <= current]
    return nums or list(range(1, 39))


def finished_events(sofa: Sofascore, tournament_id: int, season_id: int, rnd: int) -> list[dict]:
    data = sofa.get(f"/unique-tournament/{tournament_id}/season/{season_id}/events/round/{rnd}", allow_404=True)
    out = []
    for e in (data or {}).get("events", []):
        if (e.get("status") or {}).get("type") != "finished":
            continue
        home = (e.get("homeTeam") or {}).get("name")
        away = (e.get("awayTeam") or {}).get("name")
        ts = e.get("startTimestamp")
        if not home or not away or not isinstance(ts, (int, float)) or "id" not in e:
            continue
        out.append({"event_id": e["id"], "home": home, "away": away, "at": int(ts) * 1000, "round": rnd})
    return out


def _num(v):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def extract_xg(stats: dict | None) -> tuple[float, float] | None:
    """Busca 'Expected goals' en el periodo ALL. None si el partido no lo publica."""
    for block in (stats or {}).get("statistics", []):
        if block.get("period") != "ALL":
            continue
        for group in block.get("groups", []):
            for item in group.get("statisticsItems", []):
                name = str(item.get("name") or "").strip().lower()
                if item.get("key") == "expectedGoals" or name == "expected goals":
                    h = _num(item.get("homeValue", item.get("home")))
                    a = _num(item.get("awayValue", item.get("away")))
                    if h is not None and a is not None:
                        return h, a
    return None


# ---------------------------------------------------------------------------------------------
# Programa principal
# ---------------------------------------------------------------------------------------------


def same_xg(cur_h, cur_a, h: float, a: float) -> bool:
    return (
        cur_h is not None
        and cur_a is not None
        and abs(float(cur_h) - h) < 0.005
        and abs(float(cur_a) - a) < 0.005
    )


def fmt(x: dict) -> str:
    when = datetime.fromtimestamp(x["at"] / 1000, timezone.utc).strftime("%d/%m/%Y")
    return f"{x['home']} - {x['away']} ({when}, J{x['round']})"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Importa el xG de La Liga desde Sofascore a Supabase.")
    ap.add_argument("--dry-run", action="store_true", help="muestra qué actualizaría, sin escribir en Supabase")
    ap.add_argument("--season", type=int, help="año de inicio de la temporada (por defecto, la actual de la app)")
    ap.add_argument("--only-missing", action="store_true",
                    help="no descarga el xG de partidos que ya son de Sofascore (los sin xG y los de Understat sí se descargan)")
    ap.add_argument("--tournament-id", type=int, default=DEFAULT_TOURNAMENT_ID, help="id de La Liga en Sofascore")
    ap.add_argument("--sofascore-season-id", type=int, help="id de temporada de Sofascore (si falla la detección)")
    ap.add_argument("--min-delay", type=float, default=1.0, help="pausa mínima entre peticiones (s)")
    ap.add_argument("--max-delay", type=float, default=2.0, help="pausa máxima entre peticiones (s)")
    args = ap.parse_args(argv)

    if cffi is None:
        print("Falta curl_cffi. Instálalo con:  pip install -U curl_cffi", file=sys.stderr)
        return 1

    root = Path(__file__).resolve().parent.parent
    load_dotenv(root / ".env")
    load_dotenv(Path.cwd() / ".env")
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY (entorno o fichero .env; ver .env.example).",
              file=sys.stderr)
        return 1

    season = args.season or current_season()
    user_agent = os.environ.get("SOFASCORE_USER_AGENT") or DEFAULT_UA
    mode = "SIMULACRO (no se escribe nada)" if args.dry_run else "escritura real"
    print(f"La Liga, temporada {season} - {mode}")

    supabase = Supabase(url, key)
    try:
        db_rows = supabase.finished_matches(season)
    except SupabaseError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    print(f"Partidos terminados en tu base: {len(db_rows)}")
    if not db_rows:
        print("Nada que hacer.")
        return 0

    sofa = Sofascore(user_agent, args.min_delay, args.max_delay)
    events: list[dict] = []
    blocked: str | None = None
    try:
        tname = check_tournament(sofa, args.tournament_id)
        if args.sofascore_season_id:
            season_id, sname = args.sofascore_season_id, f"id {args.sofascore_season_id}"
        else:
            season_id, sname = find_season_id(sofa, args.tournament_id, season)
        print(f"Sofascore: {tname}, temporada {sname} (torneo {args.tournament_id}, temporada id {season_id})")
        for rnd in round_numbers(sofa, args.tournament_id, season_id):
            got = finished_events(sofa, args.tournament_id, season_id, rnd)
            events.extend(got)
            print(f"  Jornada {rnd}: {len(got)} partidos terminados", flush=True)
    except SofascoreBlocked as e:
        blocked = str(e)
    except SofascoreError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nInterrumpido; no se ha escrito nada.", file=sys.stderr)
        return 130

    events.sort(key=lambda x: (x["at"], x["event_id"]))
    # Se empareja contra TODAS las filas (también las manuales) para que éstas no ensucien la lista de
    # "sin emparejar"; las manuales se saltan después.
    pairs, unmatched = pair_with_db(events, db_rows)

    todo: list[tuple[dict, dict, float, float]] = []  # (evento, fila, xG local, xG visitante)
    skipped_manual = skipped_have = no_xg = unchanged = invalid = replaced = relabeled = 0
    fetch_list = []
    for ev, row in pairs:
        if row.get("xg_source") == "manual":
            skipped_manual += 1
        elif args.only_missing and row.get("xg_source") == "sofascore" and row.get("home_xg") is not None \
                and row.get("away_xg") is not None:
            skipped_have += 1
        else:
            fetch_list.append((ev, row))

    if blocked is None and fetch_list:
        print(f"Descargando xG de {len(fetch_list)} partidos (~{len(fetch_list) * (args.min_delay + args.max_delay) / 2 / 60:.0f} min)...")
    pending = 0
    try:
        for i, (ev, row) in enumerate(fetch_list, 1):
            if blocked is not None:
                break
            try:
                stats = sofa.get(f"/event/{ev['event_id']}/statistics", allow_404=True)
            except SofascoreBlocked as e:
                blocked = str(e)
                pending = len(fetch_list) - (i - 1)
                break
            except SofascoreError as e:
                print(f"  [{i}/{len(fetch_list)}] {fmt(ev)}: {e} (se salta)")
                continue
            xg = extract_xg(stats)
            if xg is None:
                no_xg += 1
                print(f"  [{i}/{len(fetch_list)}] {fmt(ev)}: sin xG publicado", flush=True)
                continue
            h, a = js_round2(xg[0]), js_round2(xg[1])
            if not (0 <= h <= 8 and 0 <= a <= 8):
                invalid += 1
                print(f"  [{i}/{len(fetch_list)}] {fmt(ev)}: xG fuera de rango ({xg[0]}, {xg[1]}), se salta")
                continue
            same = same_xg(row.get("home_xg"), row.get("away_xg"), h, a)
            legacy = row.get("xg_source") == "understat"
            if same and not legacy:
                unchanged += 1
                print(f"  [{i}/{len(fetch_list)}] {fmt(ev)}: {h:.2f} - {a:.2f} (sin cambios)", flush=True)
                continue
            todo.append((ev, row, h, a))
            note = ""
            if legacy and same:
                relabeled += 1
                note = " (Understat, mismo valor: se marca como Sofascore)"
            elif legacy:
                replaced += 1
                note = f" (sustituye a Understat {float(row['home_xg']):.2f} - {float(row['away_xg']):.2f})"
            print(f"  [{i}/{len(fetch_list)}] {fmt(ev)}: {h:.2f} - {a:.2f}{note}", flush=True)
    except KeyboardInterrupt:
        print("\nInterrumpido; no se ha escrito nada.", file=sys.stderr)
        return 130

    # Escritura (también de lo obtenido antes de un posible bloqueo)
    written = lost_manual = 0
    if todo and not args.dry_run:
        try:
            for ev, row, h, a in todo:
                if supabase.update_xg(row["id"], h, a):
                    written += 1
                else:
                    lost_manual += 1
        except SupabaseError as e:
            print(f"Error escribiendo en Supabase: {e}", file=sys.stderr)
            return 1

    # Resumen
    with_xg = len(todo) + unchanged
    def line(label: str, value) -> None:
        print(f"{label:<42}{value}")

    print("\n=== Resumen ===")
    line("Partidos terminados en tu base:", len(db_rows))
    line("Terminados en Sofascore:", len(events))
    line("Emparejados:", len(pairs))
    line("Con xG en Sofascore:", with_xg)
    line("A importar (simulacro):" if args.dry_run else "Importados:", len(todo) if args.dry_run else written)
    line("  de ellos, sustituyen a Understat:", replaced)
    line("  de ellos, Understat con el mismo valor:", relabeled)
    line("Sin cambios (mismo xG):", unchanged)
    line("Saltados por ser manuales:", skipped_manual + lost_manual)
    if args.only_missing:
        line("Saltados (ya eran de Sofascore):", skipped_have)
    line("Sin xG publicado en Sofascore:", no_xg)
    if invalid:
        line("xG fuera de rango (ignorados):", invalid)
    if pending:
        line("Sin descargar por el bloqueo:", pending)

    if unmatched:
        print(f"\nPartidos de Sofascore SIN emparejar con tu base ({len(unmatched)}):")
        for x in unmatched:
            print(f"  {fmt(x)}   [teamKey: {team_key(x['home'])} | {team_key(x['away'])}]")
        names = sorted({n for x in unmatched for n in (x["home"], x["away"])})
        print("Nombres de equipo de Sofascore implicados (amplía teamKey si alguno debería casar):")
        for n in names:
            print(f"  {n!r} -> {team_key(n)!r}")
    paired_ids = {row["id"] for _, row in pairs}
    orphan_db = [r for r in db_rows if r["id"] not in paired_ids]
    if orphan_db and blocked is None:
        print(f"\nPartidos de tu base sin pareja en Sofascore ({len(orphan_db)}):")
        for r in orphan_db:
            print(f"  {r['home_name']} - {r['away_name']} ({r['utc_date'][:10]})   "
                  f"[teamKey: {team_key(r['home_name'])} | {team_key(r['away_name'])}]")

    if blocked:
        print(f"\n!! {blocked}", file=sys.stderr)
        if written:
            print(f"(Lo obtenido antes del bloqueo sí se ha guardado: {written} partidos.)", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
