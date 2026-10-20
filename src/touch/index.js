// Mobile & gamepad controls. Both feed game.input (keys / mouse buttons / look
// deltas) exactly like a keyboard and mouse would, so every module keeps working.
//   game.touch    TouchControls  (enabled, toggle(), setEnabled(on))
//   game.gamepad  GamepadControls
import { TouchControls } from './touch.js';
import { GamepadControls } from './gamepad.js';

export function installTouch(game) {
  try { game.touch = new TouchControls(game); } catch (e) { console.error('[touch] touch controls failed', e); }
  try { game.gamepad = new GamepadControls(game); } catch (e) { console.error('[touch] gamepad failed', e); }
}
