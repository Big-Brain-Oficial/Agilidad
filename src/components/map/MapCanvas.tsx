'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { FilterSpecification, FlyToOptions, GeoJSONSource, Map as Mapa } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Desarrollo } from '@/content/desarrollos';
import {
  centroMaqueta,
  escalaMaqueta,
  FUERA_DE_VISTA_GENERAL,
  siluetaMaqueta,
  ubicacionesMarq,
  volumenesMarq,
} from '@/content/mapa-resistencia';
import { desplazarCentro, proyectar, type Camara } from './encuadre';
import styles from './MapHub.module.css';

export interface MapCanvasHandle {
  focus: (d: Desarrollo, zoom?: number) => Promise<void>;
  /** Vuelve al encuadre inicial, con todos los desarrollos a la vista. */
  vistaGeneral: () => Promise<void>;
  screenPoint: (d: Desarrollo) => { x: number; y: number } | null;
}

interface Props {
  desarrollos: Desarrollo[];
  visibles: Set<string>;
  selectedId: string | null;
  hoveredId: string | null;
  onMarkerClick: (d: Desarrollo) => void;
  onHover: (id: string | null) => void;
  /** Avisa si el mapa está en la vista general o si el visitante se movió. */
  onVistaGeneral: (activa: boolean) => void;
}

type Estado = 'cargando' | 'listo' | 'error';

const PITCH = 42;
const BEARING = -12;
const FOV = 24;
// Por debajo de este zoom las tarjetas muestran sólo el nombre: entran todas sin taparse.
const ZOOM_TARJETA_COMPLETA = 14.8;
// Medida de una tarjeta compacta antes de poder medirla en pantalla (en celular es más chica).
const tarjetaEstimada = (anchoMapa: number) => anchoMapa < 600 ? { ancho: 100, alto: 25 } : { ancho: 130, alto: 32 };

/** Punto de apoyo de la tarjeta (x, y) y su desplazamiento (dx, dy) respecto de ese punto. */
interface Etiqueta { x: number; y: number; dx: number; dy: number; visible: boolean }
interface Caja { x1: number; y1: number; x2: number; y2: number }

const solape = (a: Caja, b: Caja) =>
  Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));

/**
 * Ubica cada tarjeta junto a su maqueta sin tapar otras tarjetas ni otras torres: prueba debajo
 * (a la derecha, a la izquierda, más abajo con un tallo más largo) y sobre la punta de la torre,
 * y se queda con la de menor costo. Alejarse tiene costo propio: rozar el borde de una torre es
 * preferible a un tallo muy largo.
 */
function ubicarTarjetas(
  puntos: { id: string; x: number; y: number; punta: { x: number; y: number }; torre: Caja }[],
  tamanos: Map<string, { ancho: number; alto: number }>,
  pantalla: Caja,
  ocupadas: Caja[],
  mapa: { ancho: number; alto: number },
): Record<string, Etiqueta> {
  const ubicadas = [...ocupadas];
  const etiquetas: Record<string, Etiqueta> = {};
  for (const p of puntos) {
    // Si la maqueta quedó fuera del mapa, su tarjeta tampoco se muestra (ni ocupa lugar).
    if (p.x < 0 || p.x > mapa.ancho || p.y < 0 || p.y > mapa.alto) {
      etiquetas[p.id] = { x: p.x, y: p.y, dx: -14, dy: 14, visible: false };
      continue;
    }
    const { ancho, alto } = tamanos.get(p.id) ?? tarjetaEstimada(pantalla.x2);
    const torres = puntos.filter((o) => o.id !== p.id).map((o) => o.torre);
    const dentro = p.x > pantalla.x1 && p.x < pantalla.x2 && p.y > pantalla.y1 && p.y < pantalla.y2;
    const candidatos: { dx: number; dy: number; costo: number }[] = [];
    for (let nivel = 0; nivel < 4; nivel++) {
      candidatos.push({ dx: -14, dy: 14 + nivel * (alto + 8), costo: nivel * 1800 });
      candidatos.push({ dx: 14 - ancho, dy: 14 + nivel * (alto + 8), costo: nivel * 1800 + 300 });
    }
    // Sobre la punta de su torre, sin tallo: útil en grupos de torres donde abajo no hay lugar.
    candidatos.push({ dx: p.punta.x - p.x - ancho / 2, dy: p.punta.y - p.y - 8 - alto, costo: 2600 });
    let mejor: { costo: number; dx: number; dy: number } | null = null;
    for (const { dx, dy, costo: base } of candidatos) {
      const caja = { x1: p.x + dx, y1: p.y + dy, x2: p.x + dx + ancho, y2: p.y + dy + alto };
      let costo = base;
      // Tapar otra tarjeta es lo peor; rozar una torre se tolera.
      for (const otra of ubicadas) {
        const area = solape(caja, otra);
        if (area > 0) costo += 20000 + area * 4;
      }
      for (const torre of torres) costo += solape(caja, torre) * 0.5;
      // Fuera de pantalla sólo cuenta si la maqueta está a la vista.
      if (dentro) costo += (ancho * alto - solape(caja, pantalla)) * 4;
      if (!mejor || costo < mejor.costo) mejor = { costo, dx, dy };
    }
    const { dx, dy } = mejor!;
    etiquetas[p.id] = { x: p.x, y: p.y, dx, dy, visible: true };
    ubicadas.push({ x1: p.x + dx, y1: p.y + dy, x2: p.x + dx + ancho, y2: p.y + dy + alto });
  }
  return etiquetas;
}

/**
 * Encuadre de la vista general: el zoom más cercano en el que entran todas las maquetas
 * (con su altura) y sus tarjetas, calculado con la inclinación real del mapa.
 */
function camaraVistaGeneral(mapa: Mapa, desarrollos: Desarrollo[]) {
  const incluidos = desarrollos.filter((d) => d.ubicacion && !FUERA_DE_VISTA_GENERAL.has(d.id));
  const { clientWidth: ancho, clientHeight: alto } = mapa.getContainer();
  const tarjeta = tarjetaEstimada(ancho);
  // Aire para el título de arriba y la ayuda de abajo (en celular, sólo la atribución).
  const marco = ancho < 600
    ? { x1: 10, y1: 78, x2: ancho - 10, y2: alto - 34 }
    : { x1: 40, y1: 130, x2: ancho - 40, y2: alto - 90 };
  const media = (valores: number[]) => valores.reduce((a, b) => a + b, 0) / valores.length;
  const camara: Camara = {
    centro: [media(incluidos.map((d) => d.ubicacion!.longitud)), media(incluidos.map((d) => d.ubicacion!.latitud))],
    zoom: 14, pitch: PITCH, bearing: BEARING, fov: mapa.getVerticalFieldOfView(), ancho, alto,
  };

  const entra = (zoom: number) => {
    camara.zoom = zoom;
    const escala = escalaMaqueta(zoom);
    let caja: Caja = { x1: 0, y1: 0, x2: 0, y2: 0 };
    // Con perspectiva el centrado no es lineal: unos pasos alcanzan para que converja.
    for (let paso = 0; paso < 4; paso++) {
      caja = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
      for (const d of incluidos) {
        const centro = centroMaqueta(d, escala)!;
        const s = siluetaMaqueta(d, zoom, PITCH);
        const base = proyectar(camara, centro);
        // La perspectiva inclina las torres hacia los bordes: se mide la punta, no sólo la base.
        const punta = proyectar(camara, centro, s.metros);
        caja.x1 = Math.min(caja.x1, base.x - s.ancho / 2, punta.x - s.ancho / 2, base.x - 14);
        caja.x2 = Math.max(caja.x2, base.x + s.ancho / 2, punta.x + s.ancho / 2, base.x + tarjeta.ancho);
        caja.y1 = Math.min(caja.y1, punta.y - s.ancho / 4);
        caja.y2 = Math.max(caja.y2, base.y + 14 + tarjeta.alto);
      }
      if (paso === 3) break;
      camara.centro = desplazarCentro(camara, (caja.x1 + caja.x2 - marco.x1 - marco.x2) / 2, (caja.y1 + caja.y2 - marco.y1 - marco.y2) / 2);
    }
    return caja.x2 - caja.x1 <= marco.x2 - marco.x1 && caja.y2 - caja.y1 <= marco.y2 - marco.y1;
  };

  let cerca = 16;
  let lejos = mapa.getMinZoom();
  for (let i = 0; i < 12; i++) {
    const zoom = (cerca + lejos) / 2;
    if (entra(zoom)) lejos = zoom;
    else cerca = zoom;
  }
  entra(lejos);
  return { center: camara.centro, zoom: lejos, pitch: PITCH, bearing: BEARING };
}

/** Radio del halo dorado en píxeles: acompaña el tamaño de la maqueta en pantalla. */
function paradasHalo() {
  const paradas: number[] = [];
  for (let zoom = 12; zoom <= 19; zoom += 0.5) {
    const e = escalaMaqueta(zoom);
    paradas.push(zoom, Math.round((34 * e.planta) / e.pixel));
  }
  return paradas;
}

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(props, ref) {
  const { desarrollos, visibles, selectedId, hoveredId } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Mapa | null>(null);
  const callbacks = useRef(props);
  const terminarVuelo = useRef<(() => void) | null>(null);
  const reproyectar = useRef<(() => void) | null>(null);
  const enVistaGeneral = useRef(true);
  const tamanos = useRef(new Map<string, { ancho: number; alto: number }>());
  const observadorTarjetas = useRef<ResizeObserver | null>(null);
  const [etiquetas, setEtiquetas] = useState<Record<string, Etiqueta>>({});
  const [compacto, setCompacto] = useState(true);
  const [estado, setEstado] = useState<Estado>('cargando');
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);

  useLayoutEffect(() => { callbacks.current = props; });

  const marcarVistaGeneral = useCallback((activa: boolean) => {
    if (enVistaGeneral.current === activa) return;
    enVistaGeneral.current = activa;
    callbacks.current.onVistaGeneral(activa);
  }, []);

  // Una nueva selección o un arrastre pueden interrumpir el vuelo: siempre se resuelve.
  const volar = useCallback((opciones: FlyToOptions & { duration: number }) => {
    const map = mapRef.current;
    if (!map) return Promise.resolve();
    terminarVuelo.current?.();
    map.stop();
    return new Promise<void>((resolve) => {
      const terminar = () => {
        clearTimeout(timeout);
        map.off('moveend', terminar);
        if (terminarVuelo.current === terminar) terminarVuelo.current = null;
        resolve();
      };
      const timeout = setTimeout(terminar, opciones.duration + 300);
      terminarVuelo.current = terminar;
      map.once('moveend', terminar);
      map.flyTo(opciones);
    });
  }, []);

  useImperativeHandle(ref, () => ({
    focus: (d, zoom = 17.2) => {
      const map = mapRef.current;
      if (!map || !d.ubicacion) return Promise.resolve();
      marcarVistaGeneral(false);
      return volar({
        center: [d.ubicacion.longitud, d.ubicacion.latitud],
        zoom, pitch: PITCH, duration: 700,
        // Deja aire para la torre sobre su punto de apoyo, también en mapas bajos.
        offset: [0, map.getContainer().clientHeight < 450 ? 80 : 60],
      });
    },
    vistaGeneral: () => {
      const map = mapRef.current;
      if (!map) return Promise.resolve();
      // Se marca al empezar para que el botón responda enseguida; un arrastre lo desmarca.
      marcarVistaGeneral(true);
      return volar({ ...camaraVistaGeneral(map, desarrollos), duration: 1000 });
    },
    screenPoint: (d) => {
      const map = mapRef.current;
      const box = containerRef.current?.getBoundingClientRect();
      if (!map || !box || !d.ubicacion) return null;
      const point = map.project([d.ubicacion.longitud, d.ubicacion.latitud]);
      return { x: box.left + point.x, y: box.top + point.y };
    },
  }), [desarrollos, marcarVistaGeneral, volar]);

  // Mide cada tarjeta una vez y cuando cambia (modo compacto, selección): el acomodo usa esas medidas.
  const observarTarjeta = useCallback((el: HTMLButtonElement | null) => {
    if (!el) return;
    observadorTarjetas.current ??= new ResizeObserver((entradas) => {
      for (const { target } of entradas) {
        const tarjeta = target as HTMLElement;
        tamanos.current.set(tarjeta.dataset.id!, { ancho: tarjeta.offsetWidth, alto: tarjeta.offsetHeight });
      }
      reproyectar.current?.();
    });
    const observador = observadorTarjetas.current;
    observador.observe(el);
    return () => observador.unobserve(el);
  }, []);

  useEffect(() => {
    let cancelado = false;
    let map: Mapa | null = null;
    let observer: ResizeObserver | null = null;
    let huboError = false;
    setEstado('cargando');
    setEtiquetas({});
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
          zoom: 14,
          pitch: PITCH,
          bearing: BEARING,
          // En celular se puede alejar un poco más: la vista general no entra en zoom 12.
          minZoom: containerRef.current.clientWidth < 600 ? 11.4 : 12,
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
        // Perspectiva más cerrada que la de MapLibre (36,9°): las torres altas no se tuercen
        // hacia los bordes y la ciudad se lee como una maqueta.
        mapa.setVerticalFieldOfView(FOV);
        // Arranca en la vista general, antes de pedir teselas.
        mapa.jumpTo(camaraVistaGeneral(mapa, desarrollos));
        enVistaGeneral.current = true;
        callbacks.current.onVistaGeneral(true);

        // Las maquetas crecen al alejarse: se regeneran por pasos de zoom (ver escalaMaqueta).
        let escala = escalaMaqueta(mapa.getZoom());
        const actualizarEscala = () => {
          const nueva = escalaMaqueta(mapa.getZoom());
          if (nueva.pixel === escala.pixel) return;
          escala = nueva;
          void mapa.getSource<GeoJSONSource>('marq')?.setData(volumenesMarq(desarrollos, escala));
        };

        const actualizarTarjetas = () => {
          if (cancelado) return;
          const zoom = mapa.getZoom();
          const e = escalaMaqueta(zoom);
          const { clientWidth: ancho, clientHeight: alto } = mapa.getContainer();
          const { lng, lat } = mapa.getCenter();
          const camara: Camara = { centro: [lng, lat], zoom, pitch: mapa.getPitch(), bearing: mapa.getBearing(), fov: mapa.getVerticalFieldOfView(), ancho, alto };
          const { visibles: ids, selectedId: elegido } = callbacks.current;
          const puntos = desarrollos
            .filter((d) => d.ubicacion && ids.has(d.id))
            // La tarjeta elegida se ubica primero y conserva el mejor lugar.
            .sort((a, b) => Number(b.id === elegido) - Number(a.id === elegido))
            .map((d) => {
              const centro = centroMaqueta(d, e)!;
              const s = siluetaMaqueta(d, zoom, camara.pitch);
              const { x, y } = proyectar(camara, centro);
              const punta = proyectar(camara, centro, s.metros);
              const torre = { x1: Math.min(x, punta.x) - s.ancho / 2, y1: punta.y - s.ancho / 4, x2: Math.max(x, punta.x) + s.ancho / 2, y2: y + 4 };
              return { id: d.id, x, y, punta, torre };
            });
          // Las tarjetas evitan el título de arriba y la franja de la ayuda (o la atribución) de abajo.
          const titulo = tituloRef.current;
          const ocupadas = titulo
            ? [{ x1: titulo.offsetLeft, y1: titulo.offsetTop, x2: titulo.offsetLeft + titulo.offsetWidth, y2: titulo.offsetTop + titulo.offsetHeight }]
            : [];
          setEtiquetas(ubicarTarjetas(puntos, tamanos.current, { x1: 0, y1: 0, x2: ancho, y2: alto - (ancho < 600 ? 30 : 64) }, ocupadas, { ancho, alto }));
          setCompacto(zoom < ZOOM_TARJETA_COMPLETA);
        };
        reproyectar.current = actualizarTarjetas;
        mapa.on('move', actualizarTarjetas);
        mapa.on('resize', actualizarTarjetas);
        mapa.on('zoom', actualizarEscala);
        // Arrastre, rueda, pellizco o teclado: el visitante dejó la vista general.
        mapa.on('movestart', (evento) => {
          if (evento.originalEvent) marcarVistaGeneral(false);
        });
        observer = new ResizeObserver(() => {
          mapa.resize();
          // Mientras nadie mueva el mapa, la vista general se adapta al tamaño de la ventana.
          if (enVistaGeneral.current && !mapa.isMoving()) mapa.jumpTo(camaraVistaGeneral(mapa, desarrollos));
        });
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
              'circle-radius': ['interpolate', ['linear'], ['zoom'], ...paradasHalo()],
              'circle-color': '#ffdf8c',
              'circle-blur': 0.7,
              'circle-opacity': 0.85,
              'circle-pitch-alignment': 'map',
            },
          }, before);
          escala = escalaMaqueta(mapa.getZoom());
          mapa.addSource('marq', { type: 'geojson', data: volumenesMarq(desarrollos, escala) });
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
          actualizarTarjetas();
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
      reproyectar.current = null;
      mapRef.current = null;
      map?.remove();
    };
  }, [desarrollos, intento, marcarVistaGeneral]);

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
    reproyectar.current?.();
  }, [visibles, selectedId, hoveredId, estado]);

  return (
    <div className={styles.canvas}>
      <div ref={containerRef} className={styles.geographicMap} />
      <div ref={tituloRef} className={styles.mapHeading}>
        <span>Resistencia, Chaco</span>
        <h1>La ciudad, en perspectiva.</h1>
      </div>
      <ul className={styles.markers} data-compact={compacto || undefined} aria-label="Desarrollos ubicados en el mapa">
        {desarrollos.filter(d => d.ubicacion && visibles.has(d.id)).map(d => {
          const p = etiquetas[d.id];
          if (!p) return null;
          const activo = d.id === selectedId || d.id === hoveredId;
          return (
            <li
              key={d.id}
              className={styles.markerItem}
              hidden={!p.visible}
              // Las tarjetas más cercanas a la cámara (más abajo en pantalla) quedan por encima.
              style={{ transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`, zIndex: activo ? 100000 : Math.round(p.y) }}
            >
              <i className={styles.markerStem} style={{ height: Math.max(0, p.dy) }} aria-hidden="true" />
              <button
                ref={observarTarjeta}
                type="button"
                data-id={d.id}
                className={styles.geoMarker}
                style={{ transform: `translate(${p.dx}px, ${p.dy}px)` }}
                data-active={activo ? '' : undefined}
                data-selected={d.id === selectedId ? '' : undefined}
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
