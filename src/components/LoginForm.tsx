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

  const registering = mode === 'register';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, name, pin, code, groupName }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json.error || 'Ocurrió un error. Inténtalo de nuevo.');
        setBusy(false);
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.');
      setBusy(false);
    }
  }

  return (
    <main className="login-card">
      <form onSubmit={handleSubmit}>
        <h1 className="login-title">Quiniela</h1>
        <p className="muted">
          {registering
            ? 'Únete a la pandilla de tus colegas, o crea una nueva con un código que te inventes.'
            : 'Entra con el código de tu pandilla, tu nombre y tu PIN.'}
        </p>

        <div className="field">
          <label htmlFor="code">Código de la pandilla</label>
          <input
            id="code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoComplete="off"
            placeholder="Ej: mi-grupo"
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
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="username"
            placeholder="Ej: Paco"
          />
        </div>

        <div className="field">
          <label htmlFor="pin">PIN (4-6 números)</label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="****"
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
