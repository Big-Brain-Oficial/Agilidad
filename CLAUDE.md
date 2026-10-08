@AGENTS.md

# MARQ Experience

Mapa 2D de los desarrollos de MARQ (`/`) + recorrido 3D en primera persona por la Torre Natalini (`/recorrido/torre-natalini`). Next.js 16 App Router, React 19, TypeScript estricto, React Three Fiber + drei, three-mesh-bvh, zustand. Se publica en Vercel. Detalle técnico en `ARQUITECTURA.md`.

## Comandos

- `npm run dev`: servidor de desarrollo en http://localhost:3000
- `npm run typecheck`: chequeo de tipos
- `npm run build`: build de producción
- `npm run model:build`: regenera el GLB desde Blender (necesita Blender 4.5 LTS; casi nunca hace falta)

No hay lint ni tests. Antes de dar un cambio por terminado, correr `npm run typecheck` y `npm run build`.

## Git y deploy

- `main` se publica automáticamente en producción (https://estudiomarq.vercel.app). **No commitear ni pushear directo a `main`.**
- Trabajar en una rama (`fix/...`, `feat/...`) y abrir pull request; Vercel arma una versión de prueba por rama.
- Mensajes de commit en español, con un título corto y el porqué en el cuerpo.

## Idioma y estilo

- Todo en español rioplatense: textos de la interfaz (con voseo: «Entrá», «Abrilo»), comentarios y nombres de dominio (`desarrollos`, `recorrido`, `zona`, `fase`).
- Comentarios breves que explican el porqué, como en el código existente.
- Estilos con CSS Modules (`*.module.css`) y las variables de `src/app/globals.css` (paleta MARQ). No hay Tailwind.
- Alias de imports: `@/` → `src/`.

## Dónde está cada cosa

- `src/content/desarrollos.ts`: datos del mapa. `recorrido3d` activa la ruta 3D (`generateStaticParams`).
- `src/content/recorridos.ts`: textos por zona del recorrido.
- `src/content/modelos.generated.json` y `public/models/*.glb`: los escribe `model:build`. **No editarlos a mano.**
- `src/components/map/`: mapa SVG. No debe importar Three.js (el mapa no descarga 3D; el recorrido se carga con `next/dynamic`).
- `src/components/transition/`: cortina en el layout raíz, sobrevive al cambio de ruta.
- `src/components/experience/`: escena 3D. `store.ts` comparte estado entre el `<Canvas>` y el HUD; `prepareWorld.ts` lee las convenciones del GLB (`COL__`, `VIS__`, `ANCLA__`, `ZONA__`, `LUZ__`).
- `modelos/` y `scripts/`: fuente Blender y pipeline. Excluidos del `tsconfig`.

## Trampas conocidas

- **Pointer lock:** `PointerLockControls` debe recibir `domElement={gl.domElement}`. Por defecto drei usa el `div` contenedor de R3F, pero el bloqueo se pide sobre el canvas; sin ese prop, `onLock` nunca se dispara y «Comenzar recorrido» no cierra el panel.
- **`?debug` no prueba la captura del mouse:** pasa directo a la fase `playing`. Cualquier cambio en el inicio, la pausa o los controles hay que probarlo en un navegador real sin `?debug`.
- **Rendimiento en Windows (Direct3D):** compilar shaders congela la página. Por eso:
  - el canvas usa `frameloop="never"` hasta que `compileAsync` termina;
  - las luces de Blender se agrupan en 3 luces puntuales: no sumar luces sin necesidad;
  - no hay mapa de entorno (PMREM): no agregar `Environment` de drei.
- **Sombras estáticas:** `shadowMap.autoUpdate = false`. Si algo se mueve, poner `gl.shadowMap.needsUpdate = true` (lo hace el ascensor).
- **Colisiones:** solo cuentan las mallas `COL__*`, unidas en un BVH al cargar. La cabina del ascensor es `VIS__` y su piso se resuelve en código (`Player.tsx`).
- El aviso `THREE.Clock: This module has been deprecated` viene de React Three Fiber 9: no es nuestro y se puede ignorar.

## Contenido

- Los textos salen de estudiomarq.com.ar y están pendientes de validación con MARQ: no inventar datos (superficies, pisos, amenities).
- El modelo de la Torre Natalini es interpretativo (`modelos/Torre_Natalini/GUIA_MODELO.md`).
- Las posiciones del mapa son del plano ilustrado (viewBox 3000 × 2500), no geográficas.
- No sumar binarios pesados al repositorio (el `.blend` y las referencias ya ocupan ~23 MB).
