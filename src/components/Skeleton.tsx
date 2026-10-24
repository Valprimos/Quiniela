// Esqueletos: recuadros que ocupan el sitio de lo que está cargando, para que la pantalla no se vea
// vacía ni salte cuando llegan los datos.

import type { CSSProperties } from 'react';

export function Sk({ w, h = 14, r, style, className = '' }: { w?: number | string; h?: number | string; r?: number | string; style?: CSSProperties; className?: string }) {
  return <span className={`sk ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

function Wrap({ children, label = 'Cargando', className = '' }: { children: React.ReactNode; label?: string; className?: string }) {
  return (
    <div className={`sk-wrap ${className}`} role="status" aria-label={label} aria-busy="true">
      {children}
    </div>
  );
}

// Una tarjeta de partido: dos equipos a la izquierda y la quiniela 1 X 2 a la derecha
function MatchCardSk() {
  return (
    <div className="sk-match">
      <div className="sk-match-teams">
        <Sk w={70} h={12} />
        {[0, 1].map((i) => (
          <div key={i} className="sk-team">
            <Sk w={24} h={24} r="50%" />
            <Sk w={i ? 120 : 150} h={16} />
          </div>
        ))}
      </div>
      <div className="sk-slip">
        <Sk w={44} h={44} r={6} />
        <Sk w={44} h={44} r={6} />
        <Sk w={44} h={44} r={6} />
      </div>
    </div>
  );
}

export function MatchesSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Wrap>
      <Sk w="70%" h={14} style={{ marginBottom: 14 }} />
      {Array.from({ length: rows }, (_, i) => (
        <MatchCardSk key={i} />
      ))}
    </Wrap>
  );
}

export function RankingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Wrap>
      <div className="sk-row" style={{ gap: 8, marginBottom: 14 }}>
        <Sk w={110} h={36} r={999} />
        <Sk w={90} h={36} r={999} />
        <Sk w={100} h={36} r={999} />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk-rank">
          <Sk w={18} h={22} />
          <Sk w={52} h={52} r="50%" />
          <Sk w={90 + ((i * 23) % 50)} h={16} />
          <Sk w={26} h={26} style={{ marginLeft: 'auto' }} />
        </div>
      ))}
    </Wrap>
  );
}

// Pestaña Estadísticas: cuatro premios y unas barras
export function StatsSkeleton() {
  return (
    <Wrap label="Calculando estadísticas">
      <div className="sk-awards">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="sk-award">
            <Sk w={80} h={11} />
            <Sk w={60} h={28} />
            <Sk w={110} h={11} />
            <div className="sk-row" style={{ marginTop: 6 }}>
              <Sk w={30} h={30} r="50%" />
              <Sk w={70} h={14} />
            </div>
          </div>
        ))}
      </div>
      <Sk w={190} h={22} style={{ margin: '22px 0 12px' }} />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="sk-row" style={{ gap: 10, marginBottom: 10 }}>
          <Sk w={32} h={32} r="50%" />
          <Sk w={60} h={14} />
          <Sk h={18} style={{ flex: 1, maxWidth: `${85 - i * 12}%` }} />
        </div>
      ))}
    </Wrap>
  );
}

// Ventana del perfil de un jugador: los seis recuadros de datos
export function ProfileSkeleton() {
  return (
    <Wrap label="Cargando estadísticas">
      <div className="sk-tiles">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="sk-tile">
            <Sk w={50} h={10} />
            <Sk w={44} h={22} />
            <Sk w={56} h={10} />
          </div>
        ))}
      </div>
      <div className="sk-row" style={{ gap: 8, marginTop: 10 }}>
        <Sk h={40} r={8} style={{ flex: 1 }} />
        <Sk h={40} r={8} style={{ flex: 1 }} />
      </div>
    </Wrap>
  );
}

// Filas de una lista (ligas guardadas en el menú, partidos en el panel de admin...)
export function RowsSkeleton({ rows = 2, avatar = false }: { rows?: number; avatar?: boolean }) {
  return (
    <Wrap>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk-row" style={{ gap: 10, padding: '8px 4px' }}>
          {avatar && <Sk w={36} h={36} r="50%" />}
          <div style={{ display: 'grid', gap: 6, flex: 1 }}>
            <Sk w={i ? '45%' : '60%'} h={14} />
            <Sk w={i ? '30%' : '38%'} h={11} />
          </div>
        </div>
      ))}
    </Wrap>
  );
}

// Pantalla completa al abrir la app: cabecera, competiciones, jornada, pestañas y partidos
export function AppSkeleton() {
  return (
    <main className="wrap" role="status" aria-label="Cargando jornada" aria-busy="true">
      <header className="top" style={{ alignItems: 'center' }}>
        <Sk w={150} h={26} />
        <Sk w={104} h={42} r={999} style={{ marginLeft: 'auto' }} />
      </header>
      <div className="sk-row" style={{ gap: 8, marginBottom: 22 }}>
        <Sk w={118} h={40} r={999} />
        <Sk w={128} h={40} r={999} />
      </div>
      <div className="sk-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Sk w={44} h={44} r={6} />
        <Sk w={150} h={50} />
        <Sk w={44} h={44} r={6} />
      </div>
      <Sk w={180} h={13} style={{ marginBottom: 20 }} />
      <div className="sk-row" style={{ gap: 18, marginBottom: 18 }}>
        <Sk w={96} h={18} />
        <Sk w={92} h={18} />
        <Sk w={96} h={18} />
      </div>
      <MatchesSkeleton />
    </main>
  );
}
