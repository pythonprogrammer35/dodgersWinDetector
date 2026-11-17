"""Unit tests for kalshi_core. No network: HTTP is mocked with respx.

Fixtures are real API responses from the 2026 season (trimmed). Kalshi events
are settled, so tests that need an open market copy one and set live prices.
Live smoke test: pytest -m live
"""

from __future__ import annotations

import copy
import json
from datetime import date
from pathlib import Path

import httpx
import pytest
import respx

import kalshi_core as kc

FIX = Path(__file__).parent / "fixtures"


def load(name: str) -> dict:
    return json.loads((FIX / name).read_text())


@pytest.fixture(autouse=True)
def _fresh_cache():
    kc.clear_cache()
    yield
    kc.clear_cache()


@pytest.fixture
def schedule() -> dict:
    """Real Sep-Oct 2026 schedule with every game marked as not yet played."""
    data = load("mlb_schedule_2026_sep_oct.json")
    for day in data["dates"]:
        for g in day["games"]:
            g["status"] = {"abstractGameState": "Preview", "detailedState": "Scheduled"}
    return data


@pytest.fixture
def events() -> list[dict]:
    return load("kalshi_events_settled.json")["events"]


def make_open(events: list[dict], ticker: str, bid: str, ask: str, last: str) -> list[dict]:
    """Copy of `events` where the LAD market of `ticker` trades like a live market."""
    out = copy.deepcopy(events)
    for ev in out:
        if ev["event_ticker"] == ticker:
            for m in ev["markets"]:
                if m["ticker"].endswith("-LAD"):
                    m.update(yes_bid_dollars=bid, yes_ask_dollars=ask,
                             last_price_dollars=last, status="active")
    return out


def game(start_utc: str, d: str = "2026-09-22") -> dict:
    return {"date": d, "start_time_utc": start_utc, "game_number": 1}


# ------------------------------------------------------------------ helpers


def test_kalshi_date_code():
    assert kc.kalshi_date_code(date(2026, 4, 7)) == "26APR07"
    assert kc.kalshi_date_code(date(2026, 10, 15)) == "26OCT15"


def test_parse_event_ticker():
    assert kc.parse_event_ticker("KXMLBGAME-26SEP222210SDLAD") == {
        "date_code": "26SEP22", "hhmm": "2210", "teams": "SDLAD"}
    assert kc.parse_event_ticker("KXMLBGAME-26APR07LADTOR")["hhmm"] is None
    assert kc.parse_event_ticker("KXNBAGAME-whatever") is None


# ---------------------------------------------------------------- schedule


@respx.mock
def test_home_games_filters_away_and_final(schedule):
    # mark one home game as already final
    schedule["dates"][0]["games"][0]["status"] = {"abstractGameState": "Final"}
    respx.get(f"{kc.MLB_BASE}/schedule").respond(json=schedule)
    games = kc.get_dodgers_home_games(date(2026, 9, 20), 41)
    dates = [g["date"] for g in games]
    assert "2026-09-20" not in dates  # final
    assert "2026-09-25" not in dates  # away at SF
    assert dates == ["2026-09-22", "2026-09-23", "2026-09-24",
                     "2026-10-03", "2026-10-04", "2026-10-14", "2026-10-15"]
    assert games[0]["opponent"] == "San Diego Padres"


@respx.mock
def test_home_games_excludes_spring_training(schedule):
    schedule["dates"][1]["games"][0]["gameType"] = "S"
    respx.get(f"{kc.MLB_BASE}/schedule").respond(json=schedule)
    dates = [g["date"] for g in kc.get_dodgers_home_games(date(2026, 9, 20), 41)]
    assert "2026-09-22" not in dates


# ---------------------------------------------------------------- matching


def test_match_uses_eastern_date(events):
    # 7:10 PM PT on Sep 22 = 02:10 UTC Sep 23 = 22:10 ET Sep 22
    found = kc.find_dodgers_market(events, game("2026-09-23T02:10:00+00:00"))
    assert found["market"]["ticker"] == "KXMLBGAME-26SEP222210SDLAD-LAD"


def test_match_ignores_away_games(events):
    # Sep 25 at SF exists on Kalshi (LADSF) but is not a home game
    assert kc.find_dodgers_market(events, game("2026-09-26T02:15:00+00:00")) is None


def test_match_none_when_no_event(events):
    assert kc.find_dodgers_market(events, game("2027-04-01T02:10:00+00:00")) is None


def test_match_doubleheader_picks_closest_time(events):
    base = next(e for e in events if e["event_ticker"] == "KXMLBGAME-26SEP222210SDLAD")
    early = copy.deepcopy(base)
    early["event_ticker"] = "KXMLBGAME-26SEP221610SDLAD"
    for m in early["markets"]:
        m["ticker"] = m["ticker"].replace("2210", "1610")
    evs = [early, base]
    # game 1 at 4:10 PM ET
    g1 = kc.find_dodgers_market(evs, game("2026-09-22T20:10:00+00:00"))
    g2 = kc.find_dodgers_market(evs, game("2026-09-23T02:10:00+00:00"))
    assert g1["market"]["ticker"] == "KXMLBGAME-26SEP221610SDLAD-LAD"
    assert g2["market"]["ticker"] == "KXMLBGAME-26SEP222210SDLAD-LAD"


# -------------------------------------------------------------- probability


def test_probability_midpoint():
    p = kc.implied_probability({"yes_bid_dollars": "0.6000", "yes_ask_dollars": "0.6200",
                                "last_price_dollars": "0.5500"})
    assert p["probability"] == 0.61 and p["method"] == "bid_ask_midpoint"


def test_probability_wide_spread_uses_last():
    p = kc.implied_probability({"yes_bid_dollars": "0.4000", "yes_ask_dollars": "0.7000",
                                "last_price_dollars": "0.5800"})
    assert p["probability"] == 0.58 and p["method"] == "last_trade"


def test_probability_legacy_cents():
    p = kc.implied_probability({"yes_bid": 55, "yes_ask": 57, "last_price": 50})
    assert p["probability"] == 0.56


def test_probability_none_for_settled_market(events):
    lad = events[0]["markets"]
    m = next(x for x in lad if x["ticker"].endswith("-LAD"))
    # settled markets sit at 0/1 with no book; not a usable probability
    m = {**m, "last_price_dollars": "1.0000"}
    assert kc.implied_probability(m)["probability"] is None


# --------------------------------------------------------------- end to end


@respx.mock
def test_home_win_probability_for_date(schedule, events, monkeypatch):
    respx.get(f"{kc.MLB_BASE}/schedule").respond(json=schedule)
    respx.get(f"{kc.KALSHI_BASE}/events").respond(json={
        "cursor": "", "events": make_open(events, "KXMLBGAME-26SEP222210SDLAD",
                                          "0.6100", "0.6300", "0.6200")})
    out = kc.home_win_probability("2026-09-22")
    assert out["available"] is True
    assert out["dodgers_win_probability"] == 0.62
    assert out["dodgers_win_percent"] == 62.0
    assert out["market_ticker"] == "KXMLBGAME-26SEP222210SDLAD-LAD"
    assert out["game"]["opponent"] == "San Diego Padres"


@respx.mock
def test_no_market_is_reported_not_guessed(schedule, monkeypatch):
    monkeypatch.setattr(kc, "_today_pacific", lambda: date(2026, 9, 20))
    respx.get(f"{kc.MLB_BASE}/schedule").respond(json=schedule)
    respx.get(f"{kc.KALSHI_BASE}/events").respond(json={"cursor": "", "events": []})
    out = kc.home_win_probability()
    assert out["available"] is False
    assert "No open Kalshi market" in out["reason"]
    assert out["game"]["date"] == "2026-09-20"


@respx.mock
def test_no_game_on_date(schedule):
    respx.get(f"{kc.MLB_BASE}/schedule").respond(json=schedule)
    out = kc.home_win_probability("2026-09-25")  # away game
    assert out["available"] is False


@respx.mock
def test_kalshi_pagination(events):
    route = respx.get(f"{kc.KALSHI_BASE}/events")
    route.side_effect = [
        httpx.Response(200, json={"cursor": "abc", "events": events[:5]}),
        httpx.Response(200, json={"cursor": "", "events": events[5:]}),
    ]
    assert len(kc.get_kalshi_mlb_events()) == len(events)
    assert route.calls[1].request.url.params["cursor"] == "abc"


@respx.mock
def test_upcoming_mixes_available_and_missing(schedule, events, monkeypatch):
    monkeypatch.setattr(kc, "_today_pacific", lambda: date(2026, 9, 21))
    respx.get(f"{kc.MLB_BASE}/schedule").respond(json=schedule)
    respx.get(f"{kc.KALSHI_BASE}/events").respond(json={
        "cursor": "", "events": make_open(events, "KXMLBGAME-26SEP222210SDLAD",
                                          "0.6100", "0.6300", "0.6200")})
    out = kc.upcoming_home_probabilities(7)
    by_date = {g["game"]["date"]: g for g in out["games"]}
    assert by_date["2026-09-22"]["available"] is True
    # the other fixture markets are settled, so they must not report a number
    others = [g for d, g in by_date.items() if d != "2026-09-22"]
    assert others and not any(g["available"] for g in others)
    assert any("finalized" in g["reason"] for g in others)


# -------------------------------------------------------------------- live


@pytest.mark.live
def test_live_apis_respond():
    out = kc.upcoming_home_probabilities(7)
    assert "available" in out
    nxt = kc.next_home_game()
    assert nxt["available"] in (True, False)
