# Dox's RPG

A grimy 3D stick-figure life-sim RPG that runs in your browser. You wake up broke in the slums of **Rotwell**,
a city that smells like wet cardboard and bad decisions. Work dead-end jobs, take night classes, lift, brawl,
gamble, deal sketchy (entirely fictional) street products, buy cars and houses, climb a few shady faction
storylines, and claw your way to one of several endings. Or die in a gutter. The city doesn't care either way.

Bring friends — up to 4 people can share the same city in **co-op**.

## How to play

- Make money, raise your stats (Strength, Intelligence, Charm), keep your HP and energy up, sleep somewhere
  that isn't a bench.
- Walk up to doors and people and press **E**. Most of the game happens in those menus.
- The clock is always running. Jobs, classes and sleeping skip time. Shops close. Cops don't.

## Controls

| Key | Does |
|---|---|
| **W A S D** | Move (Shift to run, Space to jump / handbrake) |
| **Mouse** | Look (click to lock the mouse, or hold right-click and drag) · **← →** turn camera · **Wheel** zoom |
| **Left click** | Attack / shoot · **Q** switch weapon |
| **E** | Interact (doors, people, stuff) |
| **F** | Get in / out of a vehicle |
| **Tab** | Character sheet · **J** quest log · **M** city map |
| **T** | Co-op chat (`/wave`, `/dance`, `/flip`, `/players`, `/help`) |
| **Esc** | Close / pause menu · **1-9** pick dialog options |

## Co-op

1. One person is the **host**: click **Host co-op game** on the title screen (or, mid-game, open the pause menu
   with Esc → **Co-op: invite friends**).
2. Hit **Copy** and send the invite link (`…?join=doxsrpg-xxxxxx`) to up to 3 friends.
3. Friends open the link, type a name and hit **Join**. That's it.

- Works across the internet. Connections are peer-to-peer (WebRTC) and use the free public
  [PeerJS](https://peerjs.com) broker only for the initial handshake. No accounts, no servers of ours.
- Some strict networks (corporate / school / certain mobile carriers, aggressive VPNs) may block it. If a
  join times out, try another network or let someone else host.
- The host owns the clock — when someone sleeps, everybody's day jumps. Everyone keeps their **own** character,
  cash and save file, so progress follows you back to single-player.
- Pause menu extras: **Give cash to a friend**, **Teleport to a friend**, **Leave co-op**.
- If the host leaves, everyone drops back to solo with their character intact.

## Running locally

No build step, no npm, no nonsense. Serve the folder with any static server:

```
python -m http.server 8000
```

then open <http://localhost:8000/>. (Opening `index.html` straight from disk won't work — browsers block ES
modules over `file://`.) Add `?dev=1` to skip the title screen.

## GitHub Pages

Push the repo and enable Pages (Settings → Pages → deploy from branch, root folder). All paths are relative, so it
works under `https://<you>.github.io/doxs-rpg/`. Invite links point at whatever URL the host is playing on.

## Credits

Inspired by Stick RPG 2 by XGen Studios. Not affiliated. All names, writing and art in this game are original.

Built with [three.js](https://threejs.org) and [PeerJS](https://peerjs.com). No stick figures were harmed.
Several were mildly inconvenienced.
