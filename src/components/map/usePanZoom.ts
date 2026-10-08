'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Pan y zoom sobre un SVG: rueda (centrada en el cursor), arrastre, pellizco con dos dedos
// y animación para "volar" a un punto. La transformación se aplica a un <g> interno.

export interface View {
  k: number; // escala
  x: number; // traslación en unidades del viewBox
  y: number;
}

interface Options {
  width: number;
  height: number;
  minK?: number;
  maxK?: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function usePanZoom(svgRef: React.RefObject<SVGSVGElement | null>, { width, height, minK = 1, maxK = 6 }: Options) {
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const anim = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: View; startPts: { x: number; y: number }[]; moved: boolean } | null>(null);
  /** true si el último gesto fue un arrastre (para no tomarlo como clic). */
  const dragged = useRef(false);

  const commit = useCallback(
    (v: View) => {
      const k = clamp(v.k, minK, maxK);
      // Mantiene el plano cubriendo el visor.
      const x = clamp(v.x, width - width * k, 0);
      const y = clamp(v.y, height - height * k, 0);
      viewRef.current = { k, x, y };
      setView(viewRef.current);
    },
    [width, height, minK, maxK]
  );

  // Coordenadas de pantalla → unidades del viewBox (antes de la transformación interna).
  const toSvg = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      const ctm = svg?.getScreenCTM();
      if (!svg || !ctm) return { x: 0, y: 0 };
      const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    },
    [svgRef]
  );

  const stopAnim = () => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
  };

  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      stopAnim();
      const v = viewRef.current;
      const k = clamp(v.k * factor, minK, maxK);
      commit({ k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k });
    },
    [commit, minK, maxK]
  );

  /** Anima la vista para centrar (cx, cy) con escala k. */
  const flyTo = useCallback(
    (cx: number, cy: number, k: number, ms = 700) =>
      new Promise<void>((resolve) => {
        stopAnim();
        const from = viewRef.current;
        const kk = clamp(k, minK, maxK);
        const to = { k: kk, x: clamp(width / 2 - cx * kk, width - width * kk, 0), y: clamp(height / 2 - cy * kk, height - height * kk, 0) };
        const t0 = performance.now();
        const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / ms);
          const e = ease(t);
          commit({ k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
          if (t < 1) anim.current = requestAnimationFrame(step);
          else {
            anim.current = null;
            resolve();
          }
        };
        anim.current = requestAnimationFrame(step);
      }),
    [commit, width, height, minK, maxK]
  );

  const reset = useCallback(() => flyTo(width / 2, height / 2, 1), [flyTo, width, height]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    };

    const onDown = (e: PointerEvent) => {
      stopAnim();
      pointers.current.set(e.pointerId, toSvg(e.clientX, e.clientY));
      gesture.current = { start: viewRef.current, startPts: [...pointers.current.values()], moved: false };
      dragged.current = false;
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId) || !gesture.current) return;
      pointers.current.set(e.pointerId, toSvg(e.clientX, e.clientY));
      const pts = [...pointers.current.values()];
      const g = gesture.current;
      if (pts.length === 1 && g.startPts.length === 1) {
        const dx = pts[0].x - g.startPts[0].x, dy = pts[0].y - g.startPts[0].y;
        // Umbral de 6 px de pantalla para distinguir un clic de un arrastre.
        if (!g.moved && Math.hypot(dx, dy) < 6 / (svg.getScreenCTM()?.a || 1)) return;
        if (!g.moved) svg.setPointerCapture(e.pointerId);
        g.moved = dragged.current = true;
        commit({ ...g.start, x: g.start.x + dx, y: g.start.y + dy });
      } else if (pts.length === 2 && g.startPts.length === 2) {
        // Pellizco: escala por la distancia entre dedos y traslada con el punto medio.
        const d0 = Math.hypot(g.startPts[0].x - g.startPts[1].x, g.startPts[0].y - g.startPts[1].y);
        const d1 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const m0 = { x: (g.startPts[0].x + g.startPts[1].x) / 2, y: (g.startPts[0].y + g.startPts[1].y) / 2 };
        const m1 = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const k = clamp(g.start.k * (d1 / (d0 || 1)), minK, maxK);
        g.moved = dragged.current = true;
        commit({ k, x: m1.x - ((m0.x - g.start.x) * k) / g.start.k, y: m1.y - ((m0.y - g.start.y) * k) / g.start.k });
      }
    };

    const onUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      gesture.current = pointers.current.size ? { start: viewRef.current, startPts: [...pointers.current.values()], moved: true } : null;
    };

    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      stopAnim();
    };
  }, [svgRef, toSvg, zoomAt, commit, minK, maxK]);

  return { view, zoomAt, flyTo, reset, dragged };
}
