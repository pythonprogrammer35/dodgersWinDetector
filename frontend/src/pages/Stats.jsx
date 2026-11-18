import { useMemo } from 'react';
import Logo from '../components/Logo.jsx';
import useAsync from '../useAsync.js';
import {
  currentSeason,
  fetchCompletedGames,
  fetchNextHomeGame,
  fetchStanding,
  formatDate,
  formatTime,
} from '../api/mlb.js';
import { fetchNextWinProbability, fetchUpcomingProbabilities } from '../api/winProbability.js';

const ordinal = (n) => {
  const v = Number(n);
  const s = ['th', 'st', 'nd', 'rd'][(v % 100 > 10 && v % 100 < 14) || v % 10 > 3 ? 0 : v % 10];
  return v + s;
};
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const score = (g) => `${g.won ? 'W' : 'L'} ${g.ourScore}–${g.theirScore}`;

export default function Stats({ session, onSignOut }) {
  const prob = useAsync(fetchNextWinProbability);
  const upcoming = useAsync(() => fetchUpcomingProbabilities(14));
  const nextGame = useAsync(fetchNextHomeGame);
  const games = useAsync(() => fetchCompletedGames());
  const standing = useAsync(() => fetchStanding());

  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar__inner">
          <Logo />
          <nav aria-label="Main" className="topbar__nav">
            <a href="#/stats" aria-current="page" className="nav-link nav-link--active">Game stats</a>
            <span className="nav-phone" title="Signed in">{session.phone}</span>
            <button type="button" className="nav-link nav-link--muted" onClick={onSignOut}>Sign out</button>
          </nav>
        </div>
      </header>

      <main className="container page">
        <div className="page__head">
          <div className="stack-6">
            <h1 className="display page__title">Game Day</h1>
            <p className="muted">Results, season stats, and the odds of the next discount.</p>
          </div>
          <span className="chip-outline">{currentSeason()} season · MLB Stats API &amp; Kalshi</span>
        </div>

        <div className="row">
          <NextGame prob={prob} nextGame={nextGame} />
          <LastGame games={games} />
        </div>

        <SeasonTiles standing={standing} games={games} />

        <div className="row">
          <RecentGames games={games} />
          <UpcomingChart upcoming={upcoming} />
        </div>
      </main>
    </div>
  );
}

function NextGame({ prob, nextGame }) {
  const p = prob.data;
  const available = p?.available === true;
  // Game details: from the probability response when it has them, else from MLB.
  const g = p?.game
    ? { opponent: p.game.opponent, start: p.game.start_time_utc }
    : nextGame.data && { opponent: nextGame.data.opponent, start: nextGame.data.start };
  const win = available ? p.dodgers_win_percent : null;
  const winRounded = win == null ? null : Math.round(win);

  let reason = null;
  if (prob.loading) reason = 'Checking Kalshi…';
  else if (prob.error) reason = 'Win-probability service is unreachable right now.';
  else if (!available) reason = p?.reason || p?.error || 'No Kalshi probability yet.';

  return (
    <section aria-labelledby="next-h" className="card card--next">
      <div className="card__head">
        <div className="stack-4">
          <span className="eyebrow eyebrow--sm">Next home game · Win probability</span>
          <h2 id="next-h" className="card__title">
            {g ? `Dodgers vs. ${g.opponent}` : nextGame.loading ? 'Loading next game…' : 'No home game scheduled'}
          </h2>
          {g && (
            <span className="muted">
              {formatDate(g.start, { weekday: 'short', month: 'short', day: 'numeric' })} · {formatTime(g.start)} PT · Dodger Stadium (home)
            </span>
          )}
        </div>
        {g && (
          <span className="pill pill--good">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            Discount-eligible
          </span>
        )}
      </div>

      <div className="winprob">
        <div className="stack-2">
          <span className="display winprob__big">{winRounded == null ? '—' : `${winRounded}%`}</span>
          <span className="muted">chance the Dodgers win</span>
        </div>
        <div className="winprob__meter">
          {winRounded == null ? (
            <p className="muted winprob__reason">{reason}</p>
          ) : (
            <>
              <div
                role="img"
                aria-label={`Win probability: Dodgers ${winRounded} percent, opponent ${100 - winRounded} percent`}
                className="split-bar"
              >
                <div className="split-bar__us" style={{ width: `${win}%` }} />
                <div className="split-bar__them" />
              </div>
              <div className="split-bar__labels">
                <span className="text-us">LAD {winRounded}%</span>
                <span className="text-them">OPP {100 - winRounded}%</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="drivers">
        <h3 className="drivers__title">Kalshi market</h3>
        {available ? (
          <>
            {[
              ['Best bid (YES)', p.yes_bid],
              ['Best ask (YES)', p.yes_ask],
              ['Last trade', p.last_price],
            ].map(([label, v]) => (
              <div className="driver" key={label}>
                <span className="driver__label">{label}</span>
                <div className="driver__track"><div className="driver__fill" style={{ width: `${(v ?? 0) * 100}%` }} /></div>
                <span className="driver__value">{pct(v)}</span>
              </div>
            ))}
            <div className="driver">
              <span className="driver__label">Contracts traded</span>
              <span className="driver__wide">{p.volume == null ? '—' : Math.round(p.volume).toLocaleString()}</span>
            </div>
          </>
        ) : (
          <p className="muted small">Market details appear once Kalshi lists this game.</p>
        )}
        <p className="fineprint">
          {available && (p.method === 'bid_ask_midpoint' ? 'Midpoint of the bid/ask spread. ' : 'Last traded price. ')}
          From Kalshi prediction-market prices. For fun, not a guarantee.
        </p>
      </div>
    </section>
  );
}

function LastGame({ games }) {
  const g = games.data?.[0];
  const unlocked = g && g.home && g.won;
  return (
    <section aria-labelledby="last-h" className="card card--alt card--last">
      <span className="eyebrow eyebrow--sm">Last game · Final</span>
      <h2 id="last-h" className="sr-only">Last game result</h2>
      {games.loading && <p className="muted">Loading…</p>}
      {games.error && <p className="muted">Couldn't load results from MLB.</p>}
      {games.data && !g && <p className="muted">No completed games yet this season.</p>}
      {g && (
        <>
          <div className="stack-10">
            <div className={`score-line ${g.won ? '' : 'score-line--dim'}`}>
              <span className="score-line__team">Dodgers</span>
              <span className="display score-line__runs">{g.ourScore}</span>
            </div>
            <div className={`score-line ${g.won ? 'score-line--dim' : ''}`}>
              <span className="score-line__team">{g.opponent}</span>
              <span className="display score-line__runs">{g.theirScore}</span>
            </div>
            <span className="muted small">{formatDate(g.start, { month: 'short', day: 'numeric', year: 'numeric' })} · {g.home ? 'Home' : 'Away'}</span>
          </div>

          {unlocked ? (
            <div className="promo">
              <span className="promo__kicker">Home win — discount unlocked</span>
              <span className="display promo__code">Check your texts</span>
              <span className="promo__sub">Panda Express · Code sent to subscribers by SMS</span>
            </div>
          ) : (
            <div className="promo promo--none">
              <span className="promo__kicker">No discount this time</span>
              <span className="promo__sub">{g.home ? 'Codes go out after home wins only.' : 'Away games don’t qualify — only home wins unlock a code.'}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SeasonTiles({ standing, games }) {
  const s = standing.data;
  const discountDays = games.data?.filter((g) => g.home && g.won).length;
  const v = (x) => (standing.loading ? '…' : x ?? '—');
  const tiles = [
    { label: 'Season record', value: v(s && `${s.wins}–${s.losses}`), sub: s ? `${ordinal(s.divisionRank)} in NL West${s.gamesBack !== '-' ? ` · ${s.gamesBack} GB` : ''}` : 'Regular season' },
    { label: 'Home record', value: v(s?.home && `${s.home.wins}–${s.home.losses}`), sub: 'Every home win = a code' },
    { label: 'Last 10', value: v(s?.lastTen && `${s.lastTen.wins}–${s.lastTen.losses}`), sub: s?.streak ? `Current streak ${s.streak}` : 'Regular season' },
    { label: 'Discount days', value: games.loading ? '…' : discountDays ?? '—', sub: 'Home wins, incl. postseason' },
  ];
  return (
    <section aria-label="Season stats" className="tiles">
      {tiles.map((t) => (
        <div className="tile" key={t.label}>
          <span className="tile__label">{t.label}</span>
          <span className="display tile__value">{t.value}</span>
          <span className="tile__sub">{t.sub}</span>
        </div>
      ))}
    </section>
  );
}

function RecentGames({ games }) {
  const rows = games.data?.slice(0, 5) ?? [];
  return (
    <section aria-labelledby="recent-h" className="card card--wide">
      <h2 id="recent-h" className="section-title">Recent games</h2>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Opponent</th>
              <th scope="col">Venue</th>
              <th scope="col">Result</th>
              <th scope="col">Discount</th>
            </tr>
          </thead>
          <tbody>
            {games.loading && <tr><td colSpan="5" className="muted">Loading…</td></tr>}
            {games.error && <tr><td colSpan="5" className="muted">Couldn't load results from MLB.</td></tr>}
            {rows.map((g) => (
              <tr key={g.pk}>
                <td className="dim">{formatDate(g.start)}</td>
                <td>{g.home ? 'vs' : '@'} {g.opponent}</td>
                <td className="dim">{g.home ? 'Home' : 'Away'}</td>
                <td className={g.won ? 'result result--w' : 'result result--l'}>{score(g)}</td>
                <td className={g.home && g.won ? 'text-good' : 'faint'}>
                  {!g.home ? 'Away game' : g.won ? 'Unlocked' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UpcomingChart({ upcoming }) {
  const bars = useMemo(() => {
    const list = upcoming.data?.available ? upcoming.data.games.slice(0, 7) : [];
    return list.map((r) => {
      const p = r.available ? Math.round(r.dodgers_win_percent) : null;
      return {
        key: `${r.game.game_pk}-${r.game.game_number}`,
        p,
        label: formatDate(r.game.start_time_utc, { month: 'numeric', day: 'numeric' }),
        opp: r.game.opponent,
      };
    });
  }, [upcoming.data]);

  let empty = null;
  if (upcoming.loading) empty = 'Loading…';
  else if (upcoming.error) empty = 'Win-probability service is unreachable right now.';
  else if (!bars.length) empty = upcoming.data?.reason || 'No home games in the next two weeks.';

  return (
    <section aria-labelledby="trend-h" className="card card--narrow">
      <div className="stack-4">
        <h2 id="trend-h" className="section-title">Upcoming home games</h2>
        <span className="muted small">Next 14 days · Kalshi win probability · outline = no market yet</span>
      </div>
      {empty ? (
        <p className="muted chart-empty">{empty}</p>
      ) : (
        <>
          <div
            role="img"
            aria-label={'Win probability for upcoming home games: ' + bars.map((b) => `${b.label} vs ${b.opp} ${b.p == null ? 'not available' : b.p + ' percent'}`).join('; ')}
            className="bars"
            style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
          >
            {bars.map((b) => (
              <div className="bars__col" key={b.key} title={`vs ${b.opp}`}>
                <span className="bars__pct">{b.p == null ? '—' : `${b.p}%`}</span>
                <div className={`bars__bar ${b.p == null ? 'bars__bar--na' : ''}`} style={{ height: `${b.p == null ? 24 : Math.round(b.p * 1.6)}px` }} />
              </div>
            ))}
          </div>
          <div className="bars__labels" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
            {bars.map((b) => <span key={b.key}>{b.label}</span>)}
          </div>
        </>
      )}
    </section>
  );
}
