// Assets CC0, guardados localmente: el recorrido nunca depende de un CDN externo.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const destination = resolve(root, 'public/archviz');
const headers = { 'User-Agent': 'MARQ-ArchViz-local-build/1.0 (offline asset preparation)' };
const assets = [
  ['wood_floor', '4k', ['diff', 'nor_gl', 'rough']],
  ['concrete_wall_006', '2k', ['diff', 'nor_gl', 'rough']],
  ['fabric_pattern_07', '2k', ['diff', 'nor_gl', 'rough']],
  ['rooftop_day', '2k', ['hdri']],
  ['modern_arm_chair_01', '2k', ['gltf']],
  ['potted_plant_02', '2k', ['gltf']],
  // Plantas del hall en macetas altas. En 1K: se ven a uno o dos metros.
  ['anthurium_botany_01', '1k', ['gltf']],
];

async function get(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (error) { if (attempt === 2) throw error; }
  }
}

async function save(url, path) {
  await mkdir(dirname(path), { recursive: true });
  try { await access(path); } catch { await writeFile(path, await get(url)); }
  const bytes = await readFile(path);
  return { url, file: path.replace(destination, '').replaceAll('\\', '/'), bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') };
}

const manifest = [];
for (const [id, resolution, types] of assets) {
  const meta = JSON.parse((await get(`https://api.polyhaven.com/files/${id}`)).toString());
  const files = [];
  for (const type of types) {
    const aliases = type === 'diff' ? ['diff', 'diffuse', 'col_1'] : [type];
    const key = Object.keys(meta).find((key) => aliases.some((alias) => alias.toLowerCase() === key.toLowerCase()));
    const formats = meta[key]?.[resolution];
    if (!formats) throw new Error(`Falta ${id}/${type}/${resolution}; disponibles: ${Object.keys(meta)}`);
    const format = type === 'hdri' ? 'hdr' : type === 'gltf' ? 'gltf' : 'jpg';
    const entry = formats[format];
    if (!entry?.url) throw new Error(`Falta formato ${id}/${type}/${format}`);
    const base = resolve(destination, id);
    files.push(await save(entry.url, resolve(base, `${type}.${format}`)));
    for (const [relative, dependency] of Object.entries(entry.include ?? {})) {
      const target = resolve(base, relative);
      if (!target.startsWith(base + '/'.replace('/', process.platform === 'win32' ? '\\' : '/'))) throw new Error('Ruta externa en asset');
      files.push(await save(dependency.url, target));
    }
  }
  manifest.push({ id, resolution, source: `https://polyhaven.com/a/${id}`,
    license: 'CC0-1.0', licenseUrl: 'https://polyhaven.com/license', files });
  console.log(`${id}: ${files.length} archivos, ${(files.reduce((n, f) => n + f.bytes, 0) / 1048576).toFixed(1)} MB`);
}
await writeFile(resolve(destination, 'sources.json'), JSON.stringify(manifest, null, 2) + '\n');
