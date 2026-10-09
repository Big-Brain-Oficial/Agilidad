# MARQ Experience

Plataforma inmobiliaria inmersiva para [MARQ](https://estudiomarq.com.ar): un **mapa 2D** con los desarrollos del estudio y un **recorrido 3D en primera persona** por la Torre Natalini (vereda, hall, ascensor y departamento muestra). El **MARQ Bus** estacionado frente al edificio lleva de vuelta al mapa.

**Producción:** https://estudiomarq.vercel.app

La arquitectura y las decisiones técnicas están en [ARQUITECTURA.md](ARQUITECTURA.md).

## Qué incluye

- **Mapa geográfico** (`/`): cartografía real de Resistencia con MapLibre, perspectiva de maqueta y Torre Natalini ubicada sobre Formosa y Rivadavia. Los 10 desarrollos tienen maquetas doradas e iluminación para destacar sobre el contexto plano. Funciona en computadora y en celular.
- **Recorrido 3D** (`/recorrido/torre-natalini`): primera persona con colisiones, ascensor entre el hall y el departamento, y textos por zona. Por ahora solo en computadora con teclado y mouse; en el celular se muestra un aviso.
- **Transición** entre ambos con una cortina que muestra el progreso de carga del modelo.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · MapLibre GL JS · Three.js + React Three Fiber + drei · three-mesh-bvh · zustand. Modelo 3D generado desde Blender 4.5 LTS y optimizado con gltf-transform + meshoptimizer. Sin base de datos ni variables de entorno.

El mapa usa OpenFreeMap / OpenStreetMap, con estilo local y sin clave de API. Requiere conexión para descargar la cartografía. Detalles y fuentes en [docs/MAPA.md](docs/MAPA.md).

## Correr el proyecto

Requiere **Node 20 o superior**.

```bash
npm install
npm run dev        # http://localhost:3000  (detener: Ctrl + C)
```

Versión de producción local:

```bash
npm run build
npm start
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción (también chequea tipos) |
| `npm start` | Sirve el build de producción |
| `npm run typecheck` | Chequeo de tipos de TypeScript |
| `npm run model:build` | Regenera el GLB desde el `.blend` (necesita Blender) |

El aviso `THREE.Clock: This module has been deprecated` en la consola viene de React Three Fiber y no afecta el funcionamiento.

## Controles del recorrido

| Tecla | Acción |
|---|---|
| Mouse | Mirar |
| W A S D o flechas | Caminar |
| Shift | Correr |
| E o clic | Usar el ascensor · subir al MARQ Bus |
| Esc | Pausa (desde ahí también se vuelve al mapa) |

## Ramas y deploy

El sitio está en **Vercel**, conectado a este repositorio:

| Rama | Resultado |
|---|---|
| `main` | Se publica automáticamente en **estudiomarq.vercel.app** |
| Cualquier otra | Vercel arma una versión de prueba (*Preview*) con su propia dirección |

Flujo de trabajo:

1. Crear una rama desde `main` (por ejemplo `fix/...` o `feat/...`) y subirla.
2. Abrir un pull request. El enlace a la versión de prueba aparece en el pull request.
3. Probar ahí, sobre todo el recorrido 3D con un clic real en "Comenzar recorrido".
4. Hacer merge a `main` para publicar.

No hace falta configurar nada en Vercel: detecta Next.js solo.

## Estructura

```
modelos/Torre_Natalini/      fuente del modelo: .blend, script generador, guía y referencias
scripts/                     pipeline Blender → GLB (export_web.py + build-model.mjs)
public/models/               GLB publicados (con hash en el nombre)
src/app/                     rutas: / (mapa) y /recorrido/[slug] (3D)
src/content/                 textos y datos de los desarrollos y del recorrido
src/components/map/          plano SVG, pan/zoom, marcadores y ficha
src/components/transition/   cortina entre rutas
src/components/experience/   escena 3D, visitante, colisiones, MARQ Bus y HUD
```

## Editar contenido

| Qué | Dónde |
|---|---|
| Desarrollos del mapa: textos, estado, posición en el plano, recorrido 3D | `src/content/desarrollos.ts` |
| Textos de cada zona del recorrido | `src/content/recorridos.ts` |
| Estilo del mapa real: calles, plazas, lagunas, rótulos | `public/maps/resistencia.json` |
| Maquetas cartográficas MARQ | `src/content/mapa-resistencia.ts` |

Los textos salen de estudiomarq.com.ar y hay que **validarlos con MARQ**. El mapa real usa el campo `ubicacion` (longitud y latitud); los diez desarrollos tienen coordenadas contrastadas con los domicilios y mapas publicados por MARQ (ver `docs/MAPA.md`). El campo `mapa` pertenece al SVG anterior y no se convierte en coordenadas geográficas.

## Modelo 3D

El GLB que usa la web ya está en `public/models/`. Solo hay que regenerarlo si cambia el `.blend`:

```bash
npm run model:build
```

Necesita **Blender 4.5 LTS**. El script lo busca en `BLENDER_PATH`, en `C:\Users\<usuario>\tools\blender-4.5.*` o en el `PATH`. Escribe el GLB nuevo y actualiza `src/content/modelos.generated.json`; no hay que editar esos archivos a mano.

El modelo de la Torre Natalini es **interpretativo**: la volumetría, el piso y la ubicación del departamento son aproximados. Ver [GUIA_MODELO.md](modelos/Torre_Natalini/GUIA_MODELO.md).

Para sumar otro edificio con recorrido 3D, seguir la sección 7 de [ARQUITECTURA.md](ARQUITECTURA.md).

## Depuración

`/recorrido/torre-natalini?debug` habilita moverse sin capturar el mouse y expone `window.marq` en la consola:

- `marq.state()`: posición, zona y fase.
- `marq.teleport(x, y, z)`: mueve al visitante.
- `marq.look(yaw, pitch)`: orienta la mirada.
- `marq.interact()`: equivale a apretar E.

El modo `?debug` saltea la captura del mouse: un recorrido que anda con `?debug` puede fallar sin él. Probar siempre también sin `?debug`.

## Pendientes

- Validar textos con MARQ y regenerar el modelo con los planos reales (planta tipo, cortes, piso del departamento).
- Recorrido 3D en celular (joystick en pantalla y arrastre para mirar).
- Recorridos 3D para otros desarrollos.
- Materiales con texturas e iluminación horneada.
- Lint, tests y CI (hoy solo hay chequeo de tipos).

Detalle en la sección 9 de [ARQUITECTURA.md](ARQUITECTURA.md).
