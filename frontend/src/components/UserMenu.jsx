import { useEffect, useRef, useState } from 'react';
import { formatPhone } from '../auth.js';

// Username button in the top bar; opens a small account-info panel.
export default function UserMenu({ session }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const name = session.name || 'Account';
  const phone = session.phone?.startsWith('+1') ? `+1 ${formatPhone(session.phone.slice(2))}` : session.phone;
  const since = session.signedInAt
    ? new Date(session.signedInAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="nav-link user-menu__button"
        aria-expanded={open}
        aria-controls="account-panel"
        onClick={() => setOpen((o) => !o)}
      >
        {name}
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div id="account-panel" className="user-menu__panel" role="region" aria-label="Account info">
          <span className="eyebrow eyebrow--sm">Account</span>
          <dl className="user-menu__list">
            <div>
              <dt>Name</dt>
              <dd>{session.name || '—'}</dd>
            </div>
            <div>
              <dt>Mobile number</dt>
              <dd>{phone || '—'}</dd>
            </div>
            {since && (
              <div>
                <dt>Signed in</dt>
                <dd>{since}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
