# MARQ Experience: arquitectura técnica

Plataforma inmobiliaria inmersiva para MARQ. Un **mapa geográfico en perspectiva** funciona como pantalla principal; desde la ficha de un desarrollo se entra a una **exploración 3D en primera persona**. Hoy hay recorrido 3D para la Torre Natalini. El **MARQ Bus** que espera frente al edificio devuelve al mapa. El mapa actual usa MapLibre y OpenFreeMap; sus datos, estilo y fuentes se describen en [docs/MAPA.md](docs/MAPA.md).

```
 Mapa 2D (/)                          Recorrido 3D (/recorrido/torre-natalini)
 ┌──────────────────────┐   clic en   ┌─────────────────────────────────────────┐
 │ plano ilustrado      │  marcador   │ vereda → hall → ascensor → departamento │
 │ marcadores + ficha   │ ──────────▶ │ primera persona, colisiones             │
 │ filtros, zoom        │ ◀────────── │ MARQ Bus (E) = volver al mapa           │
 └──────────────────────┘   cortina   └─────────────────────────────────────────┘
```

## 1. Stack

| Capa | Tecnología | Motivo |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript | Rutas compartibles, *code splitting* por ruta, deploy nativo en Vercel |
| 3D | Three.js r186 + React Three Fiber 9 + drei | Escena declarativa en React; carga de GLB, controles y cielo listos |
| Colisiones | three-mesh-bvh | Consultas rápidas cápsula–triángulo sobre todo el modelo, sin motor de física |
| Estado | zustand | Estado compartido entre la escena (dentro del `<Canvas>`) y la interfaz HTML |
| Modelo | Blender 4.5 LTS + gltf-transform + meshoptimizer | Conversión reproducible del `.blend` a GLB optimizado |
| Datos | Archivos TypeScript/JSON en el repo | Sin base de datos: alcanza para el contenido actual |

## 2. Estructura

```
modelos/Torre_Natalini/          fuente: .blend, script generador, guía y referencias
scripts/
  blender/export_web.py          .blend → GLB (corre dentro de Blender, sin interfaz)
  build-model.mjs                orquesta Blender + optimización + nombre con hash
public/models/                   GLB publicados (torre-natalini.<hash>.glb)
src/
  app/
    page.tsx                     /  → mapa 2D
    recorrido/[slug]/page.tsx    /recorrido/torre-natalini → recorrido 3D
    layout.tsx                   tipografías y cortina de transición
  content/
    desarrollos.ts               desarrollos del mapa (textos, posición, recorrido 3D)
    recorridos.ts                textos por zona y objetos con información (tecla I)
    modelos.generated.json       URL del GLB vigente (lo escribe build-model)
  components/
    map/                         mapa MapLibre, marcadores y panel (SVG anterior sin uso)
    transition/                  cortina persistente entre rutas
    experience/                  escena 3D, visitante, colisiones, bus, HUD
```

## 3. Carga y rendimiento del modelo 3D

El `.blend` original no sirve tal cual para la web: tiene ~2.000 objetos, materiales procedurales de Cycles, luces, cámaras e imágenes de referencia empaquetadas. Por eso hay un **pipeline previo**, de modo que el navegador solo descarga lo necesario.

### Pipeline (`npm run model:build`)

1. **Limpieza** (`export_web.py`): descarta referencias, luces, cámaras, recorrido y guías. Aplana la jerarquía conservando posiciones y aplica biseles y espesores. Trabaja en memoria y nunca guarda el `.blend`.
2. **Materiales para tiempo real**: quita los nodos de ruido procedurales (el navegador no los puede evaluar) y deja el color base. Los vidrios pasan a translucidez simple: la transmisión física es cara en WebGL.
3. **Unión por zona + material**: de **~2.000 objetos a 44 mallas**, es decir 44 *draw calls* en lugar de miles. Es la optimización que más impacta.
4. **Metadatos en el GLB**: el nombre de cada malla indica si colisiona, y hay *empties* con puntos clave:

   | Prefijo | Uso |
   |---|---|
   | `COL__<zona>__<material>` | Malla visible que participa de las colisiones |
   | `VIS__<zona>__<material>` | Solo visual (plantas, tablas del piso, cabina del ascensor) |
   | `ANCLA__inicio`, `ANCLA__acceso`, `ANCLA__bus`, `ANCLA__ascensor` | Inicio, mirada inicial, bus y datos del ascensor (altura de transbordo, piso) |
   | `ANCLA__ascensor__<n>`, `ZONA__ascensor__<n>` | Cabina y hueco de cada parada del ascensor (0 = hall) |
   | `ZONA__hall`, `ZONA__pasillo`, `ZONA__depto` | Cajas de zona (la escala es el medio tamaño) |
   | `LUZ__*` | Posición, tipo y energía de las luces de Blender, para recrearlas en la web |

5. **Compresión** (gltf-transform):
   - `dedup` + `weld` + **meshopt**, con cuantización de vértices.
   - Las mallas `VIS__` de más de 5.000 triángulos (muebles y plantas importados) se **simplifican** con un error máximo de 1 mm, cuidando también normales y UV (`simplifyWithAttributes`).
   - Las texturas pasan a **KTX2**: color y rugosidad en ETC1S, normales en UASTC, con tope de 2048 px. Siguen comprimidas en la memoria de video: unos 100 MB en lugar de ~600 MB como imágenes decodificadas.
   - Resultado: **87 MB → 29,5 MB** y 346.338 triángulos (antes 531.540). La codificación KTX2 tarda unos 10 minutos; `npm run model:build -- --sin-blender` reusa el último export de Blender.
6. **Nombre con hash** (`torre-natalini.<hash>.glb`) y caché `immutable` de un año (`next.config.ts`). El manifiesto `modelos.generated.json` indica a la app qué archivo usar.

### En el navegador

- **Code splitting**: el mapa no incluye Three.js. El recorrido se importa con `next/dynamic` solo al entrar.
- **Carga del recorrido**: al elegir «Recorrer en 3D» en la ficha se precargan la ruta y el código de Three.js. El GLB lo descarga sólo el recorrido: precargarlo en paralelo hacía dos pedidos del mismo archivo de ~30 MB y, si el caché de Chrome no lo puede guardar (incógnito, disco lleno), el recorrido fallaba con `ERR_CACHE_WRITE_FAILURE`. Explorar o seleccionar edificios en el mapa no descarga el modelo inmersivo.
- **Progreso real**: la cortina de transición muestra el avance de descarga (`useProgress`).
- **Shaders compilados antes de mostrar**: con la cortina todavía cerrada, `renderer.compileAsync` compila todos los materiales en segundo plano (`KHR_parallel_shader_compile`). Mientras tanto el canvas no dibuja (`frameloop="never"`): dibujar antes obligaría a esperar la compilación. En Windows (Direct3D) compilar shaders es lento, y sin esto la carga se congelaba varios segundos.
- **Texturas subidas antes de mostrar**: también con la cortina cerrada, `renderer.initTexture` sube todas las texturas a la GPU. Si no, cada una se sube la primera vez que entra en cuadro y la imagen se traba al girar. Las texturas KTX2 se transcodifican en un worker con el transcodificador de Basis (`public/basis/`, copiado de `three/examples/jsm/libs/basis/`; actualizarlo junto con `three`).
- **Pocas luces**: las luminarias de Blender se agrupan en 3 luces puntuales, más una que viaja con la cabina del ascensor. Como desde un piso no se ve el otro, los dos comparten esas luces: en planta baja alumbra el hall; arriba, la zona de día, la de noche y el pasillo. El cambio se hace a mitad del viaje en ascensor, donde ninguna alcanza a la cabina. Cada luz extra agranda el shader de todos los materiales.
- **Mapa de entorno (HDR)**: `<Environment>` usa `public/archviz/rooftop_day/hdri.hdr` (2K, ~6 MB) para dar reflejos y luz ambiente a metales, lacas y vidrios. Generar su PMREM compila shaders pesados de forma sincrónica (~2 s en una Radeon Vega 11, medido con la versión anterior): ocurre dentro de `compileAsync`, con la cortina todavía cerrada. Pendiente: usar una copia de 1K para la web y medir el bloqueo.
- **Sombras estáticas**: el mapa de sombras se calcula al cargar y solo se recalcula mientras se mueve el ascensor (`shadowMap.autoUpdate = false`).
- **DPR acotado** a 1,5 en calidad «Alta» y a 1 en «Fluida», para no sobrecargar pantallas de alta densidad.
- **Un solo antialiasing**: el canvas se crea sin antialiasing y la escena siempre se dibuja en el búfer con MSAA del postproceso (`ArchvizPost`). Tener los dos duplicaba memoria de video y trabajo por cuadro.

## 4. Transición 2D ↔ 3D

La cortina vive en el `layout` raíz, así que **sobrevive al cambio de ruta**:

1. **«Recorrer en 3D» en la ficha:** el mapa vuela hasta el desarrollo y la cortina se expande en círculo desde ese punto (`clip-path`). El clic en el marcador sólo abre la ficha.
2. **Cortina cerrada:** se navega a `/recorrido/<slug>`. La cortina muestra "Entrando a Torre Natalini" y el progreso de carga.
3. **Modelo listo:** cuando el modelo y el colisionador están armados, la cortina se desvanece y aparece la pantalla de inicio.
4. **Vuelta:** el MARQ Bus (o "Volver al mapa" en la pausa) hace el mismo recorrido a la inversa. El mapa abre la cortina al montarse.

Si alguien entra directo por URL, la cortina se cierra al instante y funciona como pantalla de carga.

## 5. Primera persona y colisiones

- **Controles**: *pointer lock* para mirar con el mouse. WASD o flechas para caminar, Shift para correr, E o clic para interactuar, I para ver información de un objeto cercano, Esc para pausar.
- **Cuerpo**: una **cápsula** de 0,22 m de radio con los ojos a 1,65 m. El radio permite pasar por las puertas de 0,5 m que tiene el modelo.
- **Colisión** (`collision.ts`): al cargar, las mallas `COL__*` se unen en una sola geometría en coordenadas de mundo y se construye un **BVH**. En cada paso, `shapecast` busca los triángulos cercanos y empuja la cápsula fuera de ellos. Se hacen 5 subpasos por cuadro para no atravesar paredes finas como los vidrios.
- **Gravedad y escalones**: la cápsula cae y se apoya. Sube escalones menores a su radio, como el cordón de la vereda (11 cm) o el desnivel del terreno (15 cm).
- **Bordes**: paredes invisibles alrededor de la calle, la vereda y el terreno. Además, si el visitante cae más de 4 m, vuelve al último lugar donde estaba apoyado.
- **Ascensor**: la cabina es una **plataforma móvil**. El piso de la cabina solo existe donde está la cabina, y no se puede entrar al hueco si la cabina está en otro piso. Al apretar E se cierran las puertas, cabina y visitante viajan juntos en 4,5 s con aceleración suave y las puertas vuelven a abrir. Las puertas y el frente de la cabina se arman en código (`cabinDoors.ts`); el frente tiene su propio BVH, que se mueve con la cabina. En el piso del departamento el ascensor llega a un pasillo, y su hueco está 3,9 m al este del de planta baja: la cabina sube por el hueco del hall y, un piso antes de llegar y con las puertas cerradas, pasa al otro (altura de transbordo). Allí su piso queda al ras del pasillo.
- **Acceso al edificio**: dos hojas de vidrio corredizas que se abren solas cuando el visitante está a menos de 3 m (`entranceDoor.ts`). Cada hoja tiene su propio BVH, que se mueve con ella. El modelo trae dos hojas fijas abiertas a 90°: se recortan del vidrio del hall al cargar, para no regenerar el GLB.
- **Zonas**: la posición se compara con las cajas `ZONA__*` para mostrar dónde está el visitante (vereda, hall, ascensor, pasillo, departamento) y un texto breve.
- **Información de objetos**: cada objeto con información (`OBJETOS_NATALINI` en `recorridos.ts`) tiene un punto en coordenadas de la escena donde flota un símbolo «i» (`InfoMarkers.tsx`, con `Html` de drei). No depende del GLB, porque las mallas vienen unidas por material. El símbolo se ve a menos de 12 m si un rayo contra el BVH no encuentra una pared en el medio. A menos de 2,5 m se resalta, aparece el aviso «I» y la tecla I abre una tarjeta que no pausa. Se cierra con I de nuevo o al alejarse más de 4,5 m.

## 6. MARQ Bus

Modelado en código (`MarqBus.tsx`) con la identidad de MARQ: cuerpo blanco, franja roja, rótulo "MARQ Bus" y cartel "MAPA MARQ". Está estacionado junto al cordón, donde marca `ANCLA__bus`, y tiene su propio volumen de colisión. Al acercarse a la puerta, su marco se ilumina y aparece **E · Subir al MARQ Bus · volver al mapa**.

Para otros edificios, alcanza con exportar su `ANCLA__bus`: el bus se ubica solo.

## 7. Agregar un nuevo desarrollo 3D

1. Modelar en Blender siguiendo las convenciones: zonas y colecciones como en la Torre Natalini, más `PARAMETROS` si hay ascensor.
2. Sumarlo a `MODELS` en `scripts/build-model.mjs` y correr `npm run model:build`.
3. Agregar `recorrido3d: { slug, modelo }` al desarrollo en `src/content/desarrollos.ts` y sus textos por zona en `src/content/recorridos.ts`.

La ruta `/recorrido/<slug>` se genera sola (`generateStaticParams`).

## 8. Verificación

**Rendimiento** medido en una AMD Radeon RX Vega 11 (gráfica integrada, Direct3D 11), en modo desarrollo:

| | Antes | Después |
|---|---|---|
| Hasta la pantalla de inicio | 10,5 s | 2,7 s |
| Bloqueo más largo de la página | 2,9 s (6,8 s en total) | 0,25 s |
| Recorrido (exterior, giro 360°, hall, departamento) | 60 fps | 60 fps |


Probado en Chrome (sin interfaz, vía DevTools Protocol) sobre el build de producción:

- **Mapa:** filtros, ficha de un desarrollo sin 3D, y clic en Torre Natalini → cortina → ruta 3D → pantalla de inicio.
- **Recorrido:**
  - Caminar 4,8 m en 2 s.
  - Frenar contra un sofá del hall.
  - Pararse sobre la cabina del ascensor y subir 30 m hasta el departamento.
  - Salir al pasillo, entrar al departamento y recorrer el estar.
  - Ver la indicación del bus, subir y volver al mapa.
- **Celular:** el mapa se adapta y el 3D muestra un aviso.

El bloqueo del mouse no se puede probar sin interfaz: en ese caso se usa `?debug`, que expone `window.marq`.

## 9. Limitaciones y próximos pasos

- **Modelo interpretativo**: medidas, piso y núcleo son provisionales (ver `modelos/Torre_Natalini/GUIA_MODELO.md`). Con los planos de MARQ se regenera y se vuelve a correr el pipeline.
- **Celular**: hoy el 3D es solo para escritorio. El paso siguiente es un joystick virtual más arrastre para mirar.
- **Escala a más edificios**: dividir cada GLB en exterior e interior y cargar el interior al acercarse al acceso. También se puede serializar el BVH en el build, en lugar de construirlo en el navegador.
- **Materiales**: hornear iluminación y texturas PBR (madera, piedra) en Blender para un aspecto más realista sin costo en tiempo real.
- **Contenido**: si MARQ necesita editar textos sin desarrolladores, migrar `src/content` a un CMS headless. La estructura de datos ya está separada.
