# DodgerWin frontend

React + Vite, built as a static site (S3 + CloudFront). Two screens:

- **Login** (`#/login`): phone number → 6-digit SMS code. `src/auth.js` is a
  **dev stub** (any 6 digits sign you in); swap in the real auth calls there.
- **Game stats** (`#/stats`): next home game + Kalshi win probability, last
  result / discount status, season tiles, recent games, upcoming-home-games chart.

Data sources:
- MLB Stats API, fetched straight from the browser (`src/api/mlb.js`).
- Kalshi win probability through our backend (`src/api/winProbability.js`):
  Kalshi blocks browser requests. Locally that's `win-prediction/http_api.py`.

## Run locally

```bash
npm install && npm run dev      # API on :8000 + app on http://localhost:5173
```

`npm run dev` starts `win-prediction/http_api.py` (using its `.venv` if present)
and Vite together; Ctrl+C stops both. `npm run dev:web` runs Vite alone.

Vite proxies `/api` to `127.0.0.1:8000`. For production, set
`VITE_API_BASE_URL` (see `.env.example`) and run `npm run build` → `dist/`.
