'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DESARROLLOS, type Desarrollo } from '@/content/desarrollos';
import { useCurtain, useCurtainNavigate } from '@/components/transition/curtain-store';
import { DevelopmentPanel, type Filtro } from './DevelopmentPanel';
import { MapCanvas, type MapCanvasHandle } from './MapCanvas';
import styles from './MapHub.module.css';

const prefetched = new Set<string>();

export function MapHub() {
  const router = useRouter();
  const navigate = useCurtainNavigate();
  const mapRef = useRef<MapCanvasHandle>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [enVistaGeneral, setEnVistaGeneral] = useState(true);

  // Si venimos del 3D (en el MARQ Bus), la cortina está cerrada: se abre al montar el mapa.
  useEffect(() => {
    const t = setTimeout(() => useCurtain.getState().reveal(), 150);
    return () => clearTimeout(t);
  }, []);

  const visibles = useMemo(
    () => new Set(DESARROLLOS.filter((d) => filtro === 'todos' || (filtro === 'futuro' ? d.estado === 'futuro' : d.tipo === filtro)).map((d) => d.id)),
    [filtro]
  );
  const selected = DESARROLLOS.find((d) => d.id === selectedId) ?? null;

  // La precarga se reserva para quien decide entrar al recorrido desde la ficha. El GLB no se
  // precarga: con el modelo de ~20 MB, esa descarga seguía en curso cuando el recorrido pedía el
  // mismo archivo y, si el caché de Chrome no puede guardarlo (incógnito, disco lleno), el
  // recorrido fallaba con ERR_CACHE_WRITE_FAILURE. Lo descarga sólo el recorrido, con progreso.
  const prefetch3D = useCallback(
    (d: Desarrollo) => {
      if (!d.recorrido3d || prefetched.has(d.id)) return;
      prefetched.add(d.id);
      router.prefetch(`/recorrido/${d.recorrido3d.slug}`);
      void import('@/components/experience/Experience');
    },
    [router]
  );

  const hover = useCallback((id: string | null) => setHoveredId(id), []);

  const enter3D = useCallback(
    async (d: Desarrollo) => {
      if (!d.recorrido3d) return;
      prefetch3D(d);
      setSelectedId(d.id);
      await mapRef.current?.focus(d, 17.6);
      const origin = mapRef.current?.screenPoint(d) ?? null;
      await navigate(`/recorrido/${d.recorrido3d.slug}`, `Entrando a ${d.nombre}`, origin);
    },
    [navigate, prefetch3D]
  );

  const select = useCallback((d: Desarrollo | null) => {
    setSelectedId(d?.id ?? null);
    if (d) void mapRef.current?.focus(d);
  }, []);

  // El mapa selecciona el desarrollo. La entrada al recorrido queda en su ficha.
  const onMarkerClick = select;

  const vistaGeneral = useCallback(() => {
    setSelectedId(null);
    void mapRef.current?.vistaGeneral();
  }, []);

  // Esc equivale a «← Todos los desarrollos» en la ficha.
  const selectedRef = useRef(selectedId);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedRef.current) vistaGeneral();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [vistaGeneral]);

  return (
    <main className={styles.hub}>
      <section className={styles.mapArea}>
        <MapCanvas
          ref={mapRef}
          desarrollos={DESARROLLOS}
          visibles={visibles}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onMarkerClick={onMarkerClick}
          onHover={hover}
          onVistaGeneral={setEnVistaGeneral}
        />
        <p className={styles.hint}>Arrastrá para explorar · rueda o pellizco para acercar</p>
      </section>
      <DevelopmentPanel
        desarrollos={DESARROLLOS}
        visibles={visibles}
        filtro={filtro}
        onFiltro={setFiltro}
        selected={selected}
        hoveredId={hoveredId}
        onSelect={select}
        onHover={hover}
        onEnter3D={enter3D}
        enVistaGeneral={enVistaGeneral}
        onVistaGeneral={vistaGeneral}
      />
    </main>
  );
}
