import * as THREE from 'three';
import { EventBus } from './events.js';
import { Input } from './input.js';
import { GameState } from './state.js';
import { GameTime } from './time.js';
import { Physics } from './physics.js';
import { Interactions } from './interactions.js';
import { Locations } from './locations.js';
import { NetBase } from './net-base.js';
import { UI } from '../ui/ui.js';

// The hub every module talks to. See DESIGN.md for the full API contract.
export class Game {
  constructor(container) {
    this.container = container;
    this.bus = new EventBus();
    this.started = false;
    this.elapsed = 0;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2a2622');
    this.scene.fog = new THREE.Fog('#2a2622', 60, 420);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2500);
    this.camera.position.set(0, 8, 12);
    this.clock = new THREE.Clock();

    this.input = new Input(this);
    this.time = new GameTime(this);
    this.state = new GameState(this);
    this.physics = new Physics();
    this.ui = new UI(this);
    this.interact = new Interactions(this);
    this.locations = new Locations(this);
    this.net = new NetBase(this);

    // Filled in by modules at install time (see DESIGN.md):
    this.world = null;      // src/world
    this.player = null;     // src/player
    this.cameraRig = null;  // src/player
    this.npcs = null;       // src/npc
    this.combat = null;     // src/npc (combat)
    this.vehicles = null;   // src/vehicles
    this.market = null;     // src/systems (drugs)
    this.items = null;      // src/systems (items)
    this.jobs = null;       // src/systems (jobs)
    this.quests = null;     // src/quests

    // Optional render override (post-processing). Signature: (dt) => void
    this.renderFn = null;

    this.systems = [];
    addEventListener('resize', () => this.resize());
  }

  // True whenever the player shouldn't be steering their character.
  get controlsLocked() { return !this.started || this.ui.isBlocking(); }

  addSystem(sys) {
    this.systems.push(sys);
    try { sys.init?.(this); } catch (e) { console.error('[game] system init failed', sys.name, e); }
    return sys;
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.bus.emit('resize', { w: innerWidth, h: innerHeight });
  }

  start() {
    this.renderer.setAnimationLoop(() => this._frame());
  }

  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.elapsed += dt;
    this.time.update(dt);
    for (const s of this.systems) {
      if (!s.update) continue;
      try { s.update(dt, this); } catch (e) {
        if (!s._errLogged) { console.error('[game] system update failed', s.name, e); s._errLogged = true; }
      }
    }
    this.interact.update();
    this.input.endFrame();
    if (this.renderFn) this.renderFn(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
