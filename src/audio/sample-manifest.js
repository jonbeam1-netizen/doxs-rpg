// The owner's own recorded sounds (used with permission). Single source of truth:
//   [group, file under assets/sfx/, original source it was copied/converted from]
// To veto a sound: delete its line here (and the file under assets/sfx/). A group with no
// files left simply falls back to the synthesized sound it replaced (src/audio/samples.js).
// Unity WAVs were trimmed of silence, level-matched per group and written as 16-bit mono WAV
// (22.05 kHz when they have no content above 11 kHz, else 44.1 kHz). The skate MP3s are byte copies.
const U = 'C:/Unity Projects/FoD Game/Assets/Claude Created Assets/Sounds/Resources/Sounds/';
const SK = 'C:/Users/jonbe/OneDrive/Desktop/SKATE HTML/sounds/';
const AR = 'C:/Unity Projects/FoD Game/Assets/ARPG Effects/Sound/';

export const SAMPLE_FILES = [
  // ---- punches / hits
  ['hit', 'combat/hit_1.wav', U + 'hit_1.wav'],
  ['hit', 'combat/hit_2.wav', U + 'hit_2.wav'],
  ['hit', 'combat/hit_3.wav', U + 'hit_3.wav'],
  ['hit', 'combat/hit_4.wav', U + 'hit_4.wav'],
  ['hit_crit', 'combat/hit_crit_1.wav', U + 'hit_crit_1.wav'],
  ['hit_crit', 'combat/hit_crit_2.wav', U + 'hit_crit_2.wav'],
  ['hit_crit', 'combat/hit_crit_3.wav', U + 'hit_crit_3.wav'],
  ['swing', 'combat/swing_1.wav', U + 'swing_1.wav'],
  ['swing', 'combat/swing_2.wav', U + 'swing_2.wav'],
  ['swing', 'combat/swing_3.wav', U + 'swing_3.wav'],
  ['swing', 'combat/swing_4.wav', U + 'swing_4.wav'],
  ['slam', 'combat/slam_1.wav', U + 'slam_1.wav'],
  ['slam', 'combat/slam_2.wav', U + 'slam_2.wav'],
  ['slam', 'combat/slam_3.wav', U + 'slam_3.wav'],
  ['shield_block', 'combat/shield_block_1.wav', U + 'shield_block_1.wav'],
  ['shield_block', 'combat/shield_block_2.wav', U + 'shield_block_2.wav'],
  ['shield_block', 'combat/shield_block_3.wav', U + 'shield_block_3.wav'],
  // ---- player / npc hurt
  ['hero_ouch', 'voice/hero_ouch_1.wav', U + 'hero_ouch_1.wav'],
  ['hero_ouch', 'voice/hero_ouch_2.wav', U + 'hero_ouch_2.wav'],
  ['hero_ouch', 'voice/hero_ouch_3.wav', U + 'hero_ouch_3.wav'],
  ['hero_ouch', 'voice/hero_ouch_4.wav', U + 'hero_ouch_4.wav'],
  ['hero_ouch', 'voice/hero_ouch_5.wav', U + 'hero_ouch_5.wav'],
  ['hero_ouch', 'voice/hero_ouch_6.wav', U + 'hero_ouch_6.wav'],
  ['hurt', 'voice/hurt_1.wav', U + 'hurt_1.wav'],
  ['hurt', 'voice/hurt_2.wav', U + 'hurt_2.wav'],
  ['hurt', 'voice/hurt_3.wav', U + 'hurt_3.wav'],
  ['heartbeat', 'voice/heartbeat_1.wav', U + 'heartbeat_1.wav'],
  ['heartbeat', 'voice/heartbeat_2.wav', U + 'heartbeat_2.wav'],
  // ---- footsteps
  ['step', 'steps/step_1.wav', U + 'step_1.wav'],
  ['step', 'steps/step_2.wav', U + 'step_2.wav'],
  ['step', 'steps/step_3.wav', U + 'step_3.wav'],
  ['step', 'steps/step_4.wav', U + 'step_4.wav'],
  ['mstep_light', 'steps/mstep_light_1.wav', U + 'mstep_light_1.wav'],
  ['mstep_light', 'steps/mstep_light_2.wav', U + 'mstep_light_2.wav'],
  ['mstep_light', 'steps/mstep_light_3.wav', U + 'mstep_light_3.wav'],
  ['mstep_light', 'steps/mstep_light_4.wav', U + 'mstep_light_4.wav'],
  ['mstep_heavy', 'steps/mstep_heavy_1.wav', U + 'mstep_heavy_1.wav'],
  ['mstep_heavy', 'steps/mstep_heavy_2.wav', U + 'mstep_heavy_2.wav'],
  ['mstep_heavy', 'steps/mstep_heavy_3.wav', U + 'mstep_heavy_3.wav'],
  ['land', 'steps/land.wav', U + 'land.wav'],
  ['jump', 'steps/jump.wav', U + 'jump.wav'],
  // ---- shop doors
  ['door_open', 'doors/door_open_1.wav', U + 'door_open_1.wav'],
  ['door_open', 'doors/door_open_2.wav', U + 'door_open_2.wav'],
  ['door_close', 'doors/door_close_1.wav', U + 'door_close_1.wav'],
  ['door_close', 'doors/door_close_2.wav', U + 'door_close_2.wav'],
  ['door_creak', 'doors/door_creak_1.wav', U + 'door_creak_1.wav'],
  ['door_creak', 'doors/door_creak_2.wav', U + 'door_creak_2.wav'],
  ['door_creak', 'doors/door_creak_3.wav', U + 'door_creak_3.wav'],
  // ---- money / items / ui
  ['coins', 'money/coins_1.wav', U + 'coins_1.wav'],
  ['coins', 'money/coins_2.wav', U + 'coins_2.wav'],
  ['coins', 'money/coins_3.wav', U + 'coins_3.wav'],
  ['coin_drop', 'money/coin_drop_1.wav', U + 'coin_drop_1.wav'],
  ['coin_drop', 'money/coin_drop_2.wav', U + 'coin_drop_2.wav'],
  ['coin_drop', 'money/coin_drop_3.wav', U + 'coin_drop_3.wav'],
  ['buy', 'money/buy_1.wav', U + 'buy_1.wav'],
  ['buy', 'money/buy_2.wav', U + 'buy_2.wav'],
  ['sell', 'money/sell_1.wav', U + 'sell_1.wav'],
  ['sell', 'money/sell_2.wav', U + 'sell_2.wav'],
  ['item_pickup', 'items/item_pickup_1.wav', U + 'item_pickup_1.wav'],
  ['item_pickup', 'items/item_pickup_2.wav', U + 'item_pickup_2.wav'],
  ['item_pickup', 'items/item_pickup_3.wav', U + 'item_pickup_3.wav'],
  ['drink', 'items/drink_1.wav', U + 'drink_1.wav'],
  ['drink', 'items/drink_2.wav', U + 'drink_2.wav'],
  ['drink', 'items/drink_3.wav', U + 'drink_3.wav'],
  ['heal', 'items/heal_1.wav', U + 'heal_1.wav'],
  ['heal', 'items/heal_2.wav', U + 'heal_2.wav'],
  ['crate', 'items/crate_1.wav', U + 'crate_1.wav'],
  ['crate', 'items/crate_2.wav', U + 'crate_2.wav'],
  ['crate', 'items/crate_3.wav', U + 'crate_3.wav'],
  ['sack', 'items/sack_1.wav', U + 'sack_1.wav'],
  ['sack', 'items/sack_2.wav', U + 'sack_2.wav'],
  ['ui_click', 'ui/ui_click_1.wav', U + 'ui_click_1.wav'],
  ['ui_click', 'ui/ui_click_2.wav', U + 'ui_click_2.wav'],
  ['ui_click', 'ui/ui_click_3.wav', U + 'ui_click_3.wav'],
  ['ui_click', 'ui/ui_click_4.wav', U + 'ui_click_4.wav'],
  ['level_up', 'ui/level_up_1.wav', U + 'level_up_1.wav'],
  ['level_up', 'ui/level_up_2.wav', U + 'level_up_2.wav'],
  // ---- weather
  ['wind_gust', 'weather/wind_gust_1.wav', U + 'wind_gust_1.wav'],
  ['wind_gust', 'weather/wind_gust_2.wav', U + 'wind_gust_2.wav'],
  ['lightning_boom', 'weather/lightning_boom_1.wav', U + 'lightning_boom_1.wav'],
  ['lightning_boom', 'weather/lightning_boom_2.wav', U + 'lightning_boom_2.wav'],
  ['rain_loop', 'weather/rain_loop.wav', AR + 'rain_loop.wav'], // 10 s seamless excerpt of the 30 s / 4.3 MB original
  // ---- skateboard (src/skate)
  ['skate_roll', 'skate/rolling.mp3', SK + 'rolling.mp3'],
  ['skate_land', 'skate/ollie_land.mp3', SK + 'ollie_land.mp3'],
  ['skate_bail', 'skate/bailing.mp3', SK + 'bailing.mp3'],
  ['skate_grind', 'skate/grind.mp3', SK + 'grind.mp3'], // copied for later (no grinds yet)
];
