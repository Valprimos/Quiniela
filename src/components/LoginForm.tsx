'use client';

import ThemeToggle from './ThemeToggle';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Saved = { pid: string; name: string; group: string };

// `embedded`: dentro del menú de usuario, para añadir otra liga sin salir de la actual.
export default function LoginForm({
  embedded = false,
  onDone,
  invite = null,
  inviteInvalid = false,
}: {
  embedded?: boolean;
  onDone?: () => void;
  // Viene de un enlace o QR de invitación: la pandilla ya existe y el código va puesto
  invite?: { code: string; groupName: string } | null;
  inviteInvalid?: boolean;
} = {}) {
  const router = useRouter();
  const [saved, setSaved] = useState<Saved[]>([]);
  // Dos caminos claros: "Tengo un código" (entrar o unirme a una pandilla que ya existe) y "Crear una pandilla nueva"
  const [tab, setTab] = useState<'code' | 'create'>('code');
  const [joining, setJoining] = useState(!!invite); // dentro de "Tengo un código": jugador nuevo (true) o ya existente (false)
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState(invite?.code ?? '');
  const [groupName, setGroupName] = useState(invite?.groupName ?? '');
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
      setError('No se pudo entrar. Usa el nombre y el código de tu pandilla, tu nombre y tu PIN.');
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

  const creating = tab === 'create';
  const mode: 'login' | 'join' | 'create' = creating ? 'create' : joining ? 'join' : 'login';
  const newPlayer = mode !== 'login'; // se elige un PIN nuevo

  const form = (
      <form className={embedded ? 'login-form embedded' : 'login-form'} onSubmit={submit}>
        {embedded ? (
          <h3 className="sh small">Añadir otra liga</h3>
        ) : (
          <h1 className="login-title">Quiniela</h1>
        )}
        {inviteInvalid && (
          <p className="notice">Este enlace de invitación ya no es válido. Pide uno nuevo a tu pandilla.</p>
        )}
        {invite && (
          <p className="invite-banner">
            Te han invitado a <b>{invite.groupName}</b>
          </p>
        )}
        <p className="muted">
          {invite
            ? joining
              ? 'Elige tu nombre y un PIN para unirte.'
              : 'Entra con tu nombre y tu PIN.'
            : creating
              ? 'Ponle nombre a tu pandilla e inventa un código para que tus colegas puedan unirse. Tú serás el administrador.'
              : joining
                ? 'Pide a un colega el nombre y el código de su pandilla, y elige tu nombre y un PIN.'
                : 'Entra con el nombre y el código de tu pandilla, tu nombre y tu PIN.'}
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

        {!invite && (
          <div className="seg login-tabs" role="group" aria-label="¿Qué quieres hacer?">
            <button
              type="button"
              aria-pressed={!creating}
              onClick={() => {
                setTab('code');
                setError(null);
              }}
            >
              Tengo un código
            </button>
            <button
              type="button"
              aria-pressed={creating}
              onClick={() => {
                setTab('create');
                setError(null);
              }}
            >
              Crear una pandilla nueva
            </button>
          </div>
        )}

        {!invite && (
          <>
            <div className="field">
              <label htmlFor="groupName">Nombre de la pandilla</label>
              <input
                id="groupName"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                autoComplete="off"
                maxLength={40}
                placeholder="Los del bar de Paco"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="code">{creating ? 'Código de la pandilla (invéntalo)' : 'Código de la pandilla'}</label>
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                maxLength={30}
                required
              />
              {creating && <span className="hint">Es lo que compartirás para que se unan. De 3 a 30 caracteres.</span>}
            </div>
          </>
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
            autoComplete={newPlayer ? 'new-password' : 'current-password'}
            maxLength={6}
            required
          />
        </div>

        {error && <p className="notice" role="alert">{error}</p>}

        <button className="primary" type="submit" disabled={busy}>
          {mode === 'create' ? 'Crear pandilla' : mode === 'join' ? 'Unirme a la pandilla' : 'Entrar'}
        </button>
        {!creating && (
          <button
            className="link"
            type="button"
            onClick={() => {
              setJoining((v) => !v);
              setError(null);
            }}
          >
            {joining ? 'Ya tengo jugador' : 'Soy nuevo en esta pandilla'}
          </button>
        )}
        {!embedded && <ThemeToggle />}
      </form>
  );

  return embedded ? <section className="pinpanel loginpanel">{form}</section> : <main className="login">{form}</main>;
}
