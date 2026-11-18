"""Tiny JSON HTTP API over kalshi_core, for the React frontend in local dev.

Run:  python http_api.py            (serves http://127.0.0.1:8000)
      PORT=9000 python http_api.py

Routes (responses are kalshi_core's dicts, unchanged):
  GET /api/win-probability[?date=YYYY-MM-DD]  -> home_win_probability()
  GET /api/upcoming[?days=N]                  -> upcoming_home_probabilities()
  GET /api/next-game                          -> next_home_game()

In production the same functions would sit behind API Gateway + Lambda.
Kalshi rejects browser requests, which is why the frontend can't call it directly.
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import httpx

import kalshi_core


def _route(path: str, query: dict[str, list[str]]) -> dict | None:
    q = {k: v[0] for k, v in query.items()}
    if path == "/api/win-probability":
        return kalshi_core.home_win_probability(q.get("date") or None)
    if path == "/api/upcoming":
        return kalshi_core.upcoming_home_probabilities(int(q.get("days", 7)))
    if path == "/api/next-game":
        return kalshi_core.next_home_game()
    return None


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        url = urlparse(self.path)
        try:
            body = _route(url.path.rstrip("/"), parse_qs(url.query))
        except (httpx.HTTPError, ValueError) as exc:
            self._send(200, {"available": False, "error": f"{type(exc).__name__}: {exc}"})
            return
        if body is None:
            self._send(404, {"error": "not found"})
        else:
            self._send(200, body)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"DodgerWin API on http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
