import { useEffect, useState } from 'react';
import Login from './pages/Login.jsx';
import Stats from './pages/Stats.jsx';
import { getSession, signOut } from './auth.js';

// Hash routing keeps the build a plain static site (S3 + CloudFront, no rewrites).
function currentRoute() {
  return window.location.hash.replace(/^#\/?/, '') || 'stats';
}

export function navigate(route) {
  window.location.hash = '/' + route;
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);
  const [session, setSession] = useState(getSession);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!session || route === 'login') {
    return (
      <Login
        onSignedIn={(s) => {
          setSession(s);
          navigate('stats');
        }}
      />
    );
  }

  return (
    <Stats
      session={session}
      onSignOut={() => {
        signOut();
        setSession(null);
        navigate('login');
      }}
    />
  );
}
