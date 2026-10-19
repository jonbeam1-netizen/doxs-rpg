import * as THREE from 'three';
import { LOCATIONS } from '../data/locations.js';

// PLACEHOLDER — the world agent replaces this with the full city.
export async function installWorld(game) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x3a3733 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  game.scene.add(ground);
  game.scene.add(new THREE.HemisphereLight(0xbfb8a8, 0x2a2420, 1.2));
  const sun = new THREE.DirectionalLight(0xffe8c0, 1.5);
  sun.position.set(50, 80, 30);
  game.scene.add(sun);
  game.physics.setBounds(-200, -200, 200, 200);
  LOCATIONS.forEach((l, i) => {
    const x = -150 + (i % 8) * 40, z = -150 + Math.floor(i / 8) * 40;
    const m = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 14), new THREE.MeshStandardMaterial({ color: 0x5b5650 }));
    m.position.set(x, 5, z);
    game.scene.add(m);
    game.physics.addRect(x, z, 14, 14, { height: 10 });
    game.locations.add({ ...l, x, z, doorX: x, doorZ: z + 8.5 });
  });
  game.world = {
    size: 400,
    bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
    spawn: { x: 0, z: 0, facing: 0 },
    districtAt: () => 'downtown',
    randomSidewalkPoint: () => ({ x: (Math.random() - 0.5) * 300, z: (Math.random() - 0.5) * 300 }),
    randomRoadPoint: () => ({ x: (Math.random() - 0.5) * 300, z: (Math.random() - 0.5) * 300 }),
    roads: { nodes: [], edges: [] },
  };
}
