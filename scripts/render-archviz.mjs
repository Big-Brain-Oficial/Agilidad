import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const dir = join(process.env.ProgramFiles ?? 'C:/Program Files', 'Blender Foundation');
const installed = existsSync(dir) ? readdirSync(dir).sort().reverse().map((v) => join(dir,v,'blender.exe')).find(existsSync) : undefined;
const blender = process.env.BLENDER_PATH || installed || 'blender';
const result = spawnSync(blender, ['--background', '--factory-startup', join(root,'modelos/Torre_Natalini/Torre_Natalini_ArchViz.blend'), '--python-exit-code', '1', '--python', join(root,'scripts/blender/render_archviz.py')], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
