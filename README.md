# Dox's RPG

**[▶ Play it in your browser](https://jonbeam1-netizen.github.io/doxs-rpg/)** · no install, no account, works on phones

A grimy 3D stick-figure life sim. You wake up broke and hungover in **Rotwell**, a city that smells like wet
cardboard and bad decisions, holding a note in your own handwriting that says *trust no one, especially the
mayor*. Get a job. Get swole. Get rich. Get arrested. Drag your friends down with you in co-op.

## The 30-second version

- **Follow the gold beacon.** Crusty Reg under the overpass explains everything, badly.
- **Work** jobs for cash, **train** STR / INT / CHA (gym, library, college) to unlock better jobs.
- **Eat and sleep.** Everything costs energy. Skipping both is a lifestyle, not a strategy.
- Or skip the honest part: deal, jack cars, brawl, rob places. **Heat ★** brings cops.
- The story has **five endings**. The city keeps going after you reach one.
- Stuck? **Esc → How to play**. Tips pop up the first time you need them (turn them off in **Esc → Settings**).

## Controls

| | Keyboard + mouse | Touch | Controller |
|---|---|---|---|
| Move / look | **WASD** (Shift runs) / mouse | left thumb / right thumb | left / right stick |
| Talk, enter, use | **E** | **Use** | **X** |
| Punch / kick | **click** (hold = heavy) / **right-click** | **Attack** / ••• | **RT** / **B** |
| Block · roll · heal | **C** · **Z** · **Y** | ••• | **LB** · B while moving · LB + D-pad |
| Get in a car (any car) | **F** | **Car** | **Y** |
| Quests · map · stats · phone | **J** · **M** · **Tab** · **O** | ••• | D-pad · Select |
| Everything else | **F1** | ❚❚ menu | Start |

## Co-op (up to 4)

1. Click **Host co-op game** on the title screen (or **Esc → Co-op: invite friends** mid-game).
2. Hit **Copy** and send the link to up to three friends.
3. They open it, make a stick person, and fall into your city. Keep your tab in front.

Everyone keeps their own character, cash and save. Shared city, separate wallets. **T** to chat
(`/wave`, `/dance`, `/flip`), **K** for the crew panel (send cash, spar, drag race), **F** at a friend's car to
ride shotgun and shoot out the window.

## Tips from people who died a lot

- Pay Reg his twenty bucks. Karma is real here, unlike the hospital's credentials.
- Product is cheap in Gutterside and pricey in Hilltop. That's the whole business plan.
- One star and the cops jog. Five stars and the sky gets involved. Break line of sight.
- Tap **C** right before a hit to parry. It feels amazing. Missing it feels like your face.
- Choppy? **Esc → Settings → Graphics**. Your laptop fan will send a thank-you card.

<details>
<summary><b>Co-op fine print & troubleshooting</b></summary>

- The **host's clock** runs the day. Anyone sleeping, working or doing jail time skips it for everybody.
- Fights are run by the host, so everyone sees the same goons. XP and loot go to whoever lands the last hit.
- Each player has their **own wanted level**. Heist takes are split between crew members still standing.
- If a friend drops they can rejoin with the same link. If the host leaves, everyone goes back to solo with
  their character intact. The host's link changes every session.
- It's peer-to-peer with no anti-cheat. Only share links with people you'd lend your car to.
- *"Couldn't find that game"*: the host reloaded (new ID). Ask for a fresh link.
- *"Can't reach the matchmaking server"*: the free [PeerJS](https://peerjs.com) broker is down or an ad-blocker
  is eating it. Allow `0.peerjs.com` or wait a minute.
- *Join times out*: strict NAT / school / work / VPN networks block WebRTC. Try a phone hotspot or let someone
  else host.
- *Weird glitches after an update*: everyone hard-refresh (Ctrl+Shift+R).

</details>

<details>
<summary><b>Running it yourself</b></summary>

No build step. Serve the folder with any static server and open it:

```
python -m http.server 8000
```

then <http://localhost:8000/>. (Opening `index.html` from disk won't work: browsers block ES modules over
`file://`.) `?dev=1` skips the title screen. For GitHub Pages, push and enable Pages on the repo root; all paths
are relative.

</details>

## Credits

Inspired by Stick RPG 2 by XGen Studios. Not affiliated. All names, writing and art are original.

Built with [three.js](https://threejs.org) and [PeerJS](https://peerjs.com). No stick figures were harmed.
Several were mildly inconvenienced.
