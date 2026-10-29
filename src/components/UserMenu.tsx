'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import { RowsSkeleton } from './Skeleton';
import { useTheme } from './ThemeToggle';
import { fetchJson, load, peek } from '@/lib/clientCache';

type Me = { id: string; name: string; admin: boolean; avatar: number | null; group: string };
type Saved = { pid: string; name: string; group: string; admin: boolean; current: boolean; avatar: number | null };

// Menú individual de cada persona: foto, ligas guardadas para cambiar con un toque, y sus ajustes.
export default function UserMenu({
  me,
  refreshKey,
  onProfile,
  onNotify,
  onPin,
  onAdmin,
  onAddLeague,
  onLeave,
}: {
  me: Me;
  refreshKey: number;
  onProfile: (focus?: 'photo' | 'name') => void;
  onNotify: () => void;
  onPin: () => void;
  onAdmin: () => void;
  onAddLeague: () => void;
  onLeave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  // Las ligas guardadas se piden una vez y se reutilizan (se actualizan si cambias tu perfil)
  const key = `accounts:${me.id}`;
  const [accounts, setAccounts] = useState<Saved[] | null>(() => peek<Saved[]>(key) ?? null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const loadAccounts = useCallback(() => {
    setAccounts(peek<Saved[]>(key) ?? null);
    load(key, () => fetchJson<{ accounts?: Saved[] }>('/api/accounts').then((j) => j.accounts ?? []), {
      ttl: 5 * 60_000,
      tag: refreshKey,
    })
      .then(setAccounts)
      .catch(() => setAccounts((cur) => cur ?? []));
  }, [key, refreshKey]);

  useEffect(() => {
    if (open) loadAccounts();
  }, [open, loadAccounts]);

  // Se cierra al pulsar fuera o con Escape
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent | TouchEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('touchstart', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('touchstart', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const editProfile = (focus?: 'photo' | 'name') => () => {
    setOpen(false);
    onProfile(focus);
  };

  async function switchTo(pid: string) {
    setBusy(true);
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'switch', pid }),
    }).catch(() => null);
    if (res?.ok) window.location.reload(); // empieza limpio, con los datos de la otra liga
    else setBusy(false);
  }

  return (
    <div className="usermenu" ref={box}>
      <button
        type="button"
        className="usermenu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar id={me.id} name={me.name} v={me.avatar} size={36} />
        <span className="usermenu-name">{me.name}</span>
        <span aria-hidden="true" className="usermenu-caret">
          ▾
        </span>
      </button>

      {open && (
        <div className="usermenu-pop" role="menu">
          <div className="um-me">
            <button type="button" className="um-me-photo" aria-label="Cambiar mi foto" onClick={editProfile('photo')}>
              <Avatar id={me.id} name={me.name} v={me.avatar} size={60} />
              <span aria-hidden="true" className="um-me-edit">
                ✎
              </span>
            </button>
            <div>
              <button type="button" className="um-me-name" aria-label="Cambiar mi nombre" onClick={editProfile('name')}>
                <b>{me.name}</b>
                <span aria-hidden="true">✎</span>
              </button>
              <small>{me.group}</small>
            </div>
          </div>

          <div className="um-sec">Mis ligas</div>
          <ul className="um-leagues">
            {(accounts ?? []).map((a) => (
              <li key={a.pid}>
                <button
                  type="button"
                  role="menuitem"
                  className={a.current ? 'cur' : undefined}
                  disabled={busy || a.current}
                  onClick={() => switchTo(a.pid)}
                >
                  <Avatar id={a.pid} name={a.name} v={a.avatar} size={36} />
                  <span className="um-txt">
                    <b>{a.group}</b>
                    <small>{a.name}</small>
                  </span>
                  {a.current && <i aria-label="Liga actual">✓</i>}
                </button>
              </li>
            ))}
            {accounts === null && (
              <li className="um-loading">
                <RowsSkeleton rows={2} avatar />
              </li>
            )}
          </ul>
          <button type="button" role="menuitem" className="um-item" onClick={pick(onAddLeague)}>
            + Añadir otra liga
          </button>

          <hr />
          <button type="button" role="menuitem" className="um-item" onClick={editProfile()}>
            Editar perfil
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={theme === 'light'}
            className="um-item um-theme"
            onClick={toggleTheme}
          >
            <span className="um-theme-txt">
              <b>{theme === 'light' ? 'Modo oscuro' : 'Modo claro'}</b>
              <small>{theme === 'light' ? 'Noche de estadio' : 'Día de partido'}</small>
            </span>
            <span className="um-switch" aria-hidden="true">
              <i>☀️</i>
              <i>🌙</i>
              <em />
            </span>
          </button>
          <button type="button" role="menuitem" className="um-item" onClick={pick(onNotify)}>
            Avisos
          </button>
          <button type="button" role="menuitem" className="um-item" onClick={pick(onPin)}>
            Cambiar PIN
          </button>
          {me.admin && (
            <button type="button" role="menuitem" className="um-item" onClick={pick(onAdmin)}>
              Panel de admin
            </button>
          )}
          <hr />
          <button type="button" role="menuitem" className="um-item danger" onClick={pick(onLeave)}>
            Salir de esta liga
          </button>
        </div>
      )}
    </div>
  );
}
