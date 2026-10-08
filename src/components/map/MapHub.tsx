'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DESARROLLOS, urlModelo, type Desarrollo } from '@/content/desarrollos';
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

  // Precarga del recorrido 3D (ruta, código de Three.js y modelo) al pasar el mouse.
  const prefetch3D = useCallback(
    (d: Desarrollo) => {
      if (!d.recorrido3d || prefetched.has(d.id)) return;
      prefetched.add(d.id);
      router.prefetch(`/recorrido/${d.recorrido3d.slug}`);
      void import('@/components/experience/Experience');
      void fetch(urlModelo(d.recorrido3d.modelo), { priority: 'low' } as RequestInit).catch(() => prefetched.delete(d.id));
    },
    [router]
  );

  const hover = useCallback(
    (id: string | null) => {
      setHoveredId(id);
      const d = DESARROLLOS.find((x) => x.id === id);
      if (d) prefetch3D(d);
    },
    [prefetch3D]
  );

  const enter3D = useCallback(
    async (d: Desarrollo) => {
      if (!d.recorrido3d) return;
      prefetch3D(d);
      setSelectedId(d.id);
      await mapRef.current?.focus(d, 3.2);
      const origin = mapRef.current?.screenPoint(d) ?? null;
      await navigate(`/recorrido/${d.recorrido3d.slug}`, `Entrando a ${d.nombre}`, origin);
    },
    [navigate, prefetch3D]
  );

  const select = useCallback((d: Desarrollo | null) => {
    setSelectedId(d?.id ?? null);
    if (d) void mapRef.current?.focus(d);
  }, []);

  // Clic en el mapa: los desarrollos con recorrido 3D entran directo; el resto muestra su ficha.
  const onMarkerClick = useCallback((d: Desarrollo) => (d.recorrido3d ? enter3D(d) : select(d)), [enter3D, select]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
        />
        <p className={styles.hint}>Arrastrá para moverte · rueda o pellizco para acercar</p>
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
      />
    </main>
  );
}
