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
import { installSkate } from './skate/index.js';
import { installNet } from './net/index.js';

async function boot() {
  const game = new Game(document.getElementById('game'));
  window.game = game; // handy in the console
  game.devMode = new URLSearchParams(location.search).has('dev');
  game.titleButtons = [];

  installAudio(game);
  try { installRadio(game); } catch (e) { console.error('[boot] radio failed', e); }
  await installWorld(game);

  game.cameraRig = new CameraRig(game);
  game.player = new Player(game);
  game.addSystem({ name: 'player', update: (dt) => game.player.update(dt) });
  const sp = game.world.spawn;
  game.player.spawn(sp.x, sp.z, sp.facing ?? 0);
  game.cameraRig.follow(game.player.group);

  for (const install of [installNPCs, installVehicles, installSystems, installQuests, installSkate, installProgress, installPhone, installNet]) {
    try { await install(game); } catch (e) { console.error('[boot] install failed:', install.name, e); }
  }

  game.addSystem(game.cameraRig);

  // The world's post-processing has its own grain + vignette; only show the
  // cheap CSS overlays when post-fx is off (Low graphics).
  const overlays = [document.getElementById('grain'), document.getElementById('vignette')];
  let hadPost = null;
  game.addSystem({
    name: 'overlays',
    update() {
      const post = !!game.renderFn;
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

  game.start();
  document.getElementById('loading')?.remove();

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
  const l = document.getElementById('loading');
  if (l) l.querySelector('.loading-sub').textContent = 'Something exploded while loading. Check the console (F12).';
});
