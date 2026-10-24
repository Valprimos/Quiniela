'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';

type Me = { id: string; name: string; avatar: number | null };

// Más resolución que la que se ve en pantalla, para que la foto grande del perfil no salga borrosa
const SIZES = [384, 288, 224, 160];

// Recorta al centro en cuadrado y reduce la foto hasta que pese poco (JPEG)
async function toSquareJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    for (const size of SIZES) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      for (const q of [0.85, 0.7, 0.55]) {
        const data = canvas.toDataURL('image/jpeg', q);
        if (data.length < 80_000) return data;
      }
    }
    throw new Error('La foto es demasiado pesada. Prueba con otra.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Foto de perfil y nombre
export default function ProfilePanel({ me, onClose, onSaved }: { me: Me; onClose: () => void; onSaved: () => void }) {
  const [leagues, setLeagues] = useState(1);
  useEffect(() => {
    fetch('/api/accounts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setLeagues((j.accounts ?? []).length || 1))
      .catch(() => {});
  }, []);
  const [name, setName] = useState(me.name);
  const [photo, setPhoto] = useState<string | null>(null); // foto nueva elegida, aún sin guardar
  const [applyAll, setApplyAll] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: json?.error ?? 'No se pudo guardar. Inténtalo otra vez.' });
      return false;
    }
    onSaved();
    return true;
  }

  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setMsg(null);
    try {
      setPhoto(await toSquareJpeg(f));
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'No se pudo leer la imagen.' });
    }
  }

  async function savePhoto() {
    if (!photo) return;
    if (await post({ avatar: photo, applyAll })) {
      setPhoto(null);
      setMsg({ ok: true, text: 'Foto guardada.' });
    }
  }

  async function removePhoto() {
    if (await post({ avatar: null, applyAll })) {
      setPhoto(null);
      setMsg({ ok: true, text: 'Foto quitada.' });
    }
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (await post({ name })) setMsg({ ok: true, text: 'Nombre guardado.' });
  }

  return (
    <section className="pinpanel profilepanel" aria-label="Editar perfil">
      <h3 className="sh small">Tu perfil</h3>

      <div className="pp-photo">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="avatar" src={photo} alt="Foto nueva" width={110} height={110} style={{ width: 110, height: 110 }} />
        ) : (
          <Avatar id={me.id} name={me.name} v={me.avatar} size={110} />
        )}
        <div className="pp-photo-actions">
          <input ref={file} type="file" accept="image/*" hidden onChange={choose} />
          <button type="button" className="seg-btn" disabled={busy} onClick={() => file.current?.click()}>
            {me.avatar || photo ? 'Cambiar foto' : 'Elegir foto'}
          </button>
          {photo && (
            <button type="button" className="primary" disabled={busy} onClick={savePhoto}>
              Guardar foto
            </button>
          )}
          {!photo && me.avatar && (
            <button type="button" className="link danger" disabled={busy} onClick={removePhoto}>
              Quitar foto
            </button>
          )}
        </div>
      </div>
      {leagues > 1 && (
        <label className="pp-all">
          <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
          Usar esta foto en todas mis ligas guardadas
        </label>
      )}

      <form onSubmit={saveName} className="pp-name">
        <div className="field">
          <label htmlFor="pp-name">Tu nombre</label>
          <input
            id="pp-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="off"
            required
          />
        </div>
        <button type="submit" className="seg-btn" disabled={busy || name.trim() === me.name}>
          Guardar nombre
        </button>
      </form>
      <p className="hint">El nombre cambia solo en esta liga y lo ven los demás jugadores.</p>

      {msg && (
        <p className={msg.ok ? 'okmsg' : 'notice'} role="status">
          {msg.text}
        </p>
      )}
      <div className="row">
        <button className="link" type="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </section>
  );
}
