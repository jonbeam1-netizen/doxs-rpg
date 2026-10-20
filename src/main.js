import { Game } from './core/game.js';
import { Player, CameraRig } from './player/player.js';
import { showTitle } from './ui/title.js';
import { installAudio } from './audio/ambience.js';
import { installRadio } from './audio/radio.js';
import { installProgress } from './progress/index.js';
import { installPhone } from './phone/index.js';
import { installWorld } from './world/index.js';
import { installNPCs } from './npc/index.js';
import { installVehicles } from './vehicles/index.js';
import { installSystems } from './systems/index.js';
import { installQuests } from './quests/index.js';
import { installHeists } from './heists/index.js';
import { installSkate } from './skate/index.js';
import { installIsland } from './island/index.js';
import { installInteract } from './interact/index.js';
import { installLife } from './life/index.js';
import { installNet } from './net/index.js';

// ---- loading screen plumbing (the bar itself lives in index.html: window.__loading)
const bootT0 = performance.now();
const bootTimes = {};
function loadProgress(f, label) { try { window.__loading?.progress(f, label); } catch { /* cosmetic */ } }
// Let the browser paint the loading bar between heavy steps. rAF alone never fires in a hidden
// tab, so a short timeout backs it up.
function nextFrame() {
  const t = performance.now();
  return new Promise((resolve) => {
    let done = false;
    const go = () => { if (!done) { done = true; bootTimes.yields = (bootTimes.yields ?? 0) + Math.round(performance.now() - t); resolve(); } };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 20);
  });
}
const INSTALL_LABELS = {
  installNPCs: 'hiring pedestrians, thugs and cops', installVehicles: 'hot-wiring the traffic', installSystems: 'opening the shops, bars and banks',
  installQuests: 'writing everybody\'s problems', installIsland: 'towing Blackwater Isle into place', installHeists: 'casing the joints',
  installSkate: 'waxing the curbs', installProgress: 'printing participation trophies', installPhone: 'cracking your phone screen',
  installInteract: 'leaving trash everywhere', installNet: 'running cables to your friends',
};

async function boot() {
  loadProgress(0.35, 'starting the engine');
  const game = new Game(document.getElementById('game'));
  game.bootTimes = bootTimes;
  bootTimes.modules = Math.round(bootT0 - (window.__loading?.t0 ?? 0));
  window.game = game; // handy in the console
  import('./touch/index.js').then((m) => m.installTouch(game)).catch((e) => console.error('[boot] touch/gamepad controls failed', e));
  game.devMode = new URLSearchParams(location.search).has('dev');
  game.titleButtons = [];

  installAudio(game);
  try { installRadio(game); } catch (e) { console.error('[boot] radio failed', e); }
  let tStep = performance.now();
  await installWorld(game, { progress: (f, label) => loadProgress(0.36 + f * 0.44, label), nextFrame });
  bootTimes.world = Math.round(performance.now() - tStep);

  game.cameraRig = new CameraRig(game);
  game.player = new Player(game);
  game.addSystem({ name: 'player', update: (dt) => game.player.update(dt) });
  const sp = game.world.spawn;
  game.player.spawn(sp.x, sp.z, sp.facing ?? 0);
  game.cameraRig.follow(game.player.group);

  const installs = [installNPCs, installVehicles, installSystems, installQuests, installIsland, installHeists, installSkate, installProgress, installPhone, installInteract, installLife, async function installPresent(g) { return (await import('./present/index.js')).installPresent(g); }, async function installCoop(g) { return (await import('./coop/index.js')).installCoop(g); }, installNet];
  for (let i = 0; i < installs.length; i++) {
    const install = installs[i];
    loadProgress(0.8 + (i / installs.length) * 0.16, INSTALL_LABELS[install.name] ?? 'bolting on ' + install.name.replace(/^install/, '').toLowerCase());
    await nextFrame();
    tStep = performance.now();
    try { await install(game); } catch (e) { console.error('[boot] install failed:', install.name, e); }
    bootTimes[install.name.replace(/^install/, '').toLowerCase()] = Math.round(performance.now() - tStep);
  }

  game.addSystem(game.cameraRig);

  // The world's post-processing has its own grain + vignette; only show the
  // cheap CSS overlays when post-fx is off (Low graphics).
  const overlays = [document.getElementById('grain'), document.getElementById('vignette')];
  let hadPost = null;
  game.addSystem({
    name: 'overlays',
    update() {
      const post = game.world?.postActive ?? !!game.renderFn;
      if (post === hadPost) return;
      hadPost = post;
      for (const el of overlays) el?.classList.toggle('hidden', post);
    },
  });

  // Put the player back where they saved (or at home) when a game starts.
  game.bus.on('game:start', ({ isNew }) => {
    const p = game.state.p;
    if (!isNew && p.pos) game.player.spawn(p.pos.x, p.pos.z, p.pos.facing ?? 0);
    else {
      const home = game.locations.get(p.home);
      // Face the building so the camera starts out on the street, not in a wall.
      if (home) game.player.spawn(home.doorX, home.doorZ, Math.atan2(home.x - home.doorX, home.z - home.doorZ));
      else game.player.spawn(sp.x, sp.z, sp.facing ?? 0);
    }
    game.cameraRig.yaw = game.player.facing + Math.PI;
  });

  // Autosave every real minute and at each new day.
  let saveT = 0;
  game.addSystem({
    name: 'autosave',
    update(dt) {
      if (!game.started) return;
      saveT += dt;
      if (saveT > 60) { saveT = 0; game.state.save(); }
    },
  });
  game.bus.on('time:day', () => { if (game.started) game.state.save(); });
  addEventListener('beforeunload', () => { if (game.started) game.state.save(); });

  // Compile every material's shader while the loading screen is still up (in parallel where the
  // browser supports it), so the first rendered frame doesn't freeze for a third of a second.
  loadProgress(0.97, 'mixing the paint (shaders)');
  await nextFrame();
  tStep = performance.now();
  try {
    const r = game.renderer;
    if (r.compileAsync) await Promise.race([r.compileAsync(game.scene, game.camera), new Promise((res) => setTimeout(res, 4000))]);
    else r.compile(game.scene, game.camera);
  } catch (e) { console.warn('[boot] shader warm-up skipped', e); }
  bootTimes.shaders = Math.round(performance.now() - tStep);
  // One real frame under the loading screen: uploads the visible city's buffers/textures and builds the
  // shadow + post-fx shaders, so the first frame you actually see doesn't hitch.
  loadProgress(0.99, 'hosing down the streets');
  await nextFrame();
  tStep = performance.now();
  try { game._frame(); } catch (e) { console.warn('[boot] warm-up frame failed', e); }
  bootTimes.warmFrame = Math.round(performance.now() - tStep);

  game.start();
  bootTimes.total = Math.round(performance.now() - (window.__loading?.t0 ?? 0));
  if (window.__loading) window.__loading.done();
  else document.getElementById('loading')?.remove();
  console.info('[boot] ready in', bootTimes.total, 'ms', bootTimes);

  const params = new URLSearchParams(location.search);
  if (params.has('dev')) {
    // ?dev skips the title screen: fresh character, straight into the city.
    game.state.newGame('Dev');
    game.ui.showHud(true);
    game.started = true;
    game.ui.updateHud();
    game.bus.emit('game:start', { isNew: true, name: 'Dev', dev: true });
  } else {
    showTitle(game);
  }
}

boot().catch((e) => {
  console.error(e);
  const msg = 'Something exploded while loading. Check the console (F12).';
  if (window.__loading) window.__loading.fail(msg);
  else { const l = document.getElementById('loading'); if (l) l.querySelector('.loading-sub').textContent = msg; }
});
