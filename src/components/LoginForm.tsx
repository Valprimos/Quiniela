'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, name, pin, code, groupName }),
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
            ? 'Únete a la pandilla de tus colegas, o crea una nueva con un código que te inventes.'
            : 'Entra con el código de tu pandilla, tu nombre y tu PIN.'}
        </p>

        <div className="field">
          <label htmlFor="code">Código de pandilla</label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            maxLength={30}
            required
          />
        </div>

        {registering && (
          <div className="field">
            <label htmlFor="groupName">Nombre de la pandilla (solo si es nueva)</label>
            <input
              id="groupName"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              autoComplete="off"
              maxLength={40}
              placeholder="Los del bar de Paco"
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="name">Tu nombre</label>
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

        {error && <p className="notice" role="alert">{error}</p>}

        <button className="primary" type="submit" disabled={busy}>
          {registering ? 'Entrar o crear pandilla' : 'Entrar'}
        </button>
        <button
          className="link"
          type="button"
          onClick={() => {
            setMode(registering ? 'login' : 'register');
            setError(null);
          }}
        >
          {registering ? 'Ya tengo jugador' : 'Soy nuevo o quiero crear una pandilla'}
        </button>
      </form>
    </main>
  );
}
