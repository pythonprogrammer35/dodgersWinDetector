"""Dodgers home-game win probability from Kalshi + the MLB Stats API.

Pure logic with no MCP imports, so the same code can run inside the MCP server
and inside an AWS Lambda.

Kalshi ticker format (checked against settled 2026 events):
    event:  KXMLBGAME-{YYMONDD}{HHMM}{AWAY}{HOME}   e.g. KXMLBGAME-26SEP222210SDLAD
    market: {event_ticker}-{TEAM}                    e.g. KXMLBGAME-26SEP222210SDLAD-LAD
Date and time are the scheduled first pitch in US Eastern time. Team codes vary
in length (SF, SD, LAD, MIL), so we only rely on the team part ending in "LAD"
for a Dodgers home game. Home/away and dates come from the MLB schedule.
"""

from __future__ import annotations

import re
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx

KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2"
MLB_BASE = "https://statsapi.mlb.com/api/v1"
KALSHI_MARKET_URL = "https://kalshi.com/markets/kxmlbgame"
SERIES = "KXMLBGAME"
DODGERS_TEAM_ID = 119
TEAM_CODE = "LAD"
PACIFIC = ZoneInfo("America/Los_Angeles")
EASTERN = ZoneInfo("America/New_York")
MAX_SPREAD = 0.10  # widest bid/ask spread we trust for a midpoint
CACHE_TTL = 60  # seconds
# Regular season + postseason (wild card, division, LCS, World Series).
# Excludes spring training ("S"), whose "home" games are in Arizona.
GAME_TYPES = "R,F,D,L,W"

# Market statuses that no longer reflect a live forecast.
CLOSED_STATUSES = {"closed", "settled", "determined", "finalized"}

_EVENT_RE = re.compile(r"^KXMLBGAME-(\d{2}[A-Z]{3}\d{2})(\d{4})?([A-Z]+)$")

_client = httpx.Client(
    timeout=15.0, headers={"User-Agent": "dodgerwin-kalshi-mcp/1.0"}
)
_cache: dict[tuple, tuple[float, Any]] = {}


def _get_json(url: str, params: dict[str, Any]) -> Any:
    key = (url, tuple(sorted(params.items())))
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_TTL:
        return hit[1]
    resp = _client.get(url, params=params)
    resp.raise_for_status()
    data = resp.json()
    _cache[key] = (time.monotonic(), data)
    return data


def clear_cache() -> None:
    _cache.clear()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today_pacific() -> date:
    return _now().astimezone(PACIFIC).date()


# --------------------------------------------------------------------------- MLB


def get_dodgers_home_games(start: date, days: int) -> list[dict]:
    """Dodgers home games from `start` through `start + days`, not yet final."""
    data = _get_json(
        f"{MLB_BASE}/schedule",
        {
            "sportId": 1,
            "teamId": DODGERS_TEAM_ID,
            "startDate": start.isoformat(),
            "endDate": (start + timedelta(days=days)).isoformat(),
            "gameType": GAME_TYPES,
        },
    )
    games = []
    for day in data.get("dates", []):
        for g in day.get("games", []):
            if g["teams"]["home"]["team"]["id"] != DODGERS_TEAM_ID:
                continue
            if g.get("gameType") not in GAME_TYPES.split(","):
                continue
            if g.get("status", {}).get("abstractGameState") == "Final":
                continue
            start_utc = datetime.fromisoformat(g["gameDate"].replace("Z", "+00:00"))
            games.append(
                {
                    "game_pk": g["gamePk"],
                    "date": g.get("officialDate", day.get("date")),
                    "start_time_utc": start_utc.isoformat(),
                    "start_time_pacific": start_utc.astimezone(PACIFIC).isoformat(),
                    "opponent": g["teams"]["away"]["team"]["name"],
                    "game_number": g.get("gameNumber", 1),
                    "game_type": g.get("gameType"),
                    "status": g.get("status", {}).get("detailedState"),
                }
            )
    games.sort(key=lambda x: x["start_time_utc"])
    return games


# ------------------------------------------------------------------------ Kalshi


def get_kalshi_mlb_events(status: str = "open") -> list[dict]:
    """All KXMLBGAME events with the given status, with nested markets."""
    events: list[dict] = []
    cursor = ""
    while True:
        params = {
            "series_ticker": SERIES,
            "status": status,
            "with_nested_markets": "true",
            "limit": 200,
        }
        if cursor:
            params["cursor"] = cursor
        data = _get_json(f"{KALSHI_BASE}/events", params)
        events.extend(data.get("events") or [])
        cursor = data.get("cursor") or ""
        if not cursor or not data.get("events"):
            return events


def kalshi_date_code(d: date) -> str:
    """date(2026, 4, 7) -> '26APR07'."""
    return d.strftime("%y%b%d").upper()


def parse_event_ticker(ticker: str) -> dict | None:
    m = _EVENT_RE.match(ticker)
    if not m:
        return None
    return {"date_code": m.group(1), "hhmm": m.group(2), "teams": m.group(3)}


def find_dodgers_market(events: list[dict], game: dict) -> dict | None:
    """Return {'event': ..., 'market': ...} for the Dodgers side of `game`.

    Matches on the Eastern-time date of first pitch with LAD as the home team;
    for doubleheaders, picks the event whose ticker time is closest to the
    scheduled start.
    """
    start_et = datetime.fromisoformat(game["start_time_utc"]).astimezone(EASTERN)
    code = kalshi_date_code(start_et.date())
    target_min = start_et.hour * 60 + start_et.minute

    candidates = []
    for ev in events:
        p = parse_event_ticker(ev.get("event_ticker", ""))
        if not p or p["date_code"] != code or not p["teams"].endswith(TEAM_CODE):
            continue
        if p["hhmm"]:
            ev_min = int(p["hhmm"][:2]) * 60 + int(p["hhmm"][2:])
            dist = abs(ev_min - target_min)
        else:
            dist = 0
        candidates.append((dist, ev))
    if not candidates:
        return None
    candidates.sort(key=lambda c: c[0])
    event = candidates[0][1]
    for market in event.get("markets", []):
        if market.get("ticker", "").endswith(f"-{TEAM_CODE}"):
            return {"event": event, "market": market}
    return None


def _price(market: dict, name: str) -> float | None:
    """Read a YES price in dollars (0-1). Supports *_dollars strings and legacy cents."""
    val = market.get(f"{name}_dollars")
    if val not in (None, ""):
        return float(val)
    val = market.get(name)
    if val is not None:
        return float(val) / 100.0
    return None


def implied_probability(market: dict) -> dict:
    """Implied P(YES) from a market: bid/ask midpoint if tight, else last trade."""
    bid = _price(market, "yes_bid")
    ask = _price(market, "yes_ask")
    last = _price(market, "last_price")
    prob, method = None, None
    if bid and ask and 0 < bid <= ask < 1 and ask - bid <= MAX_SPREAD + 1e-9:
        prob, method = round((bid + ask) / 2, 4), "bid_ask_midpoint"
    elif last and 0 < last < 1:
        prob, method = round(last, 4), "last_trade"
    volume = market.get("volume_fp", market.get("volume"))
    return {
        "probability": prob,
        "method": method,
        "yes_bid": bid,
        "yes_ask": ask,
        "last_price": last,
        "volume": float(volume) if volume not in (None, "") else None,
    }


# ------------------------------------------------------------------ high level


def _unavailable(reason: str, **extra: Any) -> dict:
    return {"available": False, "reason": reason, "fetched_at": _now().isoformat(), **extra}


def _game_probability(game: dict, events: list[dict]) -> dict:
    found = find_dodgers_market(events, game)
    if not found:
        return _unavailable("No open Kalshi market for this game yet.", game=game)
    market = found["market"]
    if market.get("status") in CLOSED_STATUSES:
        return _unavailable(
            f"Kalshi market is {market['status']}; trading has ended.",
            game=game,
            market_ticker=market["ticker"],
        )
    pricing = implied_probability(market)
    if pricing["probability"] is None:
        return _unavailable(
            "Kalshi market exists but has no usable price.",
            game=game,
            market_ticker=market["ticker"],
        )
    return {
        "available": True,
        "game": game,
        "dodgers_win_probability": pricing["probability"],
        "dodgers_win_percent": round(pricing["probability"] * 100, 1),
        **{k: v for k, v in pricing.items() if k != "probability"},
        "market_ticker": market["ticker"],
        "event_title": found["event"].get("title"),
        "kalshi_url": KALSHI_MARKET_URL,
        "source": "Kalshi public market data (api.elections.kalshi.com)",
        "fetched_at": _now().isoformat(),
    }


def next_home_game(search_days: int = 180) -> dict:
    """Next scheduled Dodgers home game (no Kalshi call)."""
    games = get_dodgers_home_games(_today_pacific(), search_days)
    if not games:
        return _unavailable(f"No Dodgers home games in the next {search_days} days.")
    return {"available": True, "game": games[0], "source": "MLB Stats API",
            "fetched_at": _now().isoformat()}


def home_win_probability(game_date: str | None = None) -> dict:
    """Win probability for the Dodgers home game on `game_date` (YYYY-MM-DD,
    Pacific), or the next home game if omitted. Doubleheaders return game 1;
    use upcoming_home_probabilities() to see both."""
    if game_date:
        d = date.fromisoformat(game_date)
        games = [g for g in get_dodgers_home_games(d, 0) if g["date"] == game_date]
        if not games:
            return _unavailable(f"No Dodgers home game scheduled on {game_date}.")
        game = games[0]
    else:
        nxt = next_home_game()
        if not nxt["available"]:
            return nxt
        game = nxt["game"]
    return _game_probability(game, get_kalshi_mlb_events("open"))


def upcoming_home_probabilities(days: int = 7) -> dict:
    """Win probabilities for every Dodgers home game in the next `days` days."""
    days = max(0, min(days, 30))
    games = get_dodgers_home_games(_today_pacific(), days)
    if not games:
        return _unavailable(f"No Dodgers home games in the next {days} days.")
    events = get_kalshi_mlb_events("open")
    return {
        "available": True,
        "days": days,
        "games": [_game_probability(g, events) for g in games],
        "fetched_at": _now().isoformat(),
    }
