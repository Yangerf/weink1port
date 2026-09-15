import * as THREE from 'three';
import { PALETTE } from './config';
import { getGlowTexture } from './textures';

export interface ShipState {
  laneX: number;
  /** lateral velocity, used for banking */
  laneVel: number;
  y: number;
  vy: number;
  sliding: boolean;
  alive: boolean;
  overdrive: boolean;
  invuln: number;
  speed: number;
  time: number;
}

/**
 * The player's hover speeder. Everything is built from primitives, so the ship
 * costs a handful of draw calls and needs no model file.
 */
export class Ship {
  root = new THREE.Group();
  private tilt = new THREE.Group();
  private hull = new THREE.Group();
  private shellMats: THREE.MeshStandardMaterial[] = [];
  private glowMats: THREE.MeshBasicMaterial[] = [];
  private exhaust: THREE.Mesh[] = [];
  private exhaustMats: THREE.MeshBasicMaterial[] = [];
  private bubble: THREE.Mesh;
  private bubbleMat: THREE.MeshBasicMaterial;
  private underGlow: THREE.Mesh;
  private underMat: THREE.MeshBasicMaterial;
  private flash = 0;
  private shield = false;
  private shieldPop = 0;
  private baseEmissive = 0.55;
  private exhaustT = 0;

  constructor(parent: THREE.Object3D) {
    this.root.name = 'ship';
    this.root.add(this.tilt);
    this.tilt.add(this.hull);
    parent.add(this.root);

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x131b2c,
      emissive: new THREE.Color(PALETTE.cyan),
      emissiveIntensity: 0.22,
      roughness: 0.42,
      metalness: 0.72,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x0a0f1a,
      emissive: new THREE.Color(PALETTE.magenta),
      emissiveIntensity: 0.7,
      roughness: 0.35,
      metalness: 0.6,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x08202c,
      emissive: new THREE.Color(PALETTE.cyan),
      emissiveIntensity: 1.1,
      roughness: 0.12,
      metalness: 0.4,
      transparent: true,
      opacity: 0.9,
    });
    this.shellMats.push(hullMat, accentMat, glassMat);

    // ------------------------------------------------------------- body ----
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.32, 1.7), hullMat);
    body.position.y = 0;
    this.hull.add(body);

    const noseGeo = new THREE.ConeGeometry(0.44, 1.0, 4, 1);
    const nose = new THREE.Mesh(noseGeo, hullMat);
    nose.rotation.set(-Math.PI / 2, Math.PI / 4, 0);
    nose.position.set(0, 0, -1.2);
    nose.scale.set(1, 1, 0.62);
    this.hull.add(nose);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), glassMat);
    canopy.scale.set(0.9, 0.62, 1.5);
    canopy.position.set(0, 0.16, -0.15);
    this.hull.add(canopy);

    // wings
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.86), hullMat);
      wing.position.set(sx * 0.66, -0.02, 0.18);
      wing.rotation.z = sx * 0.16;
      this.hull.add(wing);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.7), accentMat);
      tip.position.set(sx * 0.95, 0.02, 0.22);
      this.hull.add(tip);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.5), hullMat);
      fin.position.set(sx * 0.3, 0.26, 0.72);
      this.hull.add(fin);
    }

    // ---------------------------------------------------------- engines ----
    const engineMat = new THREE.MeshStandardMaterial({
      color: 0x1b2233,
      emissive: new THREE.Color(PALETTE.magenta),
      emissiveIntensity: 0.9,
      roughness: 0.3,
      metalness: 0.8,
    });
    this.shellMats.push(engineMat);
    for (const sx of [-1, 1]) {
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.5, 12), engineMat);
      engine.rotation.x = Math.PI / 2;
      engine.position.set(sx * 0.34, -0.02, 0.86);
      this.hull.add(engine);

      const glowMat = new THREE.MeshBasicMaterial({
        map: getGlowTexture(),
        color: PALETTE.cyan,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), glowMat);
      glow.position.set(sx * 0.34, -0.02, 1.14);
      this.hull.add(glow);
      this.exhaust.push(glow);
      this.exhaustMats.push(glowMat);
      this.glowMats.push(glowMat);
    }

    // ------------------------------------------------------ hover glow ----
    this.underMat = new THREE.MeshBasicMaterial({
      map: getGlowTexture(),
      color: PALETTE.cyan,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.underGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), this.underMat);
    this.underGlow.rotation.x = -Math.PI / 2;
    this.underGlow.position.y = -0.42;
    this.hull.add(this.underGlow);
    this.glowMats.push(this.underMat);

    // ---------------------------------------------------- shield bubble ---
    this.bubbleMat = new THREE.MeshBasicMaterial({
      color: PALETTE.lime,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      wireframe: true,
      toneMapped: false,
    });
    this.bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 1), this.bubbleMat);
    this.bubble.visible = false;
    this.tilt.add(this.bubble);
    this.glowMats.push(this.bubbleMat);
  }

  setShield(on: boolean): void {
    if (on && !this.shield) this.shieldPop = 1;
    this.shield = on;
    this.bubble.visible = on;
  }

  /** Damage flash + bubble pop. */
  hit(): void {
    this.flash = 1;
    this.shieldPop = 1;
  }

  update(dt: number, s: ShipState): void {
    this.root.position.set(s.laneX, s.y, 0);

    // bank into the strafe, pitch with vertical speed
    const targetRoll = THREE.MathUtils.clamp(-s.laneVel * 0.05, -0.55, 0.55);
    const targetYaw = THREE.MathUtils.clamp(-s.laneVel * 0.022, -0.3, 0.3);
    const targetPitch = s.sliding ? 0.42 : THREE.MathUtils.clamp(-s.vy * 0.018, -0.3, 0.3);
    this.tilt.rotation.z += (targetRoll - this.tilt.rotation.z) * Math.min(1, dt * 7);
    this.tilt.rotation.y += (targetYaw - this.tilt.rotation.y) * Math.min(1, dt * 7);
    this.tilt.rotation.x += (targetPitch - this.tilt.rotation.x) * Math.min(1, dt * 9);

    // slide: squash flat and tuck down
    const targetSquash = s.sliding ? 0.46 : 1;
    this.hull.scale.y += (targetSquash - this.hull.scale.y) * Math.min(1, dt * 14);
    this.hull.position.y += ((s.sliding ? -0.35 : 0) - this.hull.position.y) * Math.min(1, dt * 12);

    // hover bob + speed turbulence
    const turb = Math.min(1, s.speed / 90);
    this.hull.position.y += Math.sin(s.time * 3.1) * 0.012 * (1 + turb * 2);
    this.hull.rotation.z = Math.sin(s.time * 7.3) * 0.02 * turb;
    this.exhaustT += dt * (6 + turb * 26);

    // engine flare
    const flicker = 0.82 + Math.sin(this.exhaustT) * 0.18 + Math.random() * 0.08;
    for (let i = 0; i < this.exhaust.length; i++) {
      const m = this.exhaust[i];
      m.scale.setScalar((0.85 + turb * 0.55) * flicker);
      this.exhaustMats[i].color.setHex(s.overdrive ? PALETTE.amber : PALETTE.cyan);
      this.exhaustMats[i].opacity = 0.55 + turb * 0.35;
    }
    this.underMat.opacity = 0.28 + Math.min(0.45, 0.18 + s.speed / 260);

    // shield bubble breathe + pop
    if (this.shield) {
      this.shieldPop = Math.max(0, this.shieldPop - dt * 2.4);
      const p = 1 - this.shieldPop;
      const scale = 1 + Math.sin(s.time * 3.4) * 0.03 + this.shieldPop * 0.55;
      this.bubble.scale.setScalar(scale);
      this.bubble.rotation.y += dt * 0.9;
      this.bubble.rotation.x += dt * 0.4;
      this.bubbleMat.opacity = 0.14 + 0.12 * p + Math.sin(s.time * 6) * 0.03;
    }

    // damage flash on the shell
    this.flash = Math.max(0, this.flash - dt * 2.6);
    const boost = this.flash * 3;
    for (const m of this.shellMats) m.emissiveIntensity = this.baseEmissive + boost + (s.overdrive ? 0.25 : 0);

    // blink while invulnerable after a hit
    const blink = s.invuln > 0 && s.alive ? Math.floor(s.time * 18) % 2 === 0 : false;
    this.root.visible = s.alive ? !blink : true;
    if (!s.alive) {
      // wrecked: spin out and tumble
      this.tilt.rotation.z += dt * 2.2;
      this.tilt.rotation.x += dt * 1.3;
      this.hull.rotation.y += dt * 1.7;
    }
  }

  /** Hard reset for a new run. */
  respawn(): void {
    this.tilt.position.set(0, 0, 0);
    this.tilt.rotation.set(0, 0, 0);
    this.hull.rotation.set(0, 0, 0);
    this.hull.scale.set(1, 1, 1);
    this.hull.position.set(0, 0, 0);
    this.root.visible = true;
    this.flash = 0;
    this.setShield(false);
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.shellMats.forEach((m) => m.dispose());
    this.glowMats.forEach((m) => m.dispose());
    this.root.parent?.remove(this.root);
  }
}
