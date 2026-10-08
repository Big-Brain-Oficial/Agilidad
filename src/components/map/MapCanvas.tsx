'use client';

import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Desarrollo } from '@/content/desarrollos';
import { TipoIcon } from './icons';
import { MapBackground } from './MapBackground';
import { buildMapGeometry, MAP_H, MAP_W } from './mapGeometry';
import { usePanZoom } from './usePanZoom';
import styles from './MapHub.module.css';

export interface MapCanvasHandle {
  /** Centra el mapa en un desarrollo. */
  focus: (d: Desarrollo, k?: number) => Promise<void>;
  /** Posición en pantalla (px) de un desarrollo, para animar la transición desde ahí. */
  screenPoint: (d: Desarrollo) => { x: number; y: number } | null;
}

interface Props {
  desarrollos: Desarrollo[];
  visibles: Set<string>;
  selectedId: string | null;
  hoveredId: string | null;
  onMarkerClick: (d: Desarrollo) => void;
  onHover: (id: string | null) => void;
}

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(
  { desarrollos, visibles, selectedId, hoveredId, onMarkerClick, onHover },
  ref
) {
  const geometry = useMemo(buildMapGeometry, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { view, zoomAt, flyTo, reset, dragged } = usePanZoom(svgRef, { width: MAP_W, height: MAP_H, minK: 1, maxK: 5 });

  // Matriz viewBox → pantalla, relativa al contenedor. Se recalcula al redimensionar.
  const [frame, setFrame] = useState({ a: 1, e: 0, f: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const svg = svgRef.current, box = containerRef.current;
      const ctm = svg?.getScreenCTM();
      if (!svg || !box || !ctm) return;
      const r = box.getBoundingClientRect();
      setFrame({ a: ctm.a, e: ctm.e - r.left, f: ctm.f - r.top });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', measure);
    };
  }, []);

  const project = (x: number, y: number) => ({ left: frame.a * (x * view.k + view.x) + frame.e, top: frame.a * (y * view.k + view.y) + frame.f });

  useImperativeHandle(ref, () => ({
    focus: (d, k = 2.4) => flyTo(d.mapa.x, d.mapa.y, k),
    screenPoint: (d) => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box) return null;
      const p = project(d.mapa.x, d.mapa.y);
      return { x: box.left + p.left, y: box.top + p.top };
    },
  }));

  return (
    <div ref={containerRef} className={styles.canvas}>
      <svg ref={svgRef} className={styles.svg} viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Plano de los desarrollos de MARQ en Resistencia">
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <MapBackground g={geometry} />
        </g>
      </svg>

      {/* Con poca escala en pantalla (celular o vista lejana) solo se muestran los íconos. */}
      <ul className={styles.markers} data-compact={frame.a * view.k < 0.3 ? '' : undefined}>
        {desarrollos.map((d) => {
          const p = project(d.mapa.x, d.mapa.y);
          const visible = visibles.has(d.id);
          return (
            <li key={d.id} className={styles.markerItem} style={{ transform: `translate(${p.left.toFixed(1)}px, ${p.top.toFixed(1)}px)` }} hidden={!visible}>
              <button
                type="button"
                className={styles.marker}
                data-tipo={d.tipo}
                data-estado={d.estado}
                data-3d={d.recorrido3d ? '' : undefined}
                data-active={d.id === selectedId || d.id === hoveredId ? '' : undefined}
                aria-label={`${d.nombre}${d.recorrido3d ? ': recorrer en 3D' : ''}`}
                onClick={() => {
                  if (!dragged.current) onMarkerClick(d);
                }}
                onPointerEnter={() => onHover(d.id)}
                onPointerLeave={() => onHover(null)}
                onFocus={() => onHover(d.id)}
                onBlur={() => onHover(null)}
              >
                <span className={styles.pin}>
                  <TipoIcon tipo={d.tipo} />
                </span>
                {d.recorrido3d && <span className={styles.badge3d}>3D</span>}
                <span className={styles.markerLabel}>
                  {d.nombre}
                  {d.recorrido3d && <em>Clic para recorrer en 3D</em>}
                  {d.estado === 'futuro' && <em>{d.etiquetaEstado ?? 'Próximamente'}</em>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className={styles.zoom}>
        <button type="button" onClick={() => zoomAt(MAP_W / 2, MAP_H / 2, 1.4)} aria-label="Acercar">
          +
        </button>
        <button type="button" onClick={() => zoomAt(MAP_W / 2, MAP_H / 2, 1 / 1.4)} aria-label="Alejar">
          −
        </button>
        <button type="button" onClick={() => reset()} aria-label="Ver todo el mapa" className={styles.zoomReset}>
          ⤢
        </button>
      </div>

      <div className={styles.legend} aria-hidden="true">
        <span><i data-tipo="edificio" /> Edificios</span>
        <span><i data-tipo="barrio" /> Barrios</span>
        <span><i data-tipo="casas" /> Casas</span>
        <span><i data-estado="futuro" /> Próximamente</span>
        <span><b>3D</b> Recorrido disponible</span>
      </div>
    </div>
  );
});
