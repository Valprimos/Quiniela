'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';

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
  onProfile: () => void;
  onNotify: () => void;
  onPin: () => void;
  onAdmin: () => void;
  onAddLeague: () => void;
  onLeave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<Saved[] | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch('/api/accounts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setAccounts(j.accounts ?? []))
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load, refreshKey]);

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
        <Avatar id={me.id} name={me.name} v={me.avatar} size={30} />
        <span className="usermenu-name">{me.name}</span>
        <span aria-hidden="true" className="usermenu-caret">
          ▾
        </span>
      </button>

      {open && (
        <div className="usermenu-pop" role="menu">
          <div className="um-me">
            <Avatar id={me.id} name={me.name} v={me.avatar} size={46} />
            <div>
              <b>{me.name}</b>
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
                  <Avatar id={a.pid} name={a.name} v={a.avatar} size={26} />
                  <span className="um-txt">
                    <b>{a.group}</b>
                    <small>{a.name}</small>
                  </span>
                  {a.current && <i aria-label="Liga actual">✓</i>}
                </button>
              </li>
            ))}
            {accounts === null && <li className="um-loading">Cargando…</li>}
          </ul>
          <button type="button" role="menuitem" className="um-item" onClick={pick(onAddLeague)}>
            + Añadir otra liga
          </button>

          <hr />
          <button type="button" role="menuitem" className="um-item" onClick={pick(onProfile)}>
            Editar perfil <small>foto y nombre</small>
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
