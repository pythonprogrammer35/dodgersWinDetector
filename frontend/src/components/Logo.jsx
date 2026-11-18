export default function Logo({ size = 'md' }) {
  return (
    <div className={`logo logo--${size}`}>
      <div className="logo__mark">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M6.5 5.5c2.5 3.5 2.5 9.5 0 13" />
          <path d="M17.5 5.5c-2.5 3.5-2.5 9.5 0 13" />
        </svg>
      </div>
      <span className="logo__text">DODGERWIN</span>
    </div>
  );
}
