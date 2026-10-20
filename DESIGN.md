# Dox's RPG — Design & Module Contracts

A grimy 3D stick-figure life-sim RPG in the spirit of Stick RPG 2: start broke in the slums of the city of
**Rotwell**, work jobs, study, lift, fight, gamble, deal, buy cars and houses, climb faction storylines, and
reach one of several endings. Friends can join over a link and play **co-op** in the same city.

All names, writing, art and the map are **original** — we copy the *genre and feature set*, never Stick RPG's
actual text, characters, names or assets.

## Tone
- Crude, raunchy, dark comedy: swearing, innuendo, gross-out jokes, sleazy characters, cynical satire.
- Keep it R-rated comedy, not porn: no explicit sex acts, nothing sexual involving minors, no slurs/hate.
- Drugs are fictional, cartoonish street products (made-up names) used as a trading mechanic.
- The look is **grim**: overcast, smoggy, desaturated, grime on everything, rust, puddles, flickering lights.

## Tech rules (everyone)
- Static site, **no build step**, plain ES modules. Must run from GitHub Pages and `python -m http.server`.
- Import three via the importmap: `import * as THREE from 'three'` and `'three/addons/...'` (three r160).
  PeerJS is loaded globally as `window.Peer`. **Do not add other libraries.**
- Paths are relative (GitHub Pages serves under `/doxs-rpg/`). Never use absolute `/src/...` URLs.
- No image/audio files needed; textures are procedural (`src/core/materials.js`). Sound, if any, via WebAudio synthesis.
- Performance budget: 60 fps on a mid laptop. Merge static geometry / use InstancedMesh, share materials and
  geometries, cull far NPCs, keep draw calls < ~1500 and shadows to one directional light.
- Only touch files you own (see Ownership). If you need a change in someone else's file, use the API below or
  note it in your final report — don't edit it.
- Persist only plain JSON inside `game.state.p` (saved to localStorage).
- Wrap risky code so one failure doesn't kill the frame; never throw out of `update()` repeatedly.
- Dev URL: `http://localhost:8731/?dev=1` skips the title screen. `window.game` is the Game object.

## Controls
WASD move · Shift run · Space jump (handbrake in cars) · Mouse look (click to lock, or right-drag) · ←/→ turn camera ·
Wheel zoom · LMB attack/shoot · Q switch weapon · E interact · F enter/exit vehicle · Tab character sheet ·
J quest log · M city map · T co-op chat · Esc close/pause · 1-9 dialog options.
(Each owner implements their keys: combat=LMB/Q, vehicles=F, quests=J, world=M, net=T.)

## The Game object (`src/core/game.js`)
```
game.scene, game.camera, game.renderer      THREE objects
game.bus        EventBus: on(evt, fn) -> off, once, emit(evt, data)
game.input      isDown(code), wasPressed(code), mouseDown(b), mouseClicked(b), mouse.{dx,dy,wheel}, releasePointer()
game.time       total (min), day, hour, minute, isNight, daylight(0..1), label(), isBetween(h1,h2),
                advance(minutes)  <- activities skip time with this; minutesUntil(hour)
game.state      .p = player save data (see src/core/state.js defaultPlayer)
                addMoney(n, reason), spend(n) -> bool, canAfford(n), addStat(stat, n, source), useEnergy(n) -> bool,
                damage(n, source), heal(n), addXP(n), addItem/removeItem/hasItem/itemCount, addDrug/drugCount/totalDrugs,
                setFlag/getFlag, addHeat(n), save(silent), load()
game.physics    addBox(minX,minZ,maxX,maxZ,{height,tag,data}), addRect(cx,cz,w,d,opts), removeBox(b),
                resolveCircle(x,z,r) -> {x,z,hit,box}, raycast(x1,z1,x2,z2,step,minHeight) -> fraction, pointBlocked(x,z),
                query(box), setBounds(...)
game.interact   add({id, x, z, radius, prompt, onInteract(game), enabled?(game), getPos?()}), remove(id)
game.locations  register(type, handler(game, loc)), add(loc), get(id), ofType(type), enter(loc), list
game.ui         dialog({title, speaker, text|html, options:[{label, hint, disabled, keepOpen, onSelect}]}) -> Promise<i|null>
                openPanel({title, body, width, closable, onClose}) -> {el, body, close()}
                confirm(text) -> Promise<bool>, promptNumber({title,text,max,min}) -> Promise<n|null>
                toast(html, kind='info'|'good'|'bad'|'money'|'stat', ms), bigText(title, sub, ms)
                setHud(slot, html) slots: 'district','heat','weapon','vehicle','extra'; setPrompt(html)
                menuButtons.push({label, onClick}), sheetSections.push(game => html), minimap (canvas #minimap)
                isBlocking(), closeAll()
game.net        NetBase facade (src/core/net-base.js): connected, isHost, isClient, isAuthority, localId,
                remotePlayers Map, on(type, fn(msg, fromId)), broadcast(msg), sendToHost(msg), sendTo(id,msg)
game.player     Player: group, pos, facing, speed, vehicle, dead, moveLocked, aiming, faceOverride, speedMult,
                swingStyle, model (stickman API), spawn(x,z,facing), applyLook(look)
                NOTE: the model/group is rebuilt on 'look:change' / 'state:reset' — always read
                game.player.group / game.player.model fresh (don't cache them), and re-attach anything
                you parented to the model (e.g. weapon meshes) on 'player:model-rebuilt' {model}.
game.cameraRig  yaw, pitch, dist, follow(obj,{height,dist}), shake(amount,time), forward
game.audio      { ctx (AudioContext|null until first user gesture), sfx (GainNode — connect your SFX here so
                the volume setting applies), volume, setVolume(v) }   (src/audio/ambience.js)
game.controlsLocked  true while title/dialogs are open — don't move/attack then.
game.addSystem({ name, init?(game), update?(dt, game) })   per-frame hook
game.renderFn   optional (dt)=>void to replace renderer.render (post-processing)
game.titleButtons.push({ label, onClick(game, name, begin) })   extra title-screen buttons
```
Module slots set at install time: `game.world`, `game.npcs`, `game.combat`, `game.vehicles`, `game.market`,
`game.items`, `game.jobs`, `game.quests`.

Shared helpers: `src/core/util.js` (clamp, lerp, rand, randInt, pick, chance, fmtMoney, esc, mulberry32, angleLerp,
weightedPick), `src/core/materials.js` (grimeTexture, grimMaterial, signTexture, paintGrime),
`src/entities/stickman.js` (createStickman, HAT_TYPES).

Install order (main.js): world → player/camera → npc → vehicles → systems → quests → net → camera update.
Each `src/<module>/index.js` exports `async function install<Name>(game)`.

## World (src/world) — `game.world`
```
size, bounds {minX,maxX,minZ,maxZ}, spawn {x,z,facing}
districtAt(x, z) -> districtId              (ids in src/data/locations.js DISTRICTS)
randomSidewalkPoint(districtId?) -> {x,z}   walkable, outside buildings
randomRoadPoint(districtId?) -> {x,z,dir}   on a road lane (dir = heading radians)
roads: { nodes:[{x,z}], edges:[[a,b]] }     road graph for traffic & pathing
nearestRoadNode(x,z) -> index
```
Every LOCATIONS entry gets a building with a readable sign and a door; the world calls
`game.locations.add({...entry, x, z, doorX, doorZ})`. The whole map is flat (y=0 walkable everywhere);
hills/water are visual only at the edges (water is blocked with physics boxes).

## Events (emit what you own, listen to anything)
| event | data | emitted by |
|---|---|---|
| `game:start` | {isNew, name, joinId, dev} | core |
| `state:change` / `state:reset` | key / {isNew} | core |
| `stat:gain` | {stat, amount, source} | core |
| `money:change` | {amount, reason} | core |
| `player:damaged` / `player:died` / `player:levelup` | | core |
| `heat:change` | {heat, before} | core |
| `time:hour` / `time:day` / `time:change` | | core |
| `location:enter` | loc | core |
| `ui:open` / `ui:close` | | core |
| `job:worked` / `job:promoted` / `job:hired` | {jobId, rank, pay} | systems |
| `item:bought` / `item:used` | {id, qty} | systems |
| `drug:bought` / `drug:sold` | {drugId, qty, price, district} | systems |
| `home:bought` / `home:slept` | {id} | systems |
| `casino:result` | {game, amount} (negative = lost) | systems |
| `course:completed` | {courseId} | systems |
| `date:result` | {success, npc} | systems |
| `npc:killed` | {npc, byPlayer} | npc |
| `npc:talk` | {npc} | npc |
| `brawl:won` / `brawl:lost` | {id, label} | npc |
| `player:arrested` / `player:respawned` | | npc |
| `car:bought` / `car:entered` / `car:exited` / `car:destroyed` | {carId, uid} | vehicles |
| `race:won` / `race:lost` | {bet} | vehicles |
| `quest:started` / `quest:step` / `quest:completed` | {id, step} | quests |
| `ending:reached` | {id} | quests |

## NPCs & combat (src/npc) — `game.npcs`, `game.combat`
```
npcs.spawn(spec) -> npc     spec: { id?, kind:'ped'|'thug'|'cop'|'dealer'|'static'|'drunk'|'hobo'|'gang',
                             x, z, facing, name, color, hat, hatColor, hp, weapon, faction, hostile:bool,
                             wander:bool, networked:bool, onTalk?(game, npc), talkPrompt, persistent:bool, data }
npc: { id, kind, name, pos (Vector3), group, hp, maxHp, dead, hostile, data, remove() }
npcs.get(id), npcs.remove(npcOrId), npcs.list(), npcs.near(x,z,r)
npcs.damage(id, amount, attackerId)   (forwards to host when not authority)
npcs.serialize() / npcs.applySnapshot(snap)   (networked NPCs only)
combat.startBrawl({ x, z, count, kind:'drunk'|'thug'|'gang'|'fighter', label, tier, onWin(game), onLose(game) }) -> id
combat.equip(weaponId), combat.weapon (current def)
```
Dealers: one+ dealer NPC per district; talking calls
`game.locations.enter({ id:'dealer_'+district, type:'dealer', name, district })`.
Death: on `player:died` → wake up at St. Mercy's, lose a chunk of cash (or at home if you have insurance flag).
Police: heat from crimes; cops chase at heat ≥ 1; arrest → fine/jail time, drugs confiscated.

## Vehicles (src/vehicles) — `game.vehicles`, data in `src/data/cars.js`
```
CARS[id] = { name, price, topSpeed, accel, handling, kind:'bike'|'car'|'truck'|'moto', color, seats, desc }
vehicles.spawnOwned(uid) / vehicles.list / vehicles.current
vehicles.createCarMesh(carId, color) -> Group      (used by net for remote players' cars)
vehicles.giveCar(carId, color) -> uid             (used by quests / systems rewards)
```

## Systems (src/systems) — `game.market`, `game.items`, `game.jobs`
```
items.name(id), items.use(id), ITEMS in src/data/items.js
market.name(drugId), market.price(drugId, district), DRUGS in src/data/drugs.js
jobs.current(), JOBS in src/data/jobs.js
```

## Quests (src/quests) — `game.quests`
```
quests.start(id), quests.step(id), quests.setStep(id, n), quests.complete(id), quests.isActive(id), quests.isDone(id)
quests.openLog()   (J key)
```
Also owns `src/data/barks.js` (`bark(kind)` one-liners).

## Co-op (src/net)
- Host-authoritative over the clock and over `networked:true` NPCs. Each player keeps their own character,
  money and save (localStorage), so everyone progresses individually in a shared world.
- Ambient pedestrians/traffic are local-only cosmetics on each client.
- Messages are small JSON objects `{ t: 'type', ... }`. Each module defines and handles its own message types via
  `game.net.on(type, fn)` / `game.net.broadcast(...)`; the net module provides transport, lobby, remote player
  rendering, time sync, chat, and the "give money" feature.
- Invite links: `https://<user>.github.io/doxs-rpg/?join=<hostPeerId>`.

## Ownership
| Area | Files |
|---|---|
| Core (lead) | index.html, styles.css, src/main.js, src/core/*, src/ui/*, src/player/*, src/entities/stickman.js, src/data/locations.js, src/data/weapons.js |
| World | src/world/** |
| NPC/Combat/Police | src/npc/** |
| Vehicles | src/vehicles/**, src/data/cars.js |
| Systems/Economy | src/systems/**, src/data/items.js, src/data/drugs.js, src/data/jobs.js, src/data/courses.js |
| Quests/Story | src/quests/**, src/data/barks.js, src/data/quests.js |
| Co-op | src/net/**, README.md |

## Round 2 additions
- `game.perks` (src/progress): `has(id)`, `mult(key)` → number (1 = no bonus). Keys: meleeDamage, gunDamage,
  shopDiscount, drugPrice, heatDecay, jobPay, energyCost, carSpeed, heistTake, lockpick, dateChance. P key panel.
  Achievements in src/progress/achievements.js. Save: `p.progress`, `p.background`.
- `game.phone` (src/phone, O key) and `game.radio` (src/audio/radio.js, `,` `.` change station). Save: `p.phone`.
- Character creator (src/ui/creator.js): look = { color, skin, build, hat, hatColor }. Use
  `createStickman(lookToStickman(look))` anywhere you build a player-looking stickman.
- Skateboard (src/skate): G mount, W push, Space ollie, left click kickflip. Unlocked via Skidmark Kev's quest
  (level 3+). Save: `p.skate`. Net message `{t:'skate', on, board, trick}`.
- Keys in use: WASD Shift Space E F G Q R H N O P V X I B C Z Y Tab J M T Esc F1 1-9 , . arrows, LMB (tap combo/hold heavy), RMB tap or B kick, C block/parry, Z roll, Y quick-heal, MMB tap lock-on, MMB/RMB drag camera. Heists: V mask, X drop bag.
- `?dev` sessions are silent and never save; `?mute` sessions are silent but DO save (use them to test save/load on a dev origin).
- `game.police` (src/npc/police.js + src/vehicles/police.js): wanted level, cruisers (2+ stars), roadblocks (4),
  helicopter (5), line-of-sight evasion. Net: police:snap, police:hit, police:steal, police:tire, police:heat.
- Ambient crowd (src/npc/crowd.js): sidewalk-only peds, seated/idle/leaning/hobo behaviors via world.seats/wallSpots.
- Pacing (balance pass): guided 9-step prologue; each main path ~60-70 min from a new game. Quest steps support
  `marker`, `finale`, `xp` options. Goals view: src/quests/goals.js. Stat-threshold unlock toasts: src/progress/milestones.js.
  Level-up: +1 STR/INT/CHA, energy refill. Post-ending: keep everything, +2 perk points, title.
- Combat (round 3): combos, heavy, kick, block/parry, roll, lock-on, hit-stop via game.timeScale (wraps clock.getDelta).
  Boss spec: startBrawl({..., boss: true | {name, hp, moves:['combo','charge','slam','block','summon'], weapon, scale, color, hat, dmg}}).
- Traffic signals: game.world.signals (src/world/signals.js); AI cars and pedestrians obey them.
- Balance (round 5): heist guards take turns/volley with telegraph glints; Terry sells a used 9mm ($450) + ammo;
  dating first date after 4 interactions (progress shown); stat gains x1.4 below 15, diminishing past 25,
  soreness cap ~2 pts per sleep; fights/heists/dates also raise stats.
- Audio (round 5): src/audio/mixer.js buses (sfx/ambience/music/ui) + limiter; game.audio.play3D(preset|fn, x, z, opts).
- Minigames (src/systems/minigame.js + mg/): job shifts and training are 15-45s skill games (grade F-S; pay 0.6-1.5x,
  skip = 0.8x). Event 'minigame:result' {id, grade, score, skipped, newBest}. Save: p.mg.
- Co-op features (src/coop): ride shotgun (F at a friend's passenger door; LMB shoots), crew panel (K) with shared
  pot/pins/pings (L), friend drag races, consensual sparring, crew bonus +10% within 40 m.
  Net: ride:*, crew:*, drag:*, spar:*.
- Economy/late game and atmosphere passes: see commit history (round 7).
