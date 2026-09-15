import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import {
  BASE_SPEED,
  DESPAWN_Z,
  FOG_COLOR,
  COMBO_STEP,
  GRAVITY,
  HIT_INVULN,
  JUMP_V,
  LANES,
  MAX_HP,
  MAX_MULT,
  MAX_SPEED,
  OD_SCORE_MUL,
  OD_SPEED_MUL,
  OD_TIME,
  ORB_SCORE,
  PLAYER_HALF_W,
  SHIELD_HEAL,
  SLIDE_CY,
  SLIDE_HH,
  SLIDE_TIME,
  SPAWN_Z,
  SPEED_FALLOFF,
  STAND_CY,
  STAND_HH,
  type GameEventKind,
  type GameStats,
} from './config';
import { AudioEngine } from './audio';
import { ObstacleField, type Obstacle, type ObstacleKind } from './obstacles';
import { PickupField, Shockwaves, Sparks } from './pickups';
import { Ship } from './ship';
import { World } from './scene';

export type Command = 'left' | 'right' | 'jump' | 'slide' | 'pause' | 'restart' | 'start' | 'menu';

export interface GameCallbacks {
  onStats: (s: GameStats) => void;
  onEvent: (kind: GameEventKind) => void;
  onDeath: (s: GameStats) => void;
}

const BEST_KEY = 'hypertunnel.best.v1';

export function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function saveBest(v: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(Math.floor(v)));
  } catch {
    /* private mode — scores just won't persist */
  }
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private container: HTMLElement;
  private audio: AudioEngine;
  private cb: GameCallbacks;

  private world: World;
  private ship: Ship;
  private hazards: ObstacleField;
  private pickups: PickupField;
  private sparks: Sparks;
  private waves: Shockwaves;

  private raf = 0;
  private clock = new THREE.Clock();
  private running = false;

  /* ------------------------------------------------------------- run state */
  private state: GameStats['state'] = 'menu';
  private distance = 0;
  private score = 0;
  private speed = BASE_SPEED;
  private hp = MAX_HP;
  private combo = 0;
  private mult = 1;
  private orbs = 0;
  private odCharge = 0;
  private odTime = 0;
  private comboTimer = 6;
  private best = 0;
  private newRecord = false;

  /* -------------------------------------------------------------- player -- */
  private lane = 0;
  private laneX = 0;
  private laneVel = 0;
  private y = 0;
  private vy = 0;
  private onGround = true;
  private coyote = 0;
  private jumpBuffer = 0;
  private slideT = 0;
  private slideQueued = false;
  private invuln = 0;
  private shield = false;

  /* -------------------------------------------------------------- effects - */
  private trauma = 0;
  private hitStop = 0;
  private slowmo = 1;
  private time = 0;
  private fps = 60;
  private statAccum = 0;
  private deathTimer = 0;
  private deathReported = false;
  private quality: 0 | 1 | 2 = 2;
  private lowFpsTime = 0;

  /* --------------------------------------------------------------- spawner */
  private nextPatternIn = 120;
  private nextPowerIn = 620;
  private lastWasFull = false;

  private keys = { left: false, right: false };
  private disposers: (() => void)[] = [];
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, audio: AudioEngine, callbacks: GameCallbacks) {
    this.container = container;
    this.audio = audio;
    this.cb = callbacks;
    this.best = loadBest();

    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor(FOG_COLOR, 1);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(64, w / h, 0.1, 1400);
    this.camera.position.set(0, 5.2, 9.8);
    this.camera.lookAt(0, 1.4, -14);

    this.world = new World(this.scene);
    this.ship = new Ship(this.scene);
    this.hazards = new ObstacleField(this.scene, 18);
    this.pickups = new PickupField(this.scene);
    this.sparks = new Sparks(this.scene, 520);
    this.waves = new Shockwaves(this.scene, 12);

    // ------------------------------------------------------ post processing --
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w * 0.6, h * 0.6), 0.9, 0.62, 0.42);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.setSize(w, h);

    this.bindInput();
    this.observeResize();
    this.resetRun();
    this.state = 'menu';
    this.start();
  }

  /* ---------------------------------------------------------------- input -- */

  private bindInput(): void {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
      switch (k) {
        case 'arrowleft':
        case 'a':
          this.keys.left = true;
          break;
        case 'arrowright':
        case 'd':
          this.keys.right = true;
          break;
        case 'arrowup':
        case 'w':
        case ' ':
          this.command('jump');
          break;
        case 'arrowdown':
        case 's':
          this.command('slide');
          break;
        case 'enter':
          if (this.state === 'menu' || this.state === 'dead') this.command('start');
          break;
        case 'escape':
        case 'p':
          this.command('pause');
          break;
        case 'r':
          if (this.state !== 'menu') this.command('restart');
          break;
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') this.keys.left = false;
      if (k === 'arrowright' || k === 'd') this.keys.right = false;
    };

    // touch / pointer: swipe to steer, tap to jump, swipe down to slide
    let sx = 0;
    let sy = 0;
    let st = 0;
    let moved = false;
    const pdown = (e: PointerEvent) => {
      sx = e.clientX;
      sy = e.clientY;
      st = performance.now();
      moved = false;
    };
    const pmove = (e: PointerEvent) => {
      if (e.buttons === 0) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (Math.abs(dx) > 42 && !moved) {
        moved = true;
        this.command(dx > 0 ? 'right' : 'left');
      }
      if (dy > 48 && !moved) {
        moved = true;
        this.command('slide');
      }
    };
    const pup = (e: PointerEvent) => {
      const dt = performance.now() - st;
      const dx = Math.abs(e.clientX - sx);
      const dy = Math.abs(e.clientY - sy);
      if (!moved && dt < 260 && dx < 24 && dy < 24) {
        if (this.state === 'menu' || this.state === 'dead') this.command('start');
        else if (this.state === 'playing') this.command('jump');
        else if (this.state === 'paused') this.command('pause');
      }
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    const el = this.container;
    el.addEventListener('pointerdown', pdown);
    el.addEventListener('pointermove', pmove);
    el.addEventListener('pointerup', pup);

    const onBlur = () => {
      if (this.state === 'playing') this.setPaused(true);
    };
    window.addEventListener('blur', onBlur);
    const onVis = () => {
      if (document.hidden && this.state === 'playing') this.setPaused(true);
    };
    document.addEventListener('visibilitychange', onVis);

    this.disposers.push(
      () => window.removeEventListener('keydown', down),
      () => window.removeEventListener('keyup', up),
      () => el.removeEventListener('pointerdown', pdown),
      () => el.removeEventListener('pointermove', pmove),
      () => el.removeEventListener('pointerup', pup),
      () => window.removeEventListener('blur', onBlur),
      () => document.removeEventListener('visibilitychange', onVis),
    );
  }

  private observeResize(): void {
    const apply = () => {
      const w = Math.max(1, this.container.clientWidth);
      const h = Math.max(1, this.container.clientHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
      this.composer.setSize(w, h);
      this.bloom.setSize(w * 0.6, h * 0.6);
    };
    this.resizeObserver = new ResizeObserver(apply);
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', apply);
    this.disposers.push(() => window.removeEventListener('resize', apply));
    apply();
  }

  /* ------------------------------------------------------------ commands -- */

  command(cmd: Command): void {
    switch (cmd) {
      case 'start':
        if (this.state === 'menu' || this.state === 'dead') this.newRun();
        else if (this.state === 'paused') this.setPaused(false);
        break;
      case 'restart':
        this.newRun();
        break;
      case 'menu':
        this.resetRun();
        this.state = 'menu';
        this.audio.setRunning(false);
        this.pushStats(true);
        break;
      case 'pause':
        if (this.state === 'playing') this.setPaused(true);
        else if (this.state === 'paused') this.setPaused(false);
        break;
      case 'left':
        if (this.state === 'playing') this.move(-1);
        break;
      case 'right':
        if (this.state === 'playing') this.move(1);
        break;
      case 'jump':
        if (this.state === 'playing') this.jumpBuffer = 0.14;
        break;
      case 'slide':
        if (this.state === 'playing') this.beginSlide();
        break;
    }
  }

  private move(dir: number): void {
    const next = THREE.MathUtils.clamp(this.lane + dir, 0, LANES.length - 1);
    if (next !== this.lane) {
      this.lane = next;
      this.audio.play('ui');
      this.sparks.emit(this.laneX, 0.5, 0.4, new THREE.Color(0x3ef0ff), 3);
    }
  }

  private beginSlide(): void {
    if (!this.onGround) {
      // air dive: slam down, then slide on landing
      this.vy = Math.min(this.vy, -26);
      this.slideQueued = true;
      return;
    }
    if (this.slideT <= 0) {
      this.slideT = SLIDE_TIME;
      this.audio.play('slide');
      this.waves.trigger(this.laneX, 0.05, 0.4, 5, 0.45, true, 0x9b4bff);
      this.sparks.burst(this.laneX, 0.2, 0.6, new THREE.Color(0x9b4bff), 10, 4, 1.2);
      this.cb.onEvent('slide');
    }
  }

  /* ---------------------------------------------------------- run control -- */

  private setPaused(p: boolean): void {
    if (p && this.state === 'playing') {
      this.state = 'paused';
      this.audio.setRunning(false);
    } else if (!p && this.state === 'paused') {
      this.state = 'playing';
      this.audio.setRunning(true);
      this.clock.getDelta(); // drop the paused time
    }
    this.pushStats(true);
  }

  newRun(): void {
    this.resetRun();
    this.state = 'playing';
    this.audio.init();
    this.audio.resume();
    this.audio.setRunning(true);
    this.audio.play('start');
    this.waves.trigger(0, 0.1, 0, 16, 0.8, true, 0x3ef0ff);
    this.sparks.burst(0, 0.6, 0, new THREE.Color(0x3ef0ff), 34, 12, 5);
    this.pushStats(true);
  }

  private resetRun(): void {
    this.distance = 0;
    this.score = 0;
    this.speed = BASE_SPEED;
    this.hp = MAX_HP;
    this.combo = 0;
    this.mult = 1;
    this.orbs = 0;
    this.odCharge = 0;
    this.odTime = 0;
    this.comboTimer = 6;
    this.lane = 1;
    this.laneX = 0;
    this.laneVel = 0;
    this.y = 0;
    this.vy = 0;
    this.onGround = true;
    this.slideT = 0;
    this.slideQueued = false;
    this.invuln = 0;
    this.shield = false;
    this.trauma = 0;
    this.slowmo = 1;
    this.nextPatternIn = 130;
    this.nextPowerIn = 620;
    this.lastWasFull = false;
    this.deathTimer = 0;
    this.deathReported = false;
    this.newRecord = false;
    this.hazards.recycleAll();
    this.pickups.reset();
    this.sparks.reset();
    this.ship.respawn();
    this.ship.setShield(false);
    this.newRecord = false;
  }

  /* ----------------------------------------------------------- main loop -- */

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      this.frame();
    };
    this.raf = requestAnimationFrame(tick);
  }

  private frame(): void {
    const raw = this.clock.getDelta();
    const dt0 = Math.min(raw, 0.05);
    this.fps += (1 / Math.max(raw, 0.0005) - this.fps) * 0.08;
    this.time += dt0;

    // hit stop + death slow motion
    if (this.hitStop > 0) {
      this.hitStop -= raw;
      this.render();
      return;
    }
    const targetSlow = this.state === 'dead' ? 0.16 : 1;
    this.slowmo += (targetSlow - this.slowmo) * Math.min(1, dt0 * 3);
    const dt = dt0 * (this.state === 'dead' ? this.slowmo : 1);

    if (this.state === 'menu') this.updateAttract(dt);
    else if (this.state === 'playing' || this.state === 'dead') this.updateGame(dt, dt0);
    else this.updatePaused(dt0);

    this.adaptQuality(raw);
    this.pushStats(false);
    this.render();
  }

  /** Title screen: the corridor drifts by and the camera orbits a little. */
  private updateAttract(dt: number): void {
    this.speed = 16;
    this.distance += this.speed * dt;
    this.laneX = Math.sin(this.time * 0.5) * 1.6;
    this.laneVel = (this.laneX - this.ship.root.position.x) / Math.max(dt, 0.001);
    this.world.update(dt, this.distance, this.speed, this.time, false);
    this.ship.update(dt, {
      laneX: this.laneX,
      laneVel: this.laneVel,
      y: 1.1 + Math.sin(this.time * 1.1) * 0.22,
      vy: 0,
      sliding: false,
      alive: true,
      overdrive: false,
      invuln: 0,
      speed: this.speed,
      time: this.time,
    });
    const a = this.time * 0.22;
    this.camera.position.set(Math.sin(a) * 8.5, 4.6 + Math.sin(this.time * 0.6) * 0.6, 8.5 + Math.cos(a) * 2.5);
    this.camera.lookAt(0, 1.6, -18);
    this.camera.fov = 60;
    this.camera.updateProjectionMatrix();
    this.pickups.sync(this.time);
    this.sparks.update(dt);
    this.waves.update(dt);
    this.audio.update(this.speed, 0.25, dt);
    this.trauma = Math.max(0, this.trauma - dt);
  }

  private updatePaused(dt: number): void {
    this.world.update(dt * 0.15, this.distance, 6, this.time, false);
    this.pickups.sync(this.time);
    this.sparks.update(dt * 0.2);
    this.waves.update(dt * 0.2);
  }

  private updateGame(dt: number, rawDt: number): void {
    const playing = this.state === 'playing';

    /* ----------------------------------------------------------- speed --- */
    const ramp = 1 - Math.exp(-this.distance / SPEED_FALLOFF);
    const base = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * ramp;
    this.speed = base * (this.odTime > 0 ? OD_SPEED_MUL : 1);
    if (playing) this.distance += this.speed * dt;

    /* -------------------------------------------------------- lane move --- */
    const targetX = LANES[this.lane];
    const prevX = this.laneX;
    this.laneX += (targetX - this.laneX) * Math.min(1, dt * 11);
    this.laneVel = (this.laneX - prevX) / Math.max(dt, 0.0001);

    /* ------------------------------------------------------------ jump --- */
    if (playing) {
      this.coyote -= dt;
      this.jumpBuffer -= dt;
      if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
        this.jumpBuffer = 0;
        this.coyote = 0;
        this.onGround = false;
        this.vy = JUMP_V;
        this.slideT = 0;
        this.audio.play('jump');
        this.sparks.burst(this.laneX, 0.2, 0.3, new THREE.Color(0x3ef0ff), 12, 5, 1.6);
        this.cb.onEvent('jump');
      }
      if (this.slideT > 0) this.slideT -= dt;
    }

    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      if (!this.onGround) {
        this.waves.trigger(this.laneX, 0.06, 0.3, 4.5, 0.4, true, 0x3ef0ff);
        this.sparks.burst(this.laneX, 0.1, 0.3, new THREE.Color(0xdff3ff), 10, 5, 1);
        this.trauma = Math.min(1, this.trauma + 0.12);
      }
      this.y = 0;
      this.vy = 0;
      this.onGround = true;
      this.coyote = 0.12;
      if (this.slideQueued) {
        this.slideQueued = false;
        this.beginSlide();
      }
    }
    const sliding = this.slideT > 0 && this.onGround;

    /* ----------------------------------------------------------- invuln -- */
    if (this.invuln > 0) this.invuln -= dt;

    /* -------------------------------------------------------- overdrive -- */
    if (this.odTime > 0) {
      this.odTime -= dt;
      if (this.odTime <= 0) {
        this.odTime = 0;
        this.cb.onEvent('od-end');
      }
      if (Math.random() < 0.6) {
        this.sparks.emit(
          this.laneX + (Math.random() - 0.5) * 1.6,
          0.4 + Math.random() * 1.2,
          0.6,
          new THREE.Color(0xffb03a),
          1.6,
        );
      }
    }

    /* ---------------------------------------------------------- spawning -- */
    if (playing) {
      this.nextPatternIn -= this.speed * dt;
      if (this.nextPatternIn <= 0) this.planPattern();
      this.nextPowerIn -= this.speed * dt;
    }

    /* ------------------------------------------------------------ combo --- */
    if (playing) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboTimer = 1.4;
        if (this.combo > 0) {
          this.combo = Math.max(0, this.combo - COMBO_STEP);
          this.mult = Math.max(1, Math.ceil(this.combo / COMBO_STEP));
        }
      }
    }

    /* --------------------------------------------------------- world sim -- */
    this.world.update(dt, this.distance, this.speed, this.time, this.odTime > 0);
    this.hazards.update(dt, this.speed, DESPAWN_Z);
    this.hazards.pulseMaterials(this.time);

    /* ---------------------------------------------------- engine trail --- */
    if (playing) {
      const n = this.odTime > 0 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        this.sparks.emit(
          this.laneX + (Math.random() - 0.5) * 0.9,
          0.45 + this.y + (Math.random() - 0.5) * 0.3,
          0.9,
          new THREE.Color(this.odTime > 0 ? 0xffb03a : 0x3ef0ff),
          1.2,
        );
      }
    }

    /* ------------------------------------------------------------ ship ---- */
    const overdrive = this.odTime > 0;
    this.ship.update(dt, {
      laneX: this.laneX,
      laneVel: this.laneVel,
      y: this.y,
      vy: this.vy,
      sliding,
      alive: playing,
      overdrive,
      invuln: this.invuln,
      speed: this.speed,
      time: this.time,
    });

    /* --------------------------------------------------------- collisions */
    if (playing) {
      const halfW = PLAYER_HALF_W;
      const cy = this.y + (sliding ? SLIDE_CY : STAND_CY);
      const hh = sliding ? SLIDE_HH : STAND_HH;
      const boxTop = cy + hh;
      const boxBottom = cy - hh;

      for (const o of this.hazards.list) {
        if (!o.active) continue;
        const overlapZ = Math.abs(o.z) < 1.15;
        const overlapX = Math.abs(o.x - this.laneX) < o.halfW + halfW - 0.12;
        if (overlapZ && overlapX && o.maxY > boxBottom && o.minY < boxTop) {
          this.damage(o);
        } else if (!o.rewarded && o.z > -0.6 && o.z < 1.6) {
          const gap = Math.abs(o.x - this.laneX) - (o.halfW + halfW);
          if (gap >= 0 && gap < 0.75) {
            o.rewarded = true;
            this.score += 12 * this.mult * (overdrive ? OD_SCORE_MUL : 1);
            this.combo += 1;
            this.comboTimer = 6;
            this.mult = Math.min(MAX_MULT, 1 + Math.floor(this.combo / COMBO_STEP));
            this.sparks.burst(o.x, 1.1, 0.4, new THREE.Color(0xdff3ff), 6, 3, 1.4);
          } else if (gap >= 0.75) {
            o.rewarded = true;
          }
        }

        if (!o.rewarded && o.z > 1.6) o.rewarded = true;
      }

      /* -------------------------------------------------------- pickups --- */
      const magnetRange = 2.4 + this.mult * 0.35 + (overdrive ? 3.6 : 0);
      this.pickups.update(dt, this.speed, { x: this.laneX, y: cy, z: 0, halfW, halfH: hh }, magnetRange);
      for (const e of this.pickups.takeEvents()) {
        if (e.kind === 'orb') {
          this.orbs++;
          this.combo++;
          this.comboTimer = 6;
          this.mult = Math.min(MAX_MULT, 1 + Math.floor(this.combo / COMBO_STEP));
          this.score += ORB_SCORE * this.mult * (overdrive ? OD_SCORE_MUL : 1);
          this.odCharge = Math.min(1, this.odCharge + 0.055);
          this.audio.play('orb', Math.min(12, this.combo % 13));
          this.sparks.burst(e.x, e.y, e.z, new THREE.Color(0x3ef0ff), 8, 4, 2);
          this.cb.onEvent('orb');
          if (this.odCharge >= 1 && this.odTime <= 0) {
            this.odCharge = 0;
            this.odTime = OD_TIME;
            this.audio.play('boost');
            this.waves.trigger(this.laneX, 0.1, 0.5, 12, 0.7, true, 0xffb03a);
            this.sparks.burst(this.laneX, 0.8, 0.5, new THREE.Color(0xffb03a), 30, 10, 4);
            this.trauma = Math.min(1, this.trauma + 0.35);
            this.cb.onEvent('boost');
          }
        } else if (e.kind === 'shield') {
          this.shield = true;
          this.hp = Math.min(MAX_HP, this.hp + SHIELD_HEAL);
          this.ship.setShield(true);
          this.audio.play('shield');
          this.waves.trigger(e.x, e.y, e.z, 8, 0.6, false, 0xaaff4d);
          this.sparks.burst(e.x, e.y, e.z, new THREE.Color(0xaaff4d), 26, 8, 3);
          this.cb.onEvent('shield');
        } else {
          this.odTime = OD_TIME;
          this.audio.play('boost');
          this.waves.trigger(e.x, e.y, e.z, 10, 0.7, false, 0xffb03a);
          this.sparks.burst(e.x, e.y, e.z, new THREE.Color(0xffb03a), 30, 9, 4);
          this.cb.onEvent('boost');
        }
      }
    } else {
      // death animation: the wreck tumbles out of frame
      this.deathTimer += rawDt;
      this.speed *= 1 - Math.min(1, dt * 2.2);
      this.waves.update(dt);
    }

    /* ---------------------------------------------------------- scoring --- */
    if (playing) {
      this.score += this.speed * dt * 0.32 * this.mult * (overdrive ? OD_SCORE_MUL : 1);
      if (this.score > this.best) {
        this.best = this.score;
        this.newRecord = true;
      }
    }

    /* ------------------------------------------------------------ camera -- */
    this.updateCamera(dt, sliding, overdrive);
    this.pickups.sync(this.time);
    this.sparks.update(dt);
    this.waves.update(dt);
    this.audio.update(this.speed, Math.min(1, this.speed / MAX_SPEED), dt);

    /* ------------------------------------------------------------- death -- */
    if (this.state === 'dead' && !this.deathReported && this.deathTimer > 1.15) {
      this.deathReported = true;
      saveBest(this.best);
      this.cb.onDeath(this.snapshot());
    }
  }

  private updateCamera(dt: number, sliding: boolean, overdrive: boolean): void {
    const speedN = Math.min(1, (this.speed - BASE_SPEED) / (MAX_SPEED * OD_SPEED_MUL - BASE_SPEED));
    const px = this.laneX;
    const camY = 5.0 + this.y * 0.42 + (sliding ? -0.5 : 0);
    const camZ = 9.6 + speedN * 1.1 + (this.state === 'dead' ? this.deathTimer * 3.4 : 0);
    const want = new THREE.Vector3(px * 0.42, camY, camZ);
    this.camera.position.lerp(want, Math.min(1, dt * 5.5));

    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    const shake = this.trauma * this.trauma;
    if (shake > 0.0005) {
      this.camera.position.x += (Math.random() - 0.5) * shake * 1.6;
      this.camera.position.y += (Math.random() - 0.5) * shake * 1.2;
      this.camera.rotation.z = (Math.random() - 0.5) * shake * 0.09;
    } else {
      this.camera.rotation.z *= 0.9;
    }

    const look = new THREE.Vector3(px * 0.55, 1.25 + this.y * 0.5 + (this.state === 'dead' ? -1 : 0), -16);
    if (this.state === 'dead') look.y -= this.deathTimer * 0.6;
    this.camera.lookAt(look);

    const fov =
      63 + speedN * 15 + (overdrive ? 5 : 0) + this.trauma * 4 + (this.state === 'dead' ? 6 : 0);
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3);
    this.camera.updateProjectionMatrix();
  }

  private damage(o: Obstacle): void {
    if (this.invuln > 0) return;
    const color = new THREE.Color(o.kind === 'drone' ? 0xff2f9d : 0xffb03a);
    this.sparks.burst(this.laneX, 1 + this.y, 0.3, color, 30, 12, 5);
    this.waves.trigger(this.laneX, 1.1 + this.y, 0.2, 7, 0.5, false, o.kind === 'drone' ? 0xff2f9d : 0xff3b3b);
    this.trauma = 1;
    this.hitStop = 0.085;
    this.world.flash(0.9);
    this.ship.hit();

    if (this.shield) {
      this.shield = false;
      this.ship.setShield(false);
      this.invuln = HIT_INVULN * 0.8;
      this.audio.play('shield');
      this.score = Math.max(0, this.score - 60);
      return;
    }

    this.hp -= 1;
    this.invuln = HIT_INVULN;
    this.combo = 0;
    this.mult = 1;
    this.odCharge = Math.max(0, this.odCharge - 0.3);
    this.audio.play('hit');
    this.cb.onEvent('hit');

    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead';
      this.deathTimer = 0;
      this.audio.play('death');
      this.audio.setRunning(false);
      this.sparks.burst(this.laneX, 1 + this.y, 0.4, new THREE.Color(0xffb03a), 60, 16, 7);
      this.sparks.burst(this.laneX, 1 + this.y, 0.4, new THREE.Color(0xff3b3b), 40, 12, 6);
      this.waves.trigger(this.laneX, 1 + this.y, 0.3, 18, 1.1, false, 0xff3b3b);
      this.trauma = 1;
      this.cb.onEvent('death');
      if (this.score > this.best) {
        this.best = this.score;
        this.newRecord = true;
      }
      saveBest(this.best);
    }
  }

  /* --------------------------------------------------------- spawn logic -- */

  private planPattern(): void {
    const d = Math.min(1, this.distance / 3600);
    const free: number[] = [0, 1, 2];
    let full = false;

    type Roll = { weight: number; run: () => void };
    const rolls: Roll[] = [
      {
        weight: 42,
        run: () => {
          const count = d > 0.42 && Math.random() < 0.62 ? 2 : 1;
          const lanes = this.shuffle([0, 1, 2]).slice(0, count);
          for (const lane of lanes) {
            const roll = Math.random();
            let kind: ObstacleKind = 'low';
            if (d > 0.18 && roll < 0.34) kind = 'wall';
            else if (d > 0.3 && roll < 0.5) kind = 'high';
            this.spawn(kind, lane, 1);
            free.splice(free.indexOf(lane), 1);
          }
        },
      },
      {
        weight: d > 0.1 ? 15 : 0,
        run: () => {
          // sweeping barrier: must jump
          this.spawn('low', 1, 3);
          full = true;
        },
      },
      {
        weight: d > 0.16 ? 14 : 0,
        run: () => {
          // overhead barrier: must slide (cyan wall or the taller violet gate)
          this.spawn(Math.random() < 0.55 ? 'wall' : 'high', 0, 3);
          full = true;
        },
      },
      {
        weight: d > 0.22 ? 17 : 0,
        run: () => {
          const count = d > 0.45 && Math.random() < 0.45 ? 2 : 1;
          const lanes = this.shuffle([0, 1, 2]).slice(0, count);
          for (const lane of lanes) {
            this.spawn('drone', lane, 1);
            free.splice(free.indexOf(lane), 1);
          }
        },
      },
      {
        weight: d > 0.32 ? 15 : 0,
        run: () => {
          // pick your poison: slide on the sides, jump through the middle
          this.spawn('wall', 0, 1);
          this.spawn('low', 1, 1);
          this.spawn('wall', 2, 1);
        },
      },
    ];

    const usable = rolls.filter((x) => x.weight > 0);
    const total = usable.reduce((a, b) => a + b.weight, 0);
    let pick = Math.random() * total;
    for (const roll of usable) {
      pick -= roll.weight;
      if (pick <= 0) {
        roll.run();
        break;
      }
    }

    // orbs always signpost a way through; sometimes they reward an action
    if (full) {
      const last = this.hazards.list.filter((o) => o.active).sort((a, b) => b.z - a.z)[0];
      if (last && last.kind === 'low') this.orbTrail(0, 'arc', 6);
      else this.orbTrail(0, 'low', 6);
    } else if (free.length > 0) {
      const lane = free[Math.floor(Math.random() * free.length)];
      this.orbTrail(LANES[lane], 'ground', 5);
    }

    // occasional power-up
    if (this.nextPowerIn <= 0) {
      this.nextPowerIn = 900 + Math.random() * 700;
      const lane = free.length ? free[Math.floor(Math.random() * free.length)] : 1;
      this.pickups.spawnPower(Math.random() < 0.6 ? 'shield' : 'boost', LANES[lane], SPAWN_Z + 40);
    }

    // A full-width barrier forces a jump or a slide, and a slide can only start
    // on the ground — so after one, the next hazard must be further away than a
    // complete jump arc at top speed, otherwise the sequence is unplayable.
    const arc = (2 * JUMP_V / GRAVITY) * MAX_SPEED * OD_SPEED_MUL;
    const gap = (60 - 26 * d) * (0.82 + Math.random() * 0.45);
    const clear = this.lastWasFull ? arc * 1.15 : full ? arc * 0.55 : 0;
    this.nextPatternIn = gap + clear;
    this.lastWasFull = full;
  }

  private spawn(kind: ObstacleKind, lane: number, span: number): void {
    const x = lane === 1 && span === 3 ? 0 : LANES[lane];
    this.hazards.spawn(kind, x, SPAWN_Z, span, lane);
  }

  private orbTrail(x: number, type: 'ground' | 'arc' | 'low', count: number): void {
    const z0 = SPAWN_Z + 12;
    for (let i = 0; i < count; i++) {
      const z = z0 + i * 3.4;
      if (type === 'ground') this.pickups.spawnOrb(x, z, 0.95);
      else if (type === 'low') this.pickups.spawnOrb(x, z, 0.5);
      else {
        const t = i / Math.max(1, count - 1);
        this.pickups.spawnOrb(x, z, 0.9 + Math.sin(t * Math.PI) * 1.5);
      }
    }
  }

  private shuffle<T>(a: T[]): T[] {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }

  /* ------------------------------------------------------------- quality -- */

  private adaptQuality(raw: number): void {
    if (this.fps < 48) this.lowFpsTime += raw;
    else this.lowFpsTime = Math.max(0, this.lowFpsTime - raw * 0.5);

    if (this.lowFpsTime > 2.2 && this.quality > 0) {
      this.lowFpsTime = 0;
      if (this.quality === 2) {
        this.quality = 1;
        this.renderer.setPixelRatio(1);
        this.bloom.strength = 0.6;
      } else {
        this.quality = 0;
        this.bloom.enabled = false;
        this.renderer.setPixelRatio(0.9);
      }
      this.composer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
  }

  private render(): void {
    if (this.bloom.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /* --------------------------------------------------------------- stats -- */

  private snapshot(): GameStats {
    const eff = this.mult * (this.odTime > 0 ? OD_SCORE_MUL : 1);
    return {
      state: this.state,
      score: Math.floor(this.score),
      best: Math.floor(this.best),
      speed: this.speed,
      distance: this.distance,
      hp: this.hp,
      combo: this.combo,
      mult: eff,
      orbs: this.orbs,
      overdrive: this.odTime > 0 ? this.odTime / OD_TIME : this.odCharge,
      overdriveActive: this.odTime > 0,
      newRecord: this.newRecord,
      fps: this.fps,
    };
  }

  private pushStats(force: boolean): void {
    this.statAccum += 1;
    if (!force && this.statAccum < 6) return;
    this.statAccum = 0;
    this.cb.onStats(this.snapshot());
  }

  get bestScore(): number {
    return Math.floor(this.best);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.running = false;
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.audio.setRunning(false);
    this.hazards.dispose();
    this.pickups.dispose();
    this.sparks.dispose();
    this.waves.dispose();
    this.ship.dispose();
    this.world.dispose();
    this.composer.dispose();
    this.bloom.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
