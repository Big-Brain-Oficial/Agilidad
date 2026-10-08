import type { TipoDesarrollo } from '@/content/desarrollos';

const common = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function BuildingIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <path d="M4 14.5V2.5h6v12M10 6.5h2.5v8M2.5 14.5h11" />
      <path d="M6 5h2M6 7.5h2M6 10h2" />
    </svg>
  );
}

export function TreeIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <path d="M8 14.5v-4M8 10.5c-2.8 0-4.5-1.6-4.5-3.7S5.2 2.5 8 2.5s4.5 2.2 4.5 4.3-1.7 3.7-4.5 3.7Z" />
      <path d="M3 14.5h10" />
    </svg>
  );
}

export function HouseIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <path d="M2.5 7.5 8 3l5.5 4.5M4 6.5v8h8v-8M6.8 14.5v-3.5h2.4v3.5" />
    </svg>
  );
}

export function TipoIcon({ tipo }: { tipo: TipoDesarrollo }) {
  if (tipo === 'barrio') return <TreeIcon />;
  if (tipo === 'casas') return <HouseIcon />;
  return <BuildingIcon />;
}

export function ArrowIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
