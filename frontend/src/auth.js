// Sign-in by SMS one-time code.
//
// DEV STUB: there is no auth backend yet. sendCode() pretends to text a code and
// verifyCode() accepts any 6 digits. Replace these two functions with the real
// calls (e.g. Cognito custom auth / API Gateway) — the UI only depends on their
// signatures and on them throwing an Error with a user-facing message.

const SESSION_KEY = 'dodgerwin.session';

export function normalizePhone(input) {
  const digits = input.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return digits.length === 10 ? digits : null;
}

export function formatPhone(digits) {
  const d = digits.replace(/\D/g, '').slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function isValidEmail(input) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

export async function sendCode(phoneDigits) {
  if (!normalizePhone(phoneDigits)) throw new Error('Enter a 10-digit US mobile number.');
  await new Promise((r) => setTimeout(r, 400));
  return { phone: '+1' + phoneDigits };
}

export async function verifyCode(phone, code, name, email) {
  if (!/^\d{6}$/.test(code)) throw new Error('Enter all 6 digits of the code.');
  await new Promise((r) => setTimeout(r, 400));
  const session = { name, email: email?.trim().toLowerCase(), phone, signedInAt: new Date().toISOString() };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable: session lasts for this page load only */
  }
  return session;
}

export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

export function signOut() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
