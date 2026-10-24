'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Saved = { pid: string; name: string; group: string };

// `embedded`: dentro del menú de usuario, para añadir otra liga sin salir de la actual.
export default function LoginForm({ embedded = false, onDone }: { embedded?: boolean; onDone?: () => void } = {}) {
  const router = useRouter();
  const [saved, setSaved] = useState<Saved[]>([]);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // En la pantalla de entrada, ofrecer volver a las ligas guardadas en este dispositivo
  useEffect(() => {
    if (embedded) return;
    fetch('/api/accounts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setSaved(j.accounts ?? []))
      .catch(() => {});
  }, [embedded]);

  async function enterSaved(pid: string) {
    setBusy(true);
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'switch', pid }),
    }).catch(() => null);
    if (res?.ok) {
      router.replace('/');
      router.refresh();
    } else {
      setBusy(false);
      setError('No se pudo entrar. Usa tu código, nombre y PIN.');
    }
  }

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
    if (onDone) {
      onDone();
      return;
    }
    router.replace('/');
    router.refresh();
  }

  const registering = mode === 'register';

  const form = (
      <form className={embedded ? 'login-form embedded' : 'login-form'} onSubmit={submit}>
        {embedded ? (
          <h3 className="sh small">Añadir otra liga</h3>
        ) : (
          <h1 className="login-title">Quiniela</h1>
        )}
        <p className="muted">
          {registering
            ? 'Únete a una pandilla o crea una con un código nuevo.'
            : embedded
              ? 'Entra con el código, tu nombre y tu PIN.'
              : 'Entra con el código de tu pandilla, tu nombre y tu PIN.'}
        </p>

        {!embedded && saved.length > 0 && (
          <div className="saved-leagues">
            <span className="muted">Tus ligas guardadas</span>
            {saved.map((a) => (
              <button key={a.pid} type="button" className="saved-league" disabled={busy} onClick={() => enterSaved(a.pid)}>
                <b>{a.group}</b>
                <small>{a.name}</small>
              </button>
            ))}
          </div>
        )}

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
  );

  return embedded ? <section className="pinpanel loginpanel">{form}</section> : <main className="login">{form}</main>;
}
