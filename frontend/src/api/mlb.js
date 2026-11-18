// MLB Stats API (public, CORS-enabled) for schedule, results, and standings.
const MLB = 'https://statsapi.mlb.com/api/v1';
export const DODGERS_ID = 119;

const PT = 'America/Los_Angeles';

async function getJson(path, params) {
  const resp = await fetch(`${MLB}${path}?${new URLSearchParams(params)}`);
  if (!resp.ok) throw new Error(`MLB Stats API returned ${resp.status}`);
  return resp.json();
}

function todayPT() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PT }).format(new Date());
}

// Before March the "current" season is last year's.
export function currentSeason() {
  const [y, m] = todayPT().split('-').map(Number);
  return m < 3 ? y - 1 : y;
}

export function formatDate(iso, opts = { month: 'short', day: 'numeric' }) {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: PT, ...opts });
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: PT, hour: 'numeric', minute: '2-digit' });
}

function toGame(g) {
  const home = g.teams.home.team.id === DODGERS_ID;
  const us = home ? g.teams.home : g.teams.away;
  const them = home ? g.teams.away : g.teams.home;
  return {
    pk: g.gamePk,
    start: g.gameDate,
    home,
    opponent: them.team.teamName || them.team.name,
    opponentAbbr: them.team.abbreviation,
    venue: g.venue?.name,
    final: g.status.abstractGameState === 'Final',
    won: us.isWinner === true,
    ourScore: us.score,
    theirScore: them.score,
  };
}

// All Dodgers games this season up to today, newest first, finals only.
export async function fetchCompletedGames(season = currentSeason()) {
  const data = await getJson('/schedule', {
    sportId: 1,
    teamId: DODGERS_ID,
    season,
    startDate: `${season}-02-01`,
    endDate: todayPT(),
    gameType: 'R,F,D,L,W',
    hydrate: 'team',
  });
  return data.dates
    .flatMap((d) => d.games)
    .filter((g) => g.status.abstractGameState === 'Final' && g.status.detailedState !== 'Postponed')
    .map(toGame)
    .reverse();
}

export async function fetchNextHomeGame() {
  const start = todayPT();
  const end = new Date(Date.now() + 180 * 864e5).toISOString().slice(0, 10);
  const data = await getJson('/schedule', {
    sportId: 1,
    teamId: DODGERS_ID,
    startDate: start,
    endDate: end,
    gameType: 'R,F,D,L,W',
    hydrate: 'team,venue',
  });
  const g = data.dates
    .flatMap((d) => d.games)
    .find((x) => x.teams.home.team.id === DODGERS_ID && x.status.abstractGameState !== 'Final');
  return g ? toGame(g) : null;
}

export async function fetchStanding(season = currentSeason()) {
  const data = await getJson('/standings', {
    leagueId: 104,
    season,
    standingsTypes: 'regularSeason',
  });
  for (const div of data.records) {
    const t = div.teamRecords.find((r) => r.team.id === DODGERS_ID);
    if (!t) continue;
    const split = (type) => t.records?.splitRecords?.find((s) => s.type === type);
    return {
      wins: t.wins,
      losses: t.losses,
      divisionRank: t.divisionRank,
      gamesBack: t.gamesBack,
      streak: t.streak?.streakCode,
      home: split('home'),
      lastTen: split('lastTen'),
    };
  }
  return null;
}
