'use client';

import { useEffect, useState } from 'react';

// Campo de PIN con botón "Mostrar / Ocultar" para comprobar lo que se escribe (sobre todo en el móvil).
// Por privacidad vuelve a ocultarse solo a los 15 s sin escribir y al salir de la app o de la pestaña.
export default function PinInput({
  id,
  value,
  onChange,
  autoComplete,
  pattern,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  pattern?: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), 15000);
    const onVis = () => {
      if (document.hidden) setShow(false);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [show, value]); // al escribir se reinicia la cuenta atrás

  return (
    <div className="pin-wrap">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        inputMode="numeric"
        pattern={pattern}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        autoComplete={autoComplete}
        autoCapitalize="off"
        spellCheck={false}
        maxLength={6}
        required
      />
      <button type="button" className="pin-toggle" aria-label={show ? 'Ocultar PIN' : 'Mostrar PIN'} onClick={() => setShow((v) => !v)}>
        {show ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  );
}
