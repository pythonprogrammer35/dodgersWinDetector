import { useRef, useState } from 'react';
import Logo from '../components/Logo.jsx';
import { formatPhone, isValidEmail, normalizePhone, sendCode, verifyCode } from '../auth.js';

const LockIcon = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const MailIcon = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 6 12 13 2 6" />
    <rect x="2" y="4" width="20" height="16" rx="2" />
  </svg>
);

export default function Login({ onSignedIn }) {
  const [step, setStep] = useState('phone');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [human, setHuman] = useState(false);
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const digitRefs = useRef([]);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function submitPhone(e) {
    e.preventDefault();
    const d = normalizePhone(phone);
    if (!name.trim()) return setError('Enter your name.');
    if (!isValidEmail(email)) return setError('Enter a valid email address.');
    if (!d) return setError('Enter a 10-digit US mobile number.');
    if (!human) return setError('Please confirm you’re not a robot.');
    run(async () => {
      await sendCode(d);
      setDigits(['', '', '', '', '', '']);
      setNotice('');
      setStep('code');
      setTimeout(() => digitRefs.current[0]?.focus(), 0);
    });
  }

  function submitCode(e) {
    e.preventDefault();
    run(async () => {
      const session = await verifyCode('+1' + normalizePhone(phone), digits.join(''), name.trim(), email.trim());
      onSignedIn(session);
    });
  }

  function setDigit(i, value) {
    const chars = value.replace(/\D/g, '');
    if (!chars) {
      setDigits((ds) => ds.map((d, j) => (j === i ? '' : d)));
      return;
    }
    // Typing one digit or pasting the whole code both land here.
    setDigits((ds) => {
      const next = [...ds];
      for (let k = 0; k < chars.length && i + k < 6; k++) next[i + k] = chars[k];
      return next;
    });
    digitRefs.current[Math.min(i + chars.length, 5)]?.focus();
  }

  function onDigitKey(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) digitRefs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) digitRefs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) digitRefs.current[i + 1]?.focus();
  }

  return (
    <div className="login">
      <section className="login__hero">
        <Logo size="lg" />
        <div className="login__pitch">
          <h1 className="display login__headline">
            Home win.
            <br />
            Cheap lunch.
          </h1>
          <p className="login__lede">
            When the Dodgers win at home, we text and email you the Panda Express discount code — no need to watch the game.
          </p>
        </div>
        <ul className="login__points">
          <li><LockIcon /> Your phone number is encrypted at rest</li>
          <li><MailIcon /> One alert per qualifying win, unsubscribe anytime</li>
        </ul>
      </section>

      <main className="login__main">
        <div className="login__panel">
          {step === 'phone' ? (
            <form className="stack-28" onSubmit={submitPhone} noValidate>
              <div className="stack-8">
                <span className="eyebrow">Step 1 of 2</span>
                <h2 className="display login__title">Sign in</h2>
                <p className="muted">We'll text a 6-digit code to verify it's you.</p>
              </div>

              <div className="stack-8">
                <label htmlFor="name" className="field-label">Name</label>
                <input
                  id="name"
                  className="input"
                  type="text"
                  autoComplete="name"
                  maxLength={60}
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={!!error && !name.trim()}
                  aria-describedby={error ? 'login-error' : undefined}
                />
              </div>

              <div className="stack-8">
                <label htmlFor="email" className="field-label">Email</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  maxLength={254}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!error && !isValidEmail(email)}
                  aria-describedby={error ? 'login-error' : undefined}
                />
              </div>

              <div className="stack-8">
                <label htmlFor="phone" className="field-label">Mobile number</label>
                <div className="phone-row">
                  <span className="input-prefix">+1</span>
                  <input
                    id="phone"
                    className="input"
                    type="tel"
                    autoComplete="tel-national"
                    inputMode="tel"
                    placeholder="(555) 555-0123"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    aria-invalid={!!error && !normalizePhone(phone)}
                    aria-describedby={error ? 'login-error' : undefined}
                  />
                </div>
              </div>

              {/* Placeholder until a real CAPTCHA widget (see project doc) is wired in. */}
              <div className="captcha">
                <input id="human" type="checkbox" checked={human} onChange={(e) => setHuman(e.target.checked)} />
                <label htmlFor="human">I'm not a robot</label>
                <span className="captcha__tag">CAPTCHA</span>
              </div>

              {error && <p id="login-error" className="form-error" role="alert">{error}</p>}

              <button type="submit" className="btn btn--primary" disabled={busy}>
                {busy ? 'Sending…' : 'Send code'}
              </button>

              <p className="muted center">New here? Enter your number above — we'll create your account when you verify.</p>
            </form>
          ) : (
            <form className="stack-28" onSubmit={submitCode} noValidate>
              <div className="stack-8">
                <span className="eyebrow">Step 2 of 2</span>
                <h2 className="display login__title">Enter your code</h2>
                <p className="muted">Sent to +1 {formatPhone(phone)}</p>
              </div>

              <fieldset className="otp">
                <legend className="field-label">Verification code</legend>
                <div className="otp__grid">
                  {digits.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => (digitRefs.current[i] = el)}
                      className="input otp__digit"
                      type="text"
                      inputMode="numeric"
                      autoComplete={i === 0 ? 'one-time-code' : 'off'}
                      maxLength={i === 0 ? 6 : 1}
                      aria-label={`Digit ${i + 1}`}
                      value={d}
                      onChange={(e) => setDigit(i, e.target.value)}
                      onKeyDown={(e) => onDigitKey(i, e)}
                      onFocus={(e) => e.target.select()}
                    />
                  ))}
                </div>
              </fieldset>

              {error && <p className="form-error" role="alert">{error}</p>}
              {notice && <p className="form-notice" role="status">{notice}</p>}

              <button type="submit" className="btn btn--primary" disabled={busy}>
                {busy ? 'Verifying…' : 'Verify & sign in'}
              </button>

              <div className="login__links">
                <button type="button" className="btn-link" onClick={() => { setError(''); setStep('phone'); }}>
                  ← Change number
                </button>
                <button
                  type="button"
                  className="btn-link"
                  disabled={busy}
                  onClick={() => run(async () => { await sendCode(normalizePhone(phone)); setNotice('A new code is on its way.'); })}
                >
                  Resend code
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
