'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { HalfFloatType, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { useExperience } from './store';

/**
 * Dibuja la escena en un búfer con antialiasing (el canvas no tiene) y aplica el tono y el color
 * de salida. El perfil alto suma AO a escala métrica; el fluido, solo el antialiasing.
 */
export function ArchvizPost() {
  const { gl, scene, camera, size, viewport } = useThree();
  const quality = useExperience((s) => s.quality);
  const pipeline = useRef<EffectComposer | null>(null);

  useEffect(() => {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    const composer = new EffectComposer(gl, target);
    const render = new RenderPass(scene, camera);
    const output = new OutputPass();
    composer.addPass(render);
    let ao: SSAOPass | null = null;
    if (quality === 'alta') {
      ao = new SSAOPass(scene, camera, 512, 512, 16);
      // Distancias normalizadas por el rango de profundidad del pass; radio en unidades de escena.
      ao.kernelRadius = .22;
      ao.minDistance = .00005;
      ao.maxDistance = .002;
      composer.addPass(ao);
    }
    composer.addPass(output);
    composer.setPixelRatio(viewport.dpr);
    composer.setSize(size.width, size.height);
    ao?.setSize(Math.max(1, Math.round(size.width * viewport.dpr * .6)), Math.max(1, Math.round(size.height * viewport.dpr * .6)));
    pipeline.current = composer;
    return () => {
      pipeline.current = null;
      render.dispose();
      ao?.dispose();
      output.dispose();
      composer.dispose();
    };
  }, [gl, scene, camera, quality, size.width, size.height, viewport.dpr]);

  useFrame((_, delta) => {
    if (pipeline.current) pipeline.current.render(delta);
    else gl.render(scene, camera);
  }, 1);
  return null;
}
