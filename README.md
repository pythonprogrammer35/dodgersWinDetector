# DodgerWin

When the Los Angeles Dodgers win at home, fans get a text with the Panda Express
discount code, so they don't have to watch the game. The site also shows game
results, season stats, and the Kalshi prediction-market chance that the Dodgers
win their next home game.

CPSC 454 project, California State University, Fullerton.

## Quick start (local)

Requirements: Node.js 18+ and Python 3.11+.

1. Set up the Python service once:

   ```bash
   cd win-prediction
   python3 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   cd ..
   ```

2. From the repo root, install and run everything:

   ```bash
   npm install
   npm run dev
   ```

   This starts the win-probability API on http://127.0.0.1:8000 and the web
   app on **http://localhost:5173**. Ctrl+C stops both.

Sign-in is a development stub for now: any 6-digit code works.


#### HTTP API routes:
| Route | Returns |
|---|---|
| `GET /api/win-probability[?date=YYYY-MM-DD]` | Win probability for the next home game, or for the given date |
| `GET /api/upcoming[?days=N]` | Win probabilities for every home game in the next N days (1–30) |
| `GET /api/next-game` | Next scheduled home game (no probability) |

## Data sources

- **MLB Stats API** (`statsapi.mlb.com`): schedule, scores, standings. Public and
  CORS-enabled, so the browser calls it directly.
- **Kalshi** (`api.elections.kalshi.com`): read-only public market data for the
  `KXMLBGAME` series. Kalshi rejects browser requests, so the frontend goes
  through `http_api.py` locally, or API Gateway + Lambda in production.

Win probabilities are market prices, not predictions we make, and are no
guarantee of the result.

## Deployment (planned)

The target AWS architecture is described in the project documentation:

- **Frontend:** S3 + CloudFront + Route 53, behind AWS WAF.
- **Backend:** API Gateway + Lambda, with EventBridge schedules for checking game results.
- **Data and messaging:** DynamoDB, SNS + Twilio for SMS, Cognito for auth.
- **Security:** KMS for encrypting phone numbers, Secrets Manager for credentials.

To point a production build at the deployed API, set `VITE_API_BASE_URL` (see
[frontend/.env.example](frontend/.env.example)).

## Not built yet

- Real SMS sign-in (`frontend/src/auth.js` is a stub)
- A real CAPTCHA on sign-in
- Discount alerts by SMS and email (alert Lambda; SNS/Twilio for texts, SES for email). The dashboard tells users to check their texts
- AWS deployment of the win-probability API
