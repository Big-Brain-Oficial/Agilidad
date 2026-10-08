import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, '.cache/archviz-qa');
await mkdir(out, { recursive: true });
const manifest = JSON.parse(await readFile(resolve(root, 'src/content/modelos.generated.json'), 'utf8'));
const glb = await readFile(resolve(root, 'public' + manifest['torre-natalini'].url));
const jsonLength = glb.readUInt32LE(12);
const model = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
assert.ok(model.extensionsUsed.includes('EXT_meshopt_compression'));
assert.ok(model.extensionsUsed.includes('KHR_materials_transmission'));
assert.ok(model.textures.length >= 10, 'Deben conservarse los mapas PBR');
assert.ok(model.nodes.some((n) => n.name?.startsWith('PHY__')), 'Colisiones simples separadas');
assert.equal(model.nodes.filter((n) => n.name?.startsWith('VISTA__')).length, 5);
for (const mesh of model.meshes) {
  for (const primitive of mesh.primitives) {
    const material = model.materials[primitive.material];
    if (material?.normalTexture || material?.pbrMetallicRoughness?.baseColorTexture) {
      assert.notEqual(primitive.attributes.TEXCOORD_0, undefined, 'Material texturado sin UV');
    }
  }
}
await sharp(resolve(root, 'mejoras/planimetria.webp')).extract({ left: 235, top: 60, width: 180, height: 154 }).resize(900, 770).png().toFile(resolve(out, 'cotas-banos.png'));
console.log('GLB_OK', JSON.stringify({ bytes: glb.length, meshes: model.meshes.length, materials: model.materials.length, textures: model.textures.length }));

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  const failedRequests = [];
  page.on('pageerror', (error) => { errors.push(String(error)); console.log('PAGE_ERROR', String(error)); });
  page.on('console', (message) => {
    if (message.type() === 'error' && !/pointer.?lock/i.test(message.text())) errors.push(message.text());
  });
  page.on('response', (response) => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
  const base = process.env.ARCHVIZ_TEST_URL ?? 'http://127.0.0.1:3110';
  await page.goto(base + '/recorrido/torre-natalini?debug', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.marq?.state().phase === 'intro', null, { timeout: 180000 });
  console.log('INTRO_READY');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(out, '01-intro.png') });
  await page.getByRole('button', { name: 'Comenzar recorrido', exact: true }).click();
  await page.waitForFunction(() => window.marq?.state().phase === 'playing');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(out, '02-inicio-exterior.png') });
  const start = await page.evaluate(() => window.marq.state());
  assert.ok(start.pos[1] > 1 && start.pos[1] < 3, 'La visita debe empezar afuera del edificio');
  assert.equal(start.level, 0, 'El ascensor debe comenzar en planta baja');
  assert.equal(start.zona, 'exterior');
  console.log('INICIO_EXTERIOR_OK', JSON.stringify({ pos: start.pos, grounded: start.onGround }));

  // Recorre los cinco destinos usando las mismas acciones del HUD.
  for (const [label, name] of [['Estar y comedor','02-estar-alta'], ['Cocina','03-cocina'], ['Dormitorio principal','04-dormitorio'], ['Segundo dormitorio','05-segundo'], ['Balcón','06-balcon']]) {
    await page.evaluate(() => document.exitPointerLock());
    // En headless el estado de pausa no depende de la implementación de pointer lock.
    await page.evaluate(() => window.marq.state().setPhase('paused'));
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForTimeout(450);
    await page.screenshot({ path: resolve(out, name+'.png') });
    const state = await page.evaluate(() => window.marq.state());
    assert.ok(state.pos[1] > 30 && state.pos[1] < 33, `Piso válido: ${label}`);
    assert.equal(state.onGround, true, `Suelo accesible: ${label}`);
  }
  await page.evaluate(() => document.exitPointerLock());
  await page.evaluate(() => window.marq.state().setPhase('paused'));
  await page.getByLabel('Calidad', { exact: true }).selectOption('fluida');
  await page.getByLabel('Luz', { exact: true }).selectOption('tarde');
  await page.getByRole('button', { name: 'Estar y comedor', exact: true }).click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: resolve(out, '07-tarde-fluida.png') });

  // Cruza la puerta real del dormitorio; no basta con llegar mediante un destino.
  await page.evaluate(() => { window.marq.teleport(-4.16, 29.9, -5.72); window.marq.look(0); });
  await page.evaluate(() => window.marq.press('KeyW', 1200));
  const afterDoor = await page.evaluate(() => window.marq.state());
  assert.ok(afterDoor.pos[2] < -6.5, `Puerta principal bloqueada: ${afterDoor.pos}`);
  assert.ok(afterDoor.pos[1] > 31 && afterDoor.pos[1] < 32);
  console.log('CIRCULACION_OK', afterDoor.pos);

  // Continúa hasta la pared norte: no debe salir del departamento.
  await page.evaluate(() => window.marq.press('KeyW', 4000));
  const afterWall = await page.evaluate(() => window.marq.state());
  assert.ok(afterWall.pos[2] > -9.15, `El visitante atravesó el muro: ${afterWall.pos}`);
  await page.evaluate(() => document.exitPointerLock());
  await page.evaluate(() => window.marq.state().setPhase('paused'));
  await page.getByRole('button', { name: 'Acceso al edificio', exact: true }).click();
  await page.waitForTimeout(500);
  const exterior = await page.evaluate(() => window.marq.state());
  assert.ok(exterior.pos[1] < 3, 'El destino exterior debe apoyar en la vereda');
  await page.screenshot({ path: resolve(out, '08-exterior.png') });

  await writeFile(resolve(out, 'browser-report.json'), JSON.stringify({ start: start.pos, afterDoor: afterDoor.pos, afterWall: afterWall.pos, exterior: exterior.pos, errors, failedRequests }, null, 2));
  assert.deepEqual(errors, [], 'Errores del navegador');
  assert.deepEqual(failedRequests, [], 'Recursos fallidos');
  console.log('BROWSER_OK');
} catch (error) {
  if (page) {
    console.log('FAILED_STATE', await page.evaluate(() => ({ phase: window.marq?.state().phase, lockError: window.marq?.state().lockError, text: document.body.innerText.slice(-1800) })).catch(() => null));
    await page.screenshot({ path: resolve(out,'failure.png') }).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
}
