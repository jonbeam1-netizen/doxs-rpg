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

Up to **4 players** (host + 3 friends) share one city over an invite link. No accounts, no install.

**Hosting**

1. Open the game (e.g. `https://<you>.github.io/doxs-rpg/`), pick or make your character and click
   **Host co-op game** on the title screen. Already playing? **Esc → Co-op: invite friends** starts hosting
   mid-game.
2. The Co-op panel shows your invite link (`…/doxs-rpg/?join=doxsrpg-xxxxxx`). Hit **Copy** and paste it to
   your friends. The panel also lists who's connected and their ping.
3. Keep your tab open (and preferably in front — browsers slow down background tabs). The game ID changes
   every time you start hosting, so send a fresh link each session.

**Joining**

Open the link, enter a name / make a character and hit **Join**. You spawn into the host's world with your
own character. If it fails you get **Try again** or **Play solo** — nothing is lost either way.

**What's shared**

- **Everyone keeps their own character, cash, stats, items, quests and save file** (saved in each browser),
  so progress follows you back to single-player. Co-op is a shared world, not a shared wallet.
- The **host's clock** runs the day. Sleeping, working, jail time etc. by anyone skips the clock for
  everybody (you'll see who did it in chat).
- You see each other walking, running, jumping, punching, kicking, blocking, rolling, getting knocked down,
  driving (your actual car model and paint), skateboarding and doing emotes, with name tags and HP bars.
- **Fights**: muggers, gangs, brawls and bosses are run by the host, so everyone sees the same goons and can
  gang up on them. XP/loot goes to whoever lands the final blow; brawl rewards go to whoever started it.
- **Cops**: each player has their **own wanted level**. Cops, cruisers, roadblocks and the chopper chase
  whoever is wanted — friends can watch (or help) you get busted.
- **Heists**: the leader invites the crew; everyone sees the crew markers and loot bags, and the take is split
  evenly between crew members still standing at the end.
- Graffiti tags, burst hydrants and traffic-light timing show up for everyone. Pedestrians, traffic and
  street events are per-player, so they won't match exactly between screens.

**Co-op extras**

| | |
|---|---|
| **T** | Chat. `/wave`, `/dance`, `/flip` emotes, `/players` lists who's online with ping, `/help` |
| **Esc → Give cash to a friend** | Hands cash straight to their wallet (also on the phone, **O**) |
| **Esc → Teleport to a friend** | Pops you next to them (get out of your car first) |
| **Esc → Leave co-op** | Back to solo. Your character stays exactly as it is |

**Limits & behavior**

- Max 4 players. A 5th person gets a polite "game is full".
- If a friend's connection drops, they vanish for everyone else and can rejoin with the same link.
- If the **host's** connection blinks, clients retry a few times; if the host closes the game (or never comes
  back), everyone drops back to solo automatically with their character intact.
- Bandwidth is small: roughly 4-10 KB/s per friend for the host, ~1.5 KB/s upload for each friend.
- Everyone should be on the same version of the page. If the host updated the game, everyone refresh.
- Co-op trusts your friends — it's peer-to-peer with no anti-cheat. Only share links with people you'd lend
  your car to.

**Troubleshooting**

- *"Couldn't find that game"* — the host closed/reloaded their tab (new ID) or the link is old. Ask for a new link.
- *"Can't reach the matchmaking server"* — the free [PeerJS](https://peerjs.com) broker (used only for the
  initial handshake) is down or blocked by an ad-blocker / firewall. Wait a minute, or allow `0.peerjs.com`.
- *Join times out / "Couldn't open a direct connection"* — WebRTC is blocked between you (strict NAT, some
  corporate/school/mobile networks, aggressive VPNs). Try another network, a phone hotspot, or let someone
  else host.
- *Friend is stuttering or teleporting around* — the host's tab is probably in the background or the machine is
  struggling; keep the host's game in a visible window.
- *Weird glitches after an update* — everyone hard-refresh (Ctrl+Shift+R / Cmd+Shift+R).

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
