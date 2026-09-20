'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, name, pin, inviteCode }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? 'Algo salió mal. Inténtalo otra vez.');
      setBusy(false);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  const registering = mode === 'register';

  return (
    <main className="login">
      <form className="login-form" onSubmit={submit}>
        <h1 className="login-title">Quiniela</h1>
        <p className="muted">
          {registering
            ? 'Elige un nombre y un PIN para jugar.'
            : 'Entra con tu nombre y tu PIN.'}
        </p>

        <div className="field">
          <label htmlFor="name">Nombre</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="username"
            maxLength={20}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="pin">PIN (4 a 6 números)</label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            pattern="\d{4,6}"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            autoComplete={registering ? 'new-password' : 'current-password'}
            maxLength={6}
            required
          />
        </div>

        {registering && (
          <div className="field">
            <label htmlFor="invite">Código de invitación</label>
            <input
              id="invite"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}

        {error && <p className="notice" role="alert">{error}</p>}

        <button className="primary" type="submit" disabled={busy}>
          {registering ? 'Crear jugador' : 'Entrar'}
        </button>
        <button
          className="link"
          type="button"
          onClick={() => {
            setMode(registering ? 'login' : 'register');
            setError(null);
          }}
        >
          {registering ? 'Ya tengo jugador' : 'Soy nuevo'}
        </button>
      </form>
    </main>
  );
}
