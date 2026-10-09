// Convierte los modelos de Blender (modelos/) en GLB optimizados para la web (public/models/).
//
//   npm run model:build
//   npm run model:build -- --sin-blender   reusa el último export de .cache/models
//
// Necesita Blender 4.5 LTS. Se busca en BLENDER_PATH, en C:\Users\<usuario>\tools\blender-4.5.*
// o en el PATH del sistema. Codificar las texturas a KTX2 lleva varios minutos.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import sharp from 'sharp';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = [
  {
    id: 'torre-natalini',
    blend: 'modelos/Torre_Natalini/Torre_Natalini_Interpretativa.blend',
    script: 'scripts/blender/export_web.py',
    rebuild: 'scripts/blender/rebuild_archviz.py',
  },
];

function findBlender() {
  if (process.env.BLENDER_PATH && existsSync(process.env.BLENDER_PATH)) return process.env.BLENDER_PATH;
  const foundation = join(process.env.ProgramFiles ?? 'C:/Program Files', 'Blender Foundation');
  if (existsSync(foundation)) {
    for (const dir of readdirSync(foundation).sort().reverse()) {
      const binary = join(foundation, dir, 'blender.exe');
      if (existsSync(binary)) return binary;
    }
  }
  const tools = join(homedir(), 'tools');
  if (existsSync(tools)) {
    const dir = readdirSync(tools).filter((d) => d.startsWith('blender-4.5')).sort().pop();
    if (dir && existsSync(join(tools, dir, 'blender.exe'))) return join(tools, dir, 'blender.exe');
  }
  return 'blender';
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

/**
 * Simplifica las mallas solo visuales (muebles y plantas importados) con un error máximo de 1 mm:
 * a la distancia del recorrido no se nota y se dibujan bastantes menos triángulos. También pesan las
 * normales y las UV: simplificar solo por la forma dejaba vetas en superficies curvas (la mesa de
 * roble). Las mallas COL__ no se tocan para no cambiar las colisiones.
 */
function simplifyVisual({ error = 0.001, normalDeviation = 0.02, uvDeviation = 1 / 2048, minTriangles = 5000 } = {}) {
  // Con ErrorAbsolute el error se mide en metros; cada peso convierte el desvío tolerado del
  // atributo (normal ~1°, UV ~1 píxel de una textura 2K) en ese mismo error.
  const wNormal = error / normalDeviation;
  const wUv = error / uvDeviation;
  return (doc) => {
    const done = new Set();
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh();
      if (!mesh || done.has(mesh) || !node.getName().startsWith('VIS__')) continue;
      done.add(mesh); // dedup puede compartir una misma malla entre varios nodos
      for (const prim of mesh.listPrimitives()) {
        const indices = prim.getIndices();
        if (!indices || indices.getCount() / 3 < minTriangles) continue;
        const position = prim.getAttribute('POSITION').getArray();
        const normal = prim.getAttribute('NORMAL')?.getArray();
        const uv = prim.getAttribute('TEXCOORD_0')?.getArray();
        const count = position.length / 3;
        const stride = (normal ? 3 : 0) + (uv ? 2 : 0);
        const attributes = new Float32Array(count * stride);
        for (let i = 0, o = 0; i < count; i++) {
          if (normal) for (let k = 0; k < 3; k++) attributes[o++] = normal[i * 3 + k];
          if (uv) for (let k = 0; k < 2; k++) attributes[o++] = uv[i * 2 + k];
        }
        const weights = [...(normal ? [wNormal, wNormal, wNormal] : []), ...(uv ? [wUv, wUv] : [])];
        const [simplified] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(indices.getArray()),
          position, 3, attributes, stride, weights, null, 0, error, ['ErrorAbsolute']);
        prim.setIndices(indices.clone().setArray(simplified));
        compactPrimitive(prim);
      }
    }
  };
}

/**
 * Texturas en KTX2 (Basis): siguen comprimidas en la memoria de video (una imagen WebP o JPEG se
 * descomprime entera al subirla) y no hace falta bajarles la resolución. Color y rugosidad en ETC1S,
 * que es liviano; los mapas de normales en UASTC, porque ETC1S les deja artefactos visibles.
 * Tope de 2048 px: el codificador no acepta 4096 × 4096 y, a la altura de los ojos, la GPU ya
 * muestrea el nivel de 2K (u otro menor) del piso de roble, el único que venía en 4K.
 */
function textureKtx2() {
  const imageDecoder = async (buffer) => {
    const { data, info } = await sharp(buffer)
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, data: new Uint8Array(data) };
  };
  const base = { imageDecoder, generateMipmap: true };
  const etc1s = { ...base, isUASTC: false, qualityLevel: 230, compressionLevel: 2 };
  const linear = { isPerceptual: false, isSetKTX2SRGBTransferFunc: false };
  return [
    ktx2({ ...etc1s, slots: /^(baseColor|emissive|sheenColor)Texture$/, isPerceptual: true, isSetKTX2SRGBTransferFunc: true }),
    ktx2({ ...etc1s, ...linear, slots: /^(metallicRoughness|occlusion|sheenRoughness)Texture$/ }),
    ktx2({ ...base, ...linear, slots: /^normalTexture$/, isUASTC: true, isNormalMap: true, needSupercompression: true, enableRDO: true, rdoQualityLevel: 4 }),
  ];
}

function exportFromBlender(blender, model, raw) {
  console.log(`\n▸ ${model.id}: exportando desde Blender (${blender})`);
  const args = ['--background', '--factory-startup', join(ROOT, model.blend), '--python-exit-code', '1'];
  if (model.rebuild) args.push('--python', join(ROOT, model.rebuild));
  args.push('--python', join(ROOT, model.script), '--', raw);
  const run = spawnSync(blender, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const log = `${run.stdout}\n${run.stderr}`;
  if (run.status !== 0 || !log.includes('EXPORT_WEB_OK')) {
    console.error(log);
    throw new Error(`Blender no pudo exportar ${model.id}`);
  }
  console.log(log.split('\n').filter((l) => l.includes('EXPORT_WEB_OK')).join('\n'));
}

async function main() {
  const blender = findBlender();
  const cacheDir = join(ROOT, '.cache', 'models');
  const outDir = join(ROOT, 'public', 'models');
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const reuse = process.argv.includes('--sin-blender');
  await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const manifest = {};

  for (const model of MODELS) {
    const raw = join(cacheDir, `${model.id}.raw.glb`);
    if (reuse && existsSync(raw)) console.log(`\n▸ ${model.id}: reusando ${raw}`);
    else exportFromBlender(blender, model, raw);

    // Optimización: piezas repetidas, vértices soldados, mallas visuales simplificadas, texturas
    // KTX2 y compresión meshopt (cuantiza y comprime).
    const doc = await io.read(raw);
    await doc.transform(dedup(), weld(), simplifyVisual(), prune({ keepLeaves: true, keepExtras: true }),
      ...textureKtx2(),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const glb = await io.writeBinary(doc);
    const hash = createHash('sha256').update(glb).digest('hex').slice(0, 10);
    const fileName = `${model.id}.${hash}.glb`;

    // Los GLB anteriores se conservan: enlaces con hash y despliegues previos siguen válidos.
    writeFileSync(join(outDir, fileName), glb);
    manifest[model.id] = { url: `/models/${fileName}`, bytes: glb.byteLength };
    console.log(`  ${kb(statSync(raw).size)} → ${kb(glb.byteLength)}  public/models/${fileName}`);
  }

  const manifestPath = join(ROOT, 'src', 'content', 'modelos.generated.json');
  const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  writeFileSync(manifestPath, JSON.stringify({ ...previous, ...manifest }, null, 2) + '\n');
  console.log(`\n✓ Manifiesto actualizado: src/content/modelos.generated.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
