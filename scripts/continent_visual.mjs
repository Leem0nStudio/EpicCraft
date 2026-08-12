// Continent verification tour: boots offline, enters the procedural continent
// through the over-world gate, visits the kingdom capitals anchored on their
// settlement residents, and saves screenshots to tmp/cont_*.png for visual
// inspection (portal material, settlement meshes, resident NPCs, etc).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = (process.env.GAME_URL ?? 'http://localhost:5173') + '/?gfx=' + (process.env.GFX_TIER ?? 'high');
fs.mkdirSync('tmp', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (name) => page.screenshot({ path: `tmp/cont_${name}.png` });

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
const booted = await enterOfflineGame(page, { charName: 'Cartograph', settleMs: 2500 });
console.log('offline boot:', booted ? 'OK' : 'FAIL');
if (!booted) {
  console.log('PAGE ERRORS:\n' + errors.slice(0, 8).join('\n'));
  await browser.close();
  process.exit(1);
}

// god mode so continent mobs don't murder the photographer
await page.evaluate(() => {
  const p = window.__game.sim.player;
  p.maxHp = 999999; p.hp = 999999;
});

// Enter the continent through the over-world gate entity. The step-out in
// enterContinent lands us a few units past the arrival gate so the door
// trigger can't bounce us back; assert we actually crossed to the island band.
const entered = await page.evaluate(() => {
  const g = window.__game;
  const gate = [...g.sim.entities.values()].find((e) => e.templateId === 'continent_gate');
  if (!gate) return { ok: false, why: 'no continent_gate entity' };
  const p = g.sim.player;
  p.pos = { x: gate.pos.x, y: p.pos.y, z: gate.pos.z };
  p.prevPos = { ...p.pos };
  g.sim.rebucket(p);
  return { ok: g.sim.enterContinent(p.id), x: p.pos.x };
});
console.log('gate entry:', JSON.stringify(entered), entered.ok && entered.x >= 12000 ? 'OK' : 'FAIL');
await sleep(1200);
await shot('01_crossing_pull');

// 1) the landing harbour (CONTINENT_LANDING plateau + arrival portal)
await page.evaluate(() => {
  const g = window.__game;
  const p = g.sim.player;
  p.pos.x = 12000 + 30; p.pos.z = p.pos.z;
  p.facing = 0; g.input.camYaw = 0;
});
await sleep(900);
await shot('02_landing_plateau');

// 2) the return gate back to the over-world
const retGate = await page.evaluate(() => {
  const g = window.__game;
  const gate = [...g.sim.entities.values()].find((e) => e.templateId === 'continent_return');
  if (!gate) return null;
  return { x: gate.pos.x, z: gate.pos.z };
});
if (retGate) {
  await page.evaluate(({ x, z }) => {
    const g = window.__game;
    g.sim.player.pos.x = x - 6; g.sim.player.pos.z = z;
    g.sim.player.facing = 0; g.input.camYaw = 0;
  }, retGate);
  await sleep(900);
  await shot('03_return_gate');
} else {
  console.log('return gate: MISSING');
}

// 3) each kingdom capital, anchored on its resident elder (by biome role)
const elders = await page.evaluate(() => {
  const g = window.__game;
  return [...g.sim.entities.values()]
    .filter((e) => e.templateId && e.templateId.startsWith('cont_elder_'))
    .map((e) => ({ id: e.templateId, x: e.pos.x, z: e.pos.z, name: e.name }));
});
console.log('settlement elders:', JSON.stringify(elders));
let capIdx = 0;
for (const elder of elders) {
  capIdx++;
  await page.evaluate(({ x, z }) => {
    const g = window.__game;
    const p = g.sim.player;
    p.pos.x = x - 14; p.pos.z = z - 2;
    p.facing = Math.atan2(x - (x - 14), z - (z - 2)) - 0.4;
    g.input.camYaw = p.facing;
  }, elder);
  await sleep(1000);
  await shot(`04_capital_${capIdx}_${elder.id.replace('cont_elder_', '')}`);
}

// 4) one innkeeper and one guard in the first capital
const innkeep = await page.evaluate(() => {
  const g = window.__game;
  return [...g.sim.entities.values()]
    .filter((e) => e.templateId && e.templateId.startsWith('cont_innkeep_'))
    .map((e) => ({ x: e.pos.x, z: e.pos.z, name: e.name }))[0] ?? null;
});
if (innkeep) {
  await page.evaluate(({ x, z }) => {
    const g = window.__game;
    g.sim.player.pos.x = x - 5; g.sim.player.pos.z = z;
    g.sim.player.facing = 0; g.input.camYaw = 0;
  }, innkeep);
  await sleep(900);
  await shot('05_innkeeper');
}
const guard = await page.evaluate(() => {
  const g = window.__game;
  return [...g.sim.entities.values()]
    .filter((e) => e.templateId && e.templateId.startsWith('cont_guard_'))
    .map((e) => ({ x: e.pos.x, z: e.pos.z, name: e.name }))[0] ?? null;
});
if (guard) {
  await page.evaluate(({ x, z }) => {
    const g = window.__game;
    g.sim.player.pos.x = x - 5; g.sim.player.pos.z = z;
    g.sim.player.facing = 0; g.input.camYaw = 0;
  }, guard);
  await sleep(900);
  await shot('06_guard');
}

// 5) a continent camp (own biome mob spawners) for the wildlife view
const camp = await page.evaluate(() => {
  const g = window.__game;
  const mob = [...g.sim.entities.values()].find((e) => e.kind === 'mob' && e.pos.x >= 12000);
  if (!mob) return null;
  return { x: mob.pos.x, z: mob.pos.z };
});
if (camp) {
  await page.evaluate(({ x, z }) => {
    const g = window.__game;
    g.sim.player.pos.x = x - 12; g.sim.player.pos.z = z;
    g.sim.player.facing = 0; g.input.camYaw = 0;
  }, camp);
  await sleep(900);
  await shot('07_camp_wildlife');
} else {
  console.log('continent mob: NONE in range (camps spawn on entry south of landed spot?)');
}

// 6) the quest giver gossip: open the elder dialog to show the resident quest
const gossip = await page.evaluate(() => {
  const g = window.__game;
  const elder = [...g.sim.entities.values()].find((e) => e.templateId && e.templateId.startsWith('cont_elder_'));
  if (!elder) return false;
  g.sim.player.pos.x = elder.pos.x - 2; g.sim.player.pos.z = elder.pos.z - 1;
  return true;
});
if (gossip) {
  await sleep(400);
  await page.keyboard.press('f');
  await sleep(500);
  await shot('08_elder_gossip');
  const questOptions = await page.evaluate(() => document.querySelectorAll('#quest-dialog .qd-list-item').length);
  console.log('elder quest options:', questOptions);
  await page.keyboard.press('Escape');
}

console.log(errors.length ? 'PAGE ERRORS:\n' + errors.slice(0, 8).join('\n') : 'no page errors');
await browser.close();