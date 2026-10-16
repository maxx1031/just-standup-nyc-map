# Just Standup

**You can exercise anywhere, anytime. Just no excuse.**

> "Hey bro, let's go to the gym!"
> "Deadline." "LeetCode first." "Maybe tomorrow."

Every CS friend we have gives the same three excuses: *I don't have the device. I don't have a place. I don't know what to do.* Just Standup is a phone game with one act for each excuse. Every act follows the same pattern: the excuse, a one-line answer, a live demo.

| Act | The excuse | The answer | What you do |
|---|---|---|---|
| 1 | No device | Your phone is the device | Scan a QR code and throw punches with your phone |
| 2 | No place | New York is the gym | Fly over NYC, dive into Brooklyn, claim a real spot with ink |
| 3 | No coach | AI reads your room | Film a room and get a workout built from its furniture |

**Team:** Max researches human motion at Dartmouth and boxes. Brian builds motion models.

---

## Act 1 · No device? No problem.

*"I don't have an Apple Watch." You don't need one. You're holding one.*

Scan the QR code on the laptop and your phone becomes the controller. No watch, no camera, no app install.

- **Warm-up:** the phone asks for 3 straight punches, 3 uppercuts and 3 jump shots. The first punches also teach the classifier *your* movements.
- **Recognition:** the phone streams its accelerometer and gyroscope at 60 Hz. A punch is matched to the nearest punch you taught it (straight or uppercut). A jump shot is detected from an upward push plus a dip, a wrist flick or airtime.
- **Feedback:** every recognized move throws a splash of ink onto a toon-shaded Brooklyn wall (DUMBO), with its own sound.
- **Live monitor:** the laptop shows the QR code, a live mirror of the player's phone, and the raw motion signals behind every prediction.

## Act 2 · No place? No problem.

*"There's no gym near me." New York is the gym.*

The map opens on all five boroughs. Brooklyn lights up, then the camera dives into DUMBO while real buildings rise from the ground. Each pin is a real place filmed on a phone: Fulton Ferry Landing, the Empire Fulton Ferry lawn, the Water Street cobblestones, the St. Ann's Warehouse courtyard. Open a spot, see what to do there, and claim it with ink.

## Act 3 · No coach? Now you have a coach.

*"I don't know what to do, and I'm scared of doing it wrong."*

You film your room, and the app goes through three steps: **RENDERING** (the video becomes a 3D space), **IDENTIFY** (it finds usable objects), and **GENERATION** (it builds a short strength routine around them). In the demo office, that routine is a rear-foot split squat on a chair, a leg stretch on a railing, and a single-leg squat at a table. A guide then walks you to each spot and shows the move.

---

## What is real in this demo, and what is the plan

We want judges to know exactly what they are looking at.

**Working now**
- Phone motion recognition (straight / uppercut / jump shot), live phone-to-laptop streaming, and the ink feedback.
- The NYC → Brooklyn → DUMBO map, built from NYC Open Data and OpenStreetMap, with spots taken from our own footage.
- The Act 3 flow (room video → 3D space → spots → guided routine).

**Pre-built for the demo**
- The Act 3 office scene and its three spots were built ahead of time from one real room video. The app replays that build; it does not reconstruct your room live yet.
- The Act 2 spots and moves were chosen by hand.

**The agent pipeline (next step)**

We connected and smoke-tested the sponsor SDKs. The pipeline below is the design; it is not wired into this repo yet.

| Piece | Role |
|---|---|
| Anchor Browser | The agent browses the web to find nearby spots (a railing, a set of steps, an open court) and suitable moves for each |
| SurrealDB Agent Memory | Stores spots, moves and each user's training history |
| Daytona | Runs the room-reading and workout-generation agent in a sandbox |
| Arize AX | Traces every recommendation and evaluates whether it is safe before the user sees it (no standing on rolling chairs) |

---

## Run it

The demo needs Node.js (no npm install) and, for phones, `cloudflared`.

```bash
node server.js                                   # serves this folder on http://localhost:5190
cloudflared tunnel --url http://localhost:5190   # gives an https link; phones need https for motion sensors
```

- **Laptop:** open `/journey-monitor.html` through the tunnel link. It shows the QR code, the mirrored phone and the live signals.
- **Phone:** scan the QR code. It opens `/journey.html`, which runs the three acts in order.
- Act 3 is the earlier Just Standup app, which `server.js` serves under `/m3/`. It lives in a separate repo, so without it Act 3 won't load.

## Files

| Path | What it is |
|---|---|
| `journey.html` | Phone: the full flow (chapter cards → three acts → finale) |
| `journey-monitor.html` | Laptop: QR code, mirrored phone view, live motion signals |
| `chapters.html` | The chapter cards and the finale ("No device, no place, no coach. No excuse.") |
| `motion/` | Act 1: phone controller (`play.html`), motion lab and classifier (`motion-lab.html`, `core.js`), sounds |
| `布鲁克林伪3D.html` | The toon-shaded Brooklyn scene (bridge, East River, DUMBO walls) behind Act 1 |
| `index.html` + `nyc.geojson` | Act 2: the NYC 3D map and all of its precomputed geometry |
| `server.js` | Zero-dependency server: static files, phone → laptop live stream (POST + SSE), QR code |
| `lib/` | Local copies of MapLibre GL JS 5.6.0 and three.js r160 |
| `00_video/` | Our own DUMBO footage; four clips are the Act 2 spot videos |
| `截图/`, `旧版/` | Map screenshots, and an older version of the map |

## Data and credits

- **Borough boundaries:** NYC Open Data "Borough Boundaries" (`gthc-hcne`), NYC Department of City Planning, downloaded 2026-10-15.
- **Buildings and bridges:** © OpenStreetMap contributors (ODbL), queried through the Overpass API on 2026-10-15. Heights come from the `height` tag, or `building:levels × 3.2 m` when that tag is missing. The light bars on the map are merged and illustrative; one bar is not one building.
- **Spots:** our own videos, which carry no GPS. Each location was identified from the footage and geocoded with OSM Nominatim, so it is accurate to the block, not to the meter. Pin thumbnails use frames with no faces.

---

*You don't need more time. You just need to stand up.*
