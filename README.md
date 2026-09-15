# HYPERTUNNEL

A procedural **3D endless runner** in the browser — three lanes, a neon corridor, no brakes.
Built with **three.js**, **React** and the **Web Audio API**. Every mesh, texture, sound and
level pattern is generated at runtime, so there are no asset downloads and the production build
is a single self-contained HTML file.

```bash
npm install          # PUPPETEER_SKIP_DOWNLOAD=1 if you don't need the browser tooling
npm run dev          # play at http://localhost:5173
npm run build        # -> dist/index.html (one file, ~210 KB gzipped)
```

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Change lane | `←` `→` / `A` `D` | swipe left / right |
| Jump | `Space` / `↑` / `W` | tap, or the JUMP button |
| Slide / air-dive | `↓` / `S` | swipe down, or the SLIDE button |
| Pause | `Esc` / `P` | PAUSE button |
| Restart | `R` | RETRY |
| Start | `Enter` / `Space` | tap START RUN |

Sliding in mid-air slams the ship down and queues a slide for the landing — that is the escape
route when a jump arc would otherwise carry you into the next barrier.

## Rules

- **Orbs** are worth points, +1 chain each, and charge OVERDRIVE.
- Every **5 chained orbs** raises the multiplier (up to x8). Getting hit resets the chain, and an
  idle chain decays after a few seconds, so hesitation costs.
- **OVERDRIVE** — 6 s of doubled scoring, +20 % speed, a much wider magnet and a warm corridor.
- **Near misses** pay a bonus and keep the chain alive: squeeze past a hazard instead of dodging wide.
- Power-ups: **shield** (absorbs one hit, +1 hull) and **boost** (instant overdrive).
- Three hull plates. Lose them all and the run ends; the best score is kept in `localStorage`.

## Obstacle vocabulary

| Hazard | Look | Answer |
| --- | --- | --- |
| Low gate | amber barrier | jump |
| Wall / violet gate | floating panel, clear gap underneath | slide |
| Drone | spinning magenta core, drifts toward you | dodge into another lane |

The spawner always leaves a readable route — orbs are laid along it, and every full-width barrier
is placed more than one whole jump arc away from the previous one so the sequences stay solvable,
including in overdrive.

## Architecture

| Module | Responsibility |
| --- | --- |
| `src/game/config.ts` | tuning constants, palette, `GameStats` contract |
| `src/game/textures.ts` | glow / ring / shadow sprites |
| `src/game/materials.ts` | canvas textures: road, walls, hazards, tunnel, sky |
| `src/game/scene.ts` | scrolling canyon, arches, pylons, wind streaks, lights |
| `src/game/ship.ts` | primitives-only speeder: banking, slide squash, shield, damage flash |
| `src/game/obstacles.ts` | pooled hazards + collision boxes |
| `src/game/pickups.ts` | instanced orbs, power-ups, spark and shockwave pools |
| `src/game/audio.ts` | engine hum, 132 BPM synth bassline, layered SFX |
| `src/game/game.ts` | state machine, physics, collisions, scoring, camera, bloom pipeline |
| `src/ui/*`, `src/App.tsx` | HUD, menu / pause / game-over overlays, React shell |

The renderer runs `EffectComposer` + `UnrealBloomPass` + `OutputPass` with ACES tone mapping, and
drops resolution and bloom automatically if the frame rate sags below ~48 fps.

## Verification

`.scratch/sim.ts` runs the real game modules headlessly (stubbed DOM + `@napi-rs/canvas`), steps
3600 frames with a bot pilot, asserts the design invariants that make every hazard answerable, and
dumps a wireframe scene render:

```bash
npx vite build --config .scratch/vite.sim.config.ts && node .scratch/out/sim.js
```

It checks, among other things: gate/wall clearance maths against the jump arc, that sliding clears
the floating barriers, that full-width patterns are spaced wider than a jump at top speed, that no
position goes NaN, that the hazard pool never overflows, that orbs are actually collected, and that
the chase camera frames the ship, the lanes and the arches the way a player expects.
