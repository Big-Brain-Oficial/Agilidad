'use client';

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { FilterSpecification, Map as Mapa } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Desarrollo } from '@/content/desarrollos';
import { ubicacionesMarq, volumenesMarq } from '@/content/mapa-resistencia';
import styles from './MapHub.module.css';

export interface MapCanvasHandle {
  focus: (d: Desarrollo, zoom?: number) => Promise<void>;
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

type Posiciones = Record<string, { x: number; y: number }>;
type Estado = 'cargando' | 'listo' | 'error';

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(props, ref) {
  const { desarrollos, visibles, selectedId, hoveredId } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Mapa | null>(null);
  const callbacks = useRef(props);
  const terminarVuelo = useRef<(() => void) | null>(null);
  const [posiciones, setPosiciones] = useState<Posiciones>({});
  const [estado, setEstado] = useState<Estado>('cargando');
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);

  useLayoutEffect(() => { callbacks.current = props; });

  useImperativeHandle(ref, () => ({
    focus: (d, zoom = 17.2) => {
      const map = mapRef.current;
      if (!map || !d.ubicacion) return Promise.resolve();
      // Una nueva selección o un arrastre pueden interrumpir el vuelo: siempre se resuelve.
      terminarVuelo.current?.();
      map.stop();
      return new Promise<void>((resolve) => {
        const terminar = () => {
          clearTimeout(timeout);
          map.off('moveend', terminar);
          if (terminarVuelo.current === terminar) terminarVuelo.current = null;
          resolve();
        };
        const timeout = setTimeout(terminar, 1000);
        terminarVuelo.current = terminar;
        map.once('moveend', terminar);
        map.flyTo({
          center: [d.ubicacion!.longitud, d.ubicacion!.latitud],
          zoom, pitch: 42, duration: 700,
          // Deja aire para la torre sobre su punto de apoyo, también en mapas bajos.
          offset: [0, map.getContainer().clientHeight < 450 ? 80 : 60],
        });
      });
    },
    screenPoint: (d) => {
      const map = mapRef.current;
      const box = containerRef.current?.getBoundingClientRect();
      if (!map || !box || !d.ubicacion) return null;
      const point = map.project([d.ubicacion.longitud, d.ubicacion.latitud]);
      return { x: box.left + point.x, y: box.top + point.y };
    },
  }), []);

  useEffect(() => {
    let cancelado = false;
    let map: Mapa | null = null;
    let observer: ResizeObserver | null = null;
    let huboError = false;
    setEstado('cargando');
    setPosiciones({});
    const limiteCarga = setTimeout(() => {
      if (!cancelado) {
        setError('La cartografía está tardando en responder. Revisá tu conexión o intentá de nuevo.');
        setEstado('error');
      }
    }, 20000);

    const cargar = async () => {
      try {
        const maplibre = await import('maplibre-gl');
        if (cancelado || !containerRef.current) return;
        // Next/Turbopack publica el worker local con hash, sin depender de un CDN de código.
        maplibre.setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString());
        map = new maplibre.Map({
          container: containerRef.current,
          style: '/maps/resistencia.json',
          center: [-58.9855, -27.4445],
          zoom: containerRef.current.clientWidth < 600 ? 14.7 : 15.3,
          pitch: 42,
          bearing: -12,
          minZoom: 12,
          maxZoom: 19,
          maxPitch: 55,
          dragRotate: false,
          touchPitch: false,
          attributionControl: { compact: true },
          pixelRatio: Math.min(window.devicePixelRatio, 1.75),
          canvasContextAttributes: { antialias: true },
        });
        const mapa = map;
        mapRef.current = mapa;
        mapa.touchZoomRotate.disableRotation();
        mapa.getCanvas().setAttribute('aria-label', 'Mapa de Resistencia: calles, plazas, lagunas y desarrollos MARQ');

        const proyectar = () => {
          if (cancelado) return;
          const positions: Posiciones = {};
          for (const d of desarrollos) {
            if (!d.ubicacion) continue;
            positions[d.id] = mapa.project([d.ubicacion.longitud, d.ubicacion.latitud]);
          }
          setPosiciones(positions);
        };
        mapa.on('move', proyectar);
        mapa.on('resize', proyectar);
        observer = new ResizeObserver(() => mapa.resize());
        observer.observe(containerRef.current);

        mapa.on('error', () => {
          if (cancelado) return;
          clearTimeout(limiteCarga);
          huboError = true;
          setError('No pudimos cargar toda la cartografía. Revisá tu conexión e intentá de nuevo.');
          setEstado('error');
        });
        mapa.on('load', () => {
          if (cancelado) return;
          clearTimeout(limiteCarga);
          const before = mapa.getStyle().layers.find(l => l.type === 'symbol')?.id;
          const filtro: FilterSpecification = ['in', ['get', 'desarrollo'], ['literal', [...callbacks.current.visibles]]];
          mapa.addSource('marq-ubicaciones', {
            type: 'geojson',
            data: ubicacionesMarq(desarrollos),
          });
          mapa.addLayer({
            id: 'marq-luz', type: 'circle', source: 'marq-ubicaciones',
            filter: filtro,
            paint: {
              'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 12, 2, 16, 44, 19, 240],
              'circle-color': '#ffdf8c',
              'circle-blur': 0.7,
              'circle-opacity': 0.85,
              'circle-pitch-alignment': 'map',
            },
          }, before);
          mapa.addSource('marq', { type: 'geojson', data: volumenesMarq(desarrollos) });
          mapa.addLayer({
            id: 'marq-volumen',
            type: 'fill-extrusion',
            source: 'marq',
            filter: filtro,
            paint: {
              'fill-extrusion-color': ['get', 'color'],
              'fill-extrusion-base': ['get', 'base'],
              'fill-extrusion-height': ['get', 'altura'],
              'fill-extrusion-opacity': 1,
            },
          }, before);
          mapa.on('click', 'marq-volumen', (evento) => {
            const desarrollo = desarrollos.find(d => d.id === evento.features?.[0]?.properties?.desarrollo);
            if (desarrollo) callbacks.current.onMarkerClick(desarrollo);
          });
          mapa.on('mousemove', 'marq-volumen', (evento) => {
            mapa.getCanvas().style.cursor = 'pointer';
            callbacks.current.onHover(evento.features?.[0]?.properties?.desarrollo ?? null);
          });
          mapa.on('mouseleave', 'marq-volumen', () => {
            mapa.getCanvas().style.cursor = '';
            callbacks.current.onHover(null);
          });
          proyectar();
          if (!huboError) setEstado('listo');
        });
      } catch {
        if (cancelado) return;
        clearTimeout(limiteCarga);
        setError('No pudimos iniciar el mapa. Probá con un navegador actualizado con gráficos WebGL habilitados.');
        setEstado('error');
      }
    };
    void cargar();

    return () => {
      cancelado = true;
      clearTimeout(limiteCarga);
      terminarVuelo.current?.();
      observer?.disconnect();
      mapRef.current = null;
      map?.remove();
    };
  }, [desarrollos, intento]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer('marq-volumen')) return;
    const filtro: FilterSpecification = ['in', ['get', 'desarrollo'], ['literal', [...visibles]]];
    map.setFilter('marq-volumen', filtro);
    map.setFilter('marq-luz', filtro);
    map.setPaintProperty('marq-volumen', 'fill-extrusion-color', [
      'case',
      ['all', ['==', ['get', 'color'], '#d7b277'], ['in', ['get', 'desarrollo'], ['literal', [selectedId, hoveredId].filter(Boolean)]]],
      '#ebc989',
      ['get', 'color'],
    ]);
  }, [visibles, selectedId, hoveredId, estado]);

  return (
    <div className={styles.canvas}>
      <div ref={containerRef} className={styles.geographicMap} />
      <div className={styles.mapHeading}>
        <span>Resistencia, Chaco</span>
        <h1>La ciudad, en perspectiva.</h1>
      </div>
      <ul className={styles.markers} aria-label="Desarrollos ubicados en el mapa">
        {desarrollos.filter(d => d.ubicacion && visibles.has(d.id)).map(d => {
          const p = posiciones[d.id];
          if (!p) return null;
          return (
            <li key={d.id} className={styles.markerItem} style={{ transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)` }}>
              <button
                type="button"
                className={styles.geoMarker}
                data-shared={d.id === 'casas-bdn' ? '' : undefined}
                data-active={d.id === selectedId || d.id === hoveredId ? '' : undefined}
                aria-label={`Ver ficha de ${d.nombre}`}
                onClick={() => props.onMarkerClick(d)}
                onPointerEnter={() => props.onHover(d.id)}
                onPointerLeave={() => props.onHover(null)}
                onFocus={() => props.onHover(d.id)}
                onBlur={() => props.onHover(null)}
              >
                <i aria-hidden="true" />
                <span><small>MARQ</small>{d.nombre}<em>Explorá el desarrollo →</em></span>
              </button>
            </li>
          );
        })}
      </ul>
      {estado === 'cargando' && (
        <div className={styles.mapLoading} role="status"><i />Cargando Resistencia…</div>
      )}
      {estado === 'error' && (
        <div className={styles.mapError} role="alert">
          <strong>El mapa no está disponible</strong>
          <p>{error}</p>
          <button type="button" onClick={() => setIntento(i => i + 1)}>Reintentar</button>
        </div>
      )}
      <p className={styles.mapNote}>Volúmenes orientativos</p>
    </div>
  );
});
