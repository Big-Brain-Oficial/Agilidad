// Geometría del plano ilustrado de la "Ciudad MARQ" (viewBox 3000 x 2500, norte arriba).
// Es estilizado, no georreferenciado: centro de Resistencia al sur y loteos al norte,
// sobre Av. Sarmiento y la Ruta Nacional 11.

export const MAP_W = 3000;
export const MAP_H = 2500;

const GRID = { ox: 240, oy: 1440, pitch: 200, block: 152, cols: 10, rows: 5 };
const STREET = GRID.pitch - GRID.block;

type Rect = { x: number; y: number; w: number; h: number };
type Pt = [number, number];

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const block = (c: number, r: number): Rect => ({ x: GRID.ox + c * GRID.pitch, y: GRID.oy + r * GRID.pitch, w: GRID.block, h: GRID.block });

// Polilínea suavizada (Catmull-Rom → Bézier) como atributo `d` de SVG.
export function smoothPath(pts: Pt[], closed = false): string {
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${p[1][0].toFixed(1)} ${p[1][1].toFixed(1)}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return closed ? d + 'Z' : d;
}

function lagoon(cx: number, cy: number, rx: number, ry: number, rnd: () => number, n = 28): Pt[] {
  const a1 = rnd() * 6.28, a2 = rnd() * 6.28;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const k = 1 + 0.05 * Math.sin(2 * t + a1) + 0.035 * Math.sin(3 * t + a2);
    pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
  }
  return pts;
}

function lotGrid(x0: number, x1: number, y0: number, y1: number, lotW: number): Rect[] {
  const out: Rect[] = [];
  const mid = (y0 + y1) / 2;
  for (let x = x0; x + lotW <= x1 + 0.5; x += lotW) {
    out.push({ x, y: y0, w: lotW, h: mid - y0 }, { x, y: mid, w: lotW, h: y1 - mid });
  }
  return out;
}

export interface MapGeometry {
  patches: { cx: number; cy: number; rx: number; ry: number; rot: number }[];
  zones: (Rect & { name: string })[];
  city: Rect;
  blocks: (Rect & { kind: 'block' | 'plaza' | 'marq' | 'futuro' })[];
  footprints: Rect[];
  roads: { d: string; kind: 'ruta' | 'avenida' | 'boulevard' | 'ripio' | 'senda' }[];
  water: { d: string; kind: 'laguna' | 'rio' | 'arroyo'; width?: number }[];
  lots: Rect[];
  trees: { x: number; y: number; r: number }[];
  labels: { x: number; y: number; text: string; size: number; rotate?: number; kind: 'road' | 'place' | 'water' | 'district' }[];
}

export function buildMapGeometry(): MapGeometry {
  const rnd = rng(20261008);
  const g: MapGeometry = { patches: [], zones: [], city: { x: 0, y: 0, w: 0, h: 0 }, blocks: [], footprints: [], roads: [], water: [], lots: [], trees: [], labels: [] };

  for (let i = 0; i < 22; i++) {
    g.patches.push({ cx: rnd() * MAP_W, cy: rnd() * 1300, rx: 140 + rnd() * 260, ry: 90 + rnd() * 150, rot: rnd() * 180 });
  }

  // ---- Centro de Resistencia ----------------------------------------------------------
  g.city = { x: GRID.ox - STREET, y: GRID.oy - STREET, w: GRID.cols * GRID.pitch + STREET, h: GRID.rows * GRID.pitch + STREET };
  const special: Partial<Record<string, 'plaza' | 'marq' | 'futuro'>> = { '4,2': 'plaza', '5,1': 'marq', '7,3': 'marq', '2,3': 'marq', '1,1': 'marq', '8,1': 'futuro', '4,4': 'futuro' };
  for (let c = 0; c < GRID.cols; c++) {
    for (let r = 0; r < GRID.rows; r++) {
      const b = block(c, r);
      const kind = special[`${c},${r}`] ?? 'block';
      g.blocks.push({ ...b, kind });
      if (kind !== 'block') continue;
      // Edificación perimetral con corazón de manzana libre.
      const inset = 8, s = b.w - inset * 2;
      for (let x = b.x + inset; x < b.x + inset + s - 12; ) {
        const w = Math.min(18 + rnd() * 26, b.x + inset + s - x);
        g.footprints.push({ x, y: b.y + inset, w: w - 3, h: 26 + rnd() * 16 }, { x, y: b.y + b.h - inset - 30 - rnd() * 12, w: w - 3, h: 30 });
        x += w;
      }
    }
  }

  // ---- Rutas y avenidas ------------------------------------------------------------------
  g.roads.push(
    { d: `M1616 ${GRID.oy - STREET} L1616 -40`, kind: 'ruta' },
    { d: `M616 ${GRID.oy - STREET} L616 360 L1616 360`, kind: 'avenida' },
    { d: 'M1616 700 L1860 700', kind: 'avenida' },
    { d: 'M1860 700 L2780 700', kind: 'boulevard' },
    { d: `M2240 1900 L2460 1900`, kind: 'avenida' }
  );

  // ---- Loteos ---------------------------------------------------------------------------------
  g.zones.push(
    { x: 180, y: 410, w: 860, h: 840, name: 'Gran Arboledas' },
    { x: 1070, y: 100, w: 500, h: 1010, name: 'Brisas del Norte' },
    { x: 1700, y: 80, w: 1290, h: 1150, name: 'Pueblo Mío' }
  );
  // Gran Arboledas: grilla de calles de ripio y reserva al oeste.
  for (const y of [560, 760, 960, 1160]) g.roads.push({ d: `M420 ${y} L1000 ${y}`, kind: 'ripio' });
  g.roads.push({ d: 'M420 520 L420 1200 M1000 520 L1000 1200', kind: 'ripio' });
  g.roads.push({ d: smoothPath([[420, 560], [350, 620], [300, 720], [352, 830], [282, 950], [330, 1060], [300, 1170], [420, 1230]]), kind: 'senda' });
  for (const [y0, y1] of [[574, 746], [774, 946], [974, 1146]]) g.lots.push(...lotGrid(434, 596, y0, y1, 27), ...lotGrid(636, 986, y0, y1, 27));
  // Brisas del Norte: anillo alrededor de la laguna.
  g.roads.push({ d: 'M1160 360 L1160 1040 L1480 1040 L1480 360', kind: 'ripio' });
  for (let y = 380; y + 40 <= 1020; y += 40) g.lots.push({ x: 1090, y, w: 56, h: 40 }, { x: 1494, y, w: 56, h: 40 });
  for (let x = 1160; x + 40 <= 1480; x += 40) g.lots.push({ x, y: 1056, w: 40, h: 44 });
  g.water.push({ d: smoothPath(lagoon(1320, 640, 108, 148, rnd), true), kind: 'laguna' });
  // Pueblo Mío: laguna con arroyo, boulevard y grilla de lotes.
  g.water.push(
    { d: smoothPath([[2290, -40], [2310, 110], [2262, 210], [2300, 340]]), kind: 'arroyo', width: 30 },
    { d: smoothPath([[2620, 390], [2720, 360], [2860, 260], [3060, 230]]), kind: 'arroyo', width: 28 },
    { d: smoothPath(lagoon(2420, 430, 228, 118, rnd), true), kind: 'laguna' }
  );
  for (const x of [2100, 2300, 2500]) g.roads.push({ d: `M${x} 726 L${x} 1180`, kind: 'ripio' });
  for (const y of [950, 1180]) g.roads.push({ d: `M1900 ${y} L2700 ${y}`, kind: 'ripio' });
  for (const [x0, x1, y0, y1, w] of [
    [2180, 2380, 592, 672, 30], [2470, 2680, 592, 672, 30], [2113, 2287, 730, 936, 29], [2313, 2487, 730, 936, 29],
    [2513, 2687, 730, 936, 29], [1900, 2087, 964, 1166, 31], [2113, 2287, 964, 1166, 29], [2313, 2487, 964, 1166, 29],
  ]) g.lots.push(...lotGrid(x0, x1, y0, y1, w));

  // ---- Río Negro -------------------------------------------------------------------------------
  g.water.push({ d: smoothPath([[2760, 1240], [2600, 1480], [2690, 1720], [2500, 1960], [2600, 2220], [2480, 2560]]), kind: 'rio', width: 70 });

  // ---- Arboledas ---------------------------------------------------------------------------------
  const scatter = (r: Rect, n: number, rMin: number, rMax: number) => {
    for (let i = 0; i < n; i++) g.trees.push({ x: r.x + rnd() * r.w, y: r.y + rnd() * r.h, r: rMin + rnd() * (rMax - rMin) });
  };
  scatter({ x: 196, y: 430, w: 206, h: 800 }, 130, 9, 15);
  scatter({ x: 1076, y: 110, w: 488, h: 226 }, 90, 8, 13);
  scatter({ x: 1880, y: 100, w: 270, h: 200 }, 90, 9, 15);
  scatter({ x: 2700, y: 760, w: 280, h: 440 }, 80, 9, 15);
  scatter({ x: 2300, y: 1260, w: 200, h: 1200 }, 70, 9, 15);
  scatter({ x: 2700, y: 1300, w: 280, h: 1150 }, 60, 9, 15);
  scatter({ x: 0, y: 1400, w: 180, h: 1050 }, 30, 8, 13);
  const plaza = block(4, 2);
  for (const [dx, dy] of [[22, 22], [130, 22], [22, 130], [130, 130], [76, 18], [18, 76], [134, 76], [76, 134]]) {
    g.trees.push({ x: plaza.x + dx, y: plaza.y + dy, r: 11 });
  }

  // ---- Rótulos ------------------------------------------------------------------------------------
  g.labels.push(
    { x: 220, y: 1368, text: 'RESISTENCIA · CENTRO', size: 26, kind: 'district' },
    { x: 1650, y: 1060, text: 'RUTA NACIONAL 11', size: 18, rotate: -90, kind: 'road' },
    { x: 650, y: 1180, text: 'AV. SARMIENTO', size: 18, rotate: -90, kind: 'road' },
    { x: 860, y: 340, text: 'AV. J. M. DE ROSAS', size: 16, kind: 'road' },
    { x: 1800, y: 70, text: 'Hacia Colonia Benítez ↑', size: 18, kind: 'place' },
    { x: 1116, y: 1830, text: 'Plaza 25 de Mayo', size: 16, kind: 'place' },
    { x: 2700, y: 1620, text: 'Río Negro', size: 22, kind: 'water' }
  );

  return g;
}
