// Convierte los modelos de Blender (modelos/) en GLB optimizados para la web (public/models/).
//
//   npm run model:build
//
// Necesita Blender 4.5 LTS. Se busca en BLENDER_PATH, en C:\Users\<usuario>\tools\blender-4.5.*
// o en el PATH del sistema.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, weld, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { MeshoptEncoder } from 'meshoptimizer';

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

async function main() {
  const blender = findBlender();
  const cacheDir = join(ROOT, '.cache', 'models');
  const outDir = join(ROOT, 'public', 'models');
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const manifest = {};

  for (const model of MODELS) {
    const raw = join(cacheDir, `${model.id}.raw.glb`);
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

    // Optimización: piezas repetidas, vértices soldados y compresión meshopt (cuantiza y comprime).
    const doc = await io.read(raw);
    await doc.transform(dedup(), weld(), prune({ keepLeaves: true, keepExtras: true }),
      textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88 }),
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
