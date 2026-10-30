'use client';

import { useEffect, useState } from 'react';

type Info = { code: string; groupName: string };

// Enlace y QR para invitar a un colega a la pandilla, con el código ya puesto
export default function InvitePanel({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    fetch('/api/invite', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setInfo(j)))
      .catch(() => setError('No se pudo cargar la invitación.'));
  }, []);

  const link = info ? `${window.location.origin}/login?codigo=${encodeURIComponent(info.code)}` : '';
  const text = info ? `Únete a nuestra quiniela «${info.groupName}»:` : '';

  useEffect(() => {
    if (!link) return;
    // La librería del QR se carga solo al abrir este panel
    import('qrcode')
      .then((m) => m.toDataURL(link, { width: 480, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b2616', light: '#ffffff' } }))
      .then(setQr)
      .catch(() => setQr(null));
  }, [link]);

  async function share() {
    try {
      await navigator.share({ title: 'Quiniela', text, url: link });
    } catch {
      // se canceló el menú de compartir
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const t = document.createElement('textarea');
      t.value = link;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="pinpanel invite">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="sh" style={{ margin: 0 }}>
          Invitar colegas
        </h2>
        <button type="button" className="link" onClick={onClose}>
          Cerrar
        </button>
      </div>
      {error && <p className="notice">{error}</p>}
      {!error && !info && <p className="muted">Cargando…</p>}
      {info && (
        <>
          <p className="muted">
            Quien abra el enlace o escanee el QR entra directo a <b>{info.groupName}</b>, solo tiene que elegir nombre y PIN.
          </p>
          <div className="invite-qr">{qr ? <img src={qr} alt={`QR para unirse a ${info.groupName}`} width={200} height={200} /> : <span className="muted">Preparando QR…</span>}</div>
          <div className="invite-actions">
            {canShare ? (
              <button type="button" className="primary" onClick={share}>
                Compartir
              </button>
            ) : (
              <a className="primary invite-wa" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`} target="_blank" rel="noreferrer">
                Enviar por WhatsApp
              </a>
            )}
            <button type="button" className="seg-btn" onClick={copy}>
              {copied ? 'Enlace copiado' : 'Copiar enlace'}
            </button>
          </div>
          <p className="hint">
            El enlace lleva el código de la pandilla: <code>{info.code}</code>. Compártelo solo con quien quieras dentro.
          </p>
        </>
      )}
    </section>
  );
}
