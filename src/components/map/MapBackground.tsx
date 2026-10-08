import { memo } from 'react';
import type { MapGeometry } from './mapGeometry';

// Capa estática del plano. Se dibuja una sola vez; el pan/zoom solo cambia la transformación.

const C = {
  ground: '#EEECE6',
  patch: '#E4E7D9',
  zone: '#E5EBDC',
  zoneEdge: '#C9D1BC',
  lot: '#CFD6C2',
  street: '#FFFFFF',
  block: '#E6E3DC',
  footprint: '#D9D5CC',
  plaza: '#D5E1C5',
  casing: '#D9D5CC',
  ripio: '#E8DFCB',
  senda: '#C2AD86',
  median: '#CBD8B9',
  water: '#C3DBE3',
  waterEdge: '#A7C6D1',
  tree: '#C3D0AF',
  label: '#A39E94',
  district: '#8F8A80',
  waterLabel: '#7FA4B2',
  accent: '#A4070F',
};

const rectsPath = (rs: { x: number; y: number; w: number; h: number }[]) =>
  rs.map((r) => `M${r.x.toFixed(1)} ${r.y.toFixed(1)}h${r.w.toFixed(1)}v${r.h.toFixed(1)}h${(-r.w).toFixed(1)}Z`).join('');

export const MapBackground = memo(function MapBackground({ g }: { g: MapGeometry }) {
  const roads = (kind: string) => g.roads.filter((r) => r.kind === kind);
  return (
    <g>
      <rect x={-2000} y={-2000} width={7000} height={6500} fill={C.ground} />
      {g.patches.map((p, i) => (
        <ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} transform={`rotate(${p.rot} ${p.cx} ${p.cy})`} fill={C.patch} />
      ))}

      {g.zones.map((z) => (
        <rect key={z.name} x={z.x} y={z.y} width={z.w} height={z.h} rx={28} fill={C.zone} stroke={C.zoneEdge} strokeWidth={3} strokeDasharray="14 12" />
      ))}
      <path d={rectsPath(g.lots)} fill="none" stroke={C.lot} strokeWidth={1.4} />

      {roads('senda').map((r, i) => (
        <path key={i} d={r.d} fill="none" stroke={C.senda} strokeWidth={6} strokeLinecap="round" strokeDasharray="0.1 14" />
      ))}
      {roads('ripio').map((r, i) => (
        <path key={i} d={r.d} fill="none" stroke={C.ripio} strokeWidth={24} strokeLinejoin="round" />
      ))}

      {g.water.map((w, i) =>
        w.kind === 'laguna' ? (
          <path key={i} d={w.d} fill={C.water} stroke={C.waterEdge} strokeWidth={4} />
        ) : (
          <g key={i}>
            <path d={w.d} fill="none" stroke={C.waterEdge} strokeWidth={(w.width ?? 30) + 6} strokeLinecap="round" />
            <path d={w.d} fill="none" stroke={C.water} strokeWidth={w.width ?? 30} strokeLinecap="round" />
          </g>
        )
      )}

      {/* Centro: calles blancas y manzanas como en un plano urbano. */}
      <rect x={g.city.x} y={g.city.y} width={g.city.w} height={g.city.h} fill={C.street} rx={6} />
      {g.blocks.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx={6}
          fill={b.kind === 'plaza' ? C.plaza : b.kind === 'futuro' ? '#F4EFEA' : C.block}
          stroke={b.kind === 'futuro' ? C.accent : 'none'}
          strokeWidth={b.kind === 'futuro' ? 3 : 0}
          strokeDasharray={b.kind === 'futuro' ? '10 8' : undefined}
        />
      ))}
      <path d={rectsPath(g.footprints)} fill={C.footprint} />
      {g.blocks
        .filter((b) => b.kind === 'marq')
        .map((b, i) => (
          <rect key={i} x={b.x + 30} y={b.y + 30} width={b.w - 60} height={b.h - 60} rx={4} fill="#2B2B2B" />
        ))}

      {(['avenida', 'boulevard', 'ruta'] as const).map((kind) =>
        roads(kind).map((r, i) => (
          <g key={`${kind}${i}`}>
            <path d={r.d} fill="none" stroke={C.casing} strokeWidth={kind === 'ruta' ? 40 : 34} strokeLinejoin="round" />
            <path d={r.d} fill="none" stroke={C.street} strokeWidth={kind === 'ruta' ? 32 : 26} strokeLinejoin="round" />
            {kind === 'boulevard' && <path d={r.d} fill="none" stroke={C.median} strokeWidth={6} />}
            {kind === 'ruta' && <path d={r.d} fill="none" stroke={C.casing} strokeWidth={2} strokeDasharray="20 16" />}
          </g>
        ))
      )}

      <g fill={C.tree}>
        {g.trees.map((t, i) => (
          <circle key={i} cx={t.x} cy={t.y} r={t.r} />
        ))}
      </g>

      {g.labels.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={l.y}
          transform={l.rotate ? `rotate(${l.rotate} ${l.x} ${l.y})` : undefined}
          fontSize={l.size}
          fontFamily="var(--font-display), sans-serif"
          fontWeight={l.kind === 'district' ? 700 : l.kind === 'road' ? 600 : 500}
          fontStyle={l.kind === 'water' ? 'italic' : undefined}
          letterSpacing={l.kind === 'district' ? 6 : l.kind === 'road' ? 4 : 0}
          fill={l.kind === 'district' ? C.district : l.kind === 'water' ? C.waterLabel : C.label}
          textAnchor={l.kind === 'district' ? 'start' : 'middle'}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {l.text}
        </text>
      ))}
    </g>
  );
});
