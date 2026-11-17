"""DodgerWin Kalshi MCP server (stdio).

Run:   python server.py
Debug: mcp dev server.py   (opens the MCP Inspector)
"""

from __future__ import annotations

import logging
from collections.abc import Callable

import httpx
from mcp.server.mcpserver import MCPServer

import kalshi_core

logging.getLogger("httpx").setLevel(logging.WARNING)

mcp = MCPServer(
    "dodgerwin-kalshi",
    instructions=(
        "Tools for the Los Angeles Dodgers' upcoming home games and their win "
        "probability implied by Kalshi prediction-market prices. Report the "
        "numbers exactly as returned; never estimate a probability yourself."
    ),
)


def _safe(fn: Callable[[], dict]) -> dict:
    try:
        return fn()
    except (httpx.HTTPError, ValueError) as exc:
        return {"available": False, "error": f"{type(exc).__name__}: {exc}"}


@mcp.tool()
def next_dodgers_home_game() -> dict:
    """Get the next scheduled Los Angeles Dodgers home game (date, start time,
    opponent) from the official MLB schedule. Does not include a probability."""
    return _safe(kalshi_core.next_home_game)


@mcp.tool()
def dodgers_home_win_probability(date: str | None = None) -> dict:
    """Get the probability that the Dodgers win a home game, from Kalshi market
    prices. `date` is the game date as YYYY-MM-DD (Pacific time); omit it for the
    next home game. If `available` is false, no probability exists; say so."""
    return _safe(lambda: kalshi_core.home_win_probability(date))


@mcp.tool()
def upcoming_home_win_probabilities(days: int = 7) -> dict:
    """Get Kalshi-implied win probabilities for every Dodgers home game in the
    next `days` days (1-30, default 7). Each game has its own `available` flag."""
    return _safe(lambda: kalshi_core.upcoming_home_probabilities(days))


if __name__ == "__main__":
    mcp.run()
