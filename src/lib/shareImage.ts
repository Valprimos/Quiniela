// Imagen PNG de la clasificación, dibujada en un <canvas> con el estilo oscuro de la web (estadio de noche).
// Solo se ejecuta en el navegador. No necesita dependencias: usa las mismas fuentes que la página.
import { hueOf, initialsOf } from '@/components/Avatar';

export type ShareRow = {
  id: string;
  name: string;
  avatar: number | null; // versión de la foto (null = sin foto: se dibujan las iniciales)
  points: number;
  pos: number;
  delta: number | null; // ▲/▼ respecto a la jornada anterior; null = no se muestra
  live: number; // puntos provisionales de partidos en juego (0 = nada)
  crown: boolean; // ganador de la jornada
};

export type ShareOpts = {
  title: string;
  subtitle: string;
  badge?: string; // p. ej. "En directo · si acaban así"
  logos: string[]; // rutas de /public (mismo origen)
  rows: ShareRow[];
  dateLabel: string;
};

const W = 1080;
const PAD = 56;
const COLORS = {
  bgTop: '#0f2229',
  bgBottom: '#0a1317',
  panel: '#13252b',
  line: '#2b4851',
  text: '#e9f0ec',
  muted: '#93aaa8',
  foco: '#ffd23f',
  ok: '#45d89c',
  ko: '#ff6b6b',
};
// Oro, plata y bronce para el podio (los empatados comparten color); el resto, un tono neutro.
const medalOf = (pos: number) => (pos === 1 ? '#ffd23f' : pos === 2 ? '#d3dae2' : pos === 3 ? '#d98f4e' : '#6f9bb0');

type Ctx = CanvasRenderingContext2D;

function fontStack(cssVar: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => resolve(null), 5000);
    img.onload = () => {
      clearTimeout(t);
      resolve(img.naturalWidth > 0 ? img : null);
    };
    img.onerror = () => {
      clearTimeout(t);
      resolve(null);
    };
    img.src = src;
  });
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fit(ctx: Ctx, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  const chars = Array.from(text); // por puntos de código: no parte un emoji por la mitad
  while (chars.length > 1 && ctx.measureText(chars.join('') + '…').width > maxW) chars.pop();
  return chars.join('').trimEnd() + '…';
}

function drawBackground(ctx: Ctx, H: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, COLORS.bgTop);
  g.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Césped a rayas, muy tenue
  ctx.fillStyle = 'rgba(255,255,255,0.018)';
  for (let x = 0; x < W; x += 140) ctx.fillRect(x, 0, 70, H);
  // Focos del estadio asomando arriba
  for (const cx of [120, W - 120]) {
    const r = ctx.createRadialGradient(cx, -20, 0, cx, -20, 560);
    r.addColorStop(0, 'rgba(255,210,63,0.16)');
    r.addColorStop(1, 'rgba(255,210,63,0)');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, 620);
  }
  // Arco del círculo central, como una línea de cal
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(W / 2, -150, 470, 0, Math.PI);
  ctx.stroke();
}

function drawAvatar(ctx: Ctx, img: HTMLImageElement | null, row: ShareRow, cx: number, cy: number, d: number, ring: string, body: string) {
  const r = d / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    // recorte centrado ("cover")
    const s = Math.max(d / img.naturalWidth, d / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  } else {
    const h = hueOf(row.name);
    ctx.fillStyle = `hsl(${h} 38% 26%)`;
    ctx.fillRect(cx - r, cy - r, d, d);
    ctx.fillStyle = `hsl(${h} 75% 82%)`;
    ctx.font = `700 ${Math.round(d * 0.42)}px ${body}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initialsOf(row.name), cx, cy + 2);
  }
  ctx.restore();
  ctx.strokeStyle = ring;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
  ctx.stroke();
}

export async function renderRankingImage(o: ShareOpts): Promise<Blob> {
  const display = fontStack('--font-display', '"Arial Narrow", "Helvetica Neue", sans-serif');
  const body = fontStack('--font-body', 'system-ui, -apple-system, "Segoe UI", sans-serif');
  try {
    await Promise.all([
      document.fonts.load(`700 60px ${display}`),
      document.fonts.load(`600 40px ${display}`),
      document.fonts.load(`700 40px ${body}`),
    ]);
  } catch {
    /* si no cargan, se usa la tipografía de reserva */
  }
  const [logos, avatars] = await Promise.all([
    Promise.all(o.logos.map(loadImg)),
    Promise.all(o.rows.map((r) => (r.avatar ? loadImg(`/api/avatar/${r.id}?v=${r.avatar}`) : Promise.resolve(null)))),
  ]);

  const n = o.rows.length;
  const rowH = n <= 12 ? 112 : n <= 18 ? 96 : 84;
  const gap = 14;
  const headerH = o.badge ? 330 : 276;
  const footerH = 120;
  const H = headerH + n * (rowH + gap) + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas no disponible');

  drawBackground(ctx, H);

  // --- Cabecera ---
  const logoH = 104;
  let x = PAD;
  const drawn = logos.filter((l): l is HTMLImageElement => !!l);
  for (const l of drawn) {
    const w = (l.naturalWidth * logoH) / l.naturalHeight;
    ctx.drawImage(l, x, 52, w, logoH);
    x += w + 22;
  }
  const textX = drawn.length ? x + 10 : PAD;
  const textW = W - PAD - textX;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.text;
  let size = 84;
  const title = o.title.toUpperCase();
  while (size > 44) {
    ctx.font = `700 ${size}px ${display}`;
    if (ctx.measureText(title).width <= textW) break;
    size -= 2;
  }
  ctx.fillText(title, textX, 112);
  ctx.fillStyle = COLORS.foco;
  const subtitle = o.subtitle.toUpperCase();
  let subSize = 54;
  while (subSize > 34) {
    ctx.font = `600 ${subSize}px ${display}`;
    if (ctx.measureText(subtitle).width <= textW) break;
    subSize -= 2;
  }
  ctx.fillText(fit(ctx, subtitle, textW), textX, 180);
  if (o.badge) {
    ctx.font = `600 30px ${display}`;
    const label = o.badge.toUpperCase();
    const bw = ctx.measureText(label).width + 84;
    rr(ctx, PAD, 214, bw, 54, 27);
    ctx.fillStyle = 'rgba(255,107,107,0.16)';
    ctx.fill();
    ctx.strokeStyle = COLORS.ko;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = COLORS.ko;
    ctx.beginPath();
    ctx.arc(PAD + 30, 241, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.fillText(label, PAD + 54, 243);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, headerH - 30);
  ctx.lineTo(W - PAD, headerH - 30);
  ctx.stroke();

  // --- Filas ---
  const top = Math.max(1, ...o.rows.map((r) => r.points));
  const k = rowH / 112;
  const cardW = W - PAD * 2;
  o.rows.forEach((r, i) => {
    const y = headerH + i * (rowH + gap);
    const medal = medalOf(r.pos);
    const cy = y + rowH / 2;

    ctx.save();
    rr(ctx, PAD, y, cardW, rowH, 22);
    ctx.fillStyle = COLORS.panel;
    ctx.fill();
    ctx.clip();
    // barra proporcional a los puntos, en el color de la medalla
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = medal;
    ctx.fillRect(PAD, y, (r.points / top) * cardW, rowH);
    ctx.globalAlpha = 1;
    if (r.pos <= 3) {
      ctx.fillStyle = medal;
      ctx.fillRect(PAD, y, 8, rowH);
    }
    ctx.restore();
    rr(ctx, PAD, y, cardW, rowH, 22);
    ctx.strokeStyle = r.pos <= 3 ? medal : COLORS.line;
    ctx.globalAlpha = r.pos <= 3 ? 0.55 : 1;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // posición
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = medal;
    ctx.font = `700 ${Math.round(62 * k)}px ${display}`;
    ctx.fillText(String(r.pos), PAD + 62, cy + 3);

    // foto
    const d = rowH - 26;
    const ax = PAD + 118 + d / 2;
    drawAvatar(ctx, avatars[i], r, ax, cy, d, medal, body);

    // puntos (derecha)
    ctx.textAlign = 'right';
    ctx.font = `700 ${Math.round(64 * k)}px ${display}`;
    ctx.fillStyle = medal;
    const ptsRight = W - PAD - 32;
    ctx.fillText(String(r.points), ptsRight, cy + 3);
    let tagRight = ptsRight - ctx.measureText(String(r.points)).width - 22;

    // ▲▼ y puntos en juego
    ctx.font = `700 ${Math.round(30 * k)}px ${body}`;
    if (r.live > 0) {
      const t = `+${r.live}`;
      ctx.fillStyle = COLORS.foco;
      ctx.fillText(t, tagRight, cy + 2);
      tagRight -= ctx.measureText(t).width + 20;
    }
    if (r.delta) {
      const t = r.delta > 0 ? `▲${r.delta}` : `▼${-r.delta}`;
      ctx.fillStyle = r.delta > 0 ? COLORS.ok : COLORS.ko;
      ctx.fillText(t, tagRight, cy + 2);
      tagRight -= ctx.measureText(t).width + 20;
    }

    // nombre
    const nameX = ax + d / 2 + 26;
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 ${Math.round(40 * k)}px ${body}`;
    const crownW = r.crown ? Math.round(56 * k) : 0; // hueco para el 🏆, que va aparte para que nunca recorte el nombre
    const shown = fit(ctx, r.name, tagRight - nameX - crownW);
    ctx.fillText(shown, nameX, cy + 2);
    if (r.crown) {
      const nw = ctx.measureText(shown).width;
      ctx.font = `${Math.round(38 * k)}px ${body}`;
      ctx.fillText('🏆', nameX + nw + Math.round(12 * k), cy + 2);
    }
  });

  // --- Pie ---
  const fy = H - footerH / 2 + 8;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.muted;
  ctx.font = `600 34px ${display}`;
  ctx.fillText(`${o.dateLabel.toUpperCase()}  ·  QUINIELA`, W / 2, fy);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no se pudo crear la imagen'))), 'image/png');
  });
}
