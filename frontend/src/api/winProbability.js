// Win probability from Kalshi, served by win-prediction/http_api.py locally or
// by an API Gateway + Lambda (same kalshi_core) in production. Kalshi itself
// does not allow browser requests, so this must go through our backend.
//
// Responses are kalshi_core's dicts as-is:
//   /api/win-probability[?date=YYYY-MM-DD]  -> home_win_probability()
//   /api/upcoming?days=N                    -> upcoming_home_probabilities()

const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function getJson(path) {
  const resp = await fetch(BASE + path);
  if (!resp.ok) throw new Error(`Win-probability API returned ${resp.status}`);
  return resp.json();
}

export const fetchNextWinProbability = () => getJson('/api/win-probability');
export const fetchUpcomingProbabilities = (days = 14) => getJson(`/api/upcoming?days=${days}`);
