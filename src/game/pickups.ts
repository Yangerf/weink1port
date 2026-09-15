import * as THREE from 'three';
import { DESPAWN_Z, PALETTE } from './config';
import { getGlowTexture, getRingTexture } from './textures';

/** The player's collision box, as seen by the pickup system. */
export interface PlayerBox {
  x: number;
  y: number;
  z: number;
  halfW: number;
  halfH: number;
}

export type PickupKind = 'orb' | 'shield' | 'boost';

export interface Orb {
  active: boolean;
  x: number;
  y: number;
  z: number;
  phase: number;
  magnet: number;
}

interface PowerVisual {
  shell: THREE.Mesh;
  core: THREE.Mesh;
  halo: THREE.Mesh;
}

export interface Power {
  active: boolean;
  kind: 'shield' | 'boost';
  x: number;
  y: number;
  z: number;
  phase: number;
  group: THREE.Group;
  visual: PowerVisual;
  magnet: number;
}

const MAX_ORBS = 240;
const MAX_POWERS = 6;

/* ------------------------------------------------------------------ VFX -- */

/** Pooled impact rings (both floor-aligned and camera-facing). */
export class Shockwaves {
  private items: { mesh: THREE.Mesh; life: number; max: number; scale: number }[] = [];
  private rings: THREE.MeshBasicMaterial[] = [];

  constructor(parent: THREE.Object3D, count = 10) {
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: getRingTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        opacity: 0.9,
      });
      this.rings.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      parent.add(mesh);
      this.items.push({ mesh, life: 0, max: 0.5, scale: 3 });
    }
  }

  trigger(x: number, y: number, z: number, scale: number, life: number, floor: boolean, color: number): void {
    const it = this.items.find((i) => !i.mesh.visible) ?? this.items[0];
    it.mesh.visible = true;
    it.mesh.position.set(x, y, z);
    it.mesh.rotation.set(floor ? -Math.PI / 2 : 0, 0, 0);
    it.life = life;
    it.max = life;
    it.scale = scale;
    it.mesh.scale.setScalar(0.25);
    const mat = it.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = 0.9;
  }

  update(dt: number): void {
    for (const it of this.items) {
      if (!it.mesh.visible) continue;
      it.life -= dt;
      const t = Math.min(1, 1 - Math.max(it.life, 0) / it.max);
      it.mesh.scale.setScalar(0.25 + it.scale * Math.sin(t * Math.PI * 0.5));
      (it.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t) ** 1.6;
      if (it.life <= 0) it.mesh.visible = false;
    }
  }

  dispose(): void {
    this.items.forEach((i) => i.mesh.geometry.dispose());
    this.rings.forEach((m) => m.dispose());
    this.rings = [];
  }
}

/** Additive spark particles — the whole pool is a single draw call. */
export class Sparks {
  private points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private base: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private cursor = 0;
  private readonly count: number;

  constructor(parent: THREE.Object3D, count = 480) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -999;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.34,
      map: getGlowTexture(),
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      toneMapped: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    parent.add(this.points);
  }

  private spawn(
    x: number,
    y: number,
    z: number,
    color: THREE.Color,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    bright: number,
  ): void {
    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const i3 = idx * 3;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.base[i3] = color.r * bright;
    this.base[i3 + 1] = color.g * bright;
    this.base[i3 + 2] = color.b * bright;
    this.col[i3] = this.base[i3];
    this.col[i3 + 1] = this.base[i3 + 1];
    this.col[i3 + 2] = this.base[i3 + 2];
    this.life[idx] = life;
    this.maxLife[idx] = life;
  }

  burst(x: number, y: number, z: number, color: THREE.Color, n = 14, spread = 6, up = 2.5): void {
    for (let i = 0; i < n; i++) {
      this.spawn(
        x,
        y,
        z,
        color,
        (Math.random() - 0.5) * spread,
        Math.random() * up + 0.6,
        (Math.random() - 0.4) * spread,
        0.45 + Math.random() * 0.45,
        0.8 + Math.random() * 0.7,
      );
    }
  }

  /** Continuous emitter used for the engine trail. */
  emit(x: number, y: number, z: number, color: THREE.Color, spread = 1.1): void {
    this.spawn(
      x,
      y,
      z,
      color,
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread * 0.6 + 0.5,
      5 + Math.random() * 7,
      0.28 + Math.random() * 0.32,
      0.7 + Math.random() * 0.6,
    );
  }

  update(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.pos[i3 + 1] = -999;
        this.col[i3] = this.col[i3 + 1] = this.col[i3 + 2] = 0;
        continue;
      }
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.vel[i3 + 1] -= 11 * dt;

      // additive blending: fading the colour toward black is the fade-out
      const f = (this.life[i] / this.maxLife[i]) ** 1.7;
      this.col[i3] = this.base[i3] * f;
      this.col[i3 + 1] = this.base[i3 + 1] * f;
      this.col[i3 + 2] = this.base[i3 + 2] * f;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  reset(): void {
    for (let i = 0; i < this.count; i++) {
      this.life[i] = 0;
      this.pos[i * 3 + 1] = -999;
      this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.parent?.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/* ------------------------------------------------------------- pickups --- */

export class PickupField {
  private orbs: Orb[] = [];
  private powers: Power[] = [];
  private orbMesh: THREE.InstancedMesh;
  private haloMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private orbMat: THREE.MeshStandardMaterial;
  private haloMat: THREE.MeshBasicMaterial;
  private powerMats: THREE.Material[] = [];
  private root: THREE.Group;

  orbCount = 0;
  private events: { kind: PickupKind; x: number; y: number; z: number }[] = [];
  private powerLookup!: {
    shieldMat: THREE.Material;
    boostMat: THREE.Material;
    coreShield: THREE.Material;
    coreBoost: THREE.Material;
    haloShield: THREE.Material;
    haloBoost: THREE.Material;
  };

  constructor(parent: THREE.Object3D) {
    this.root = new THREE.Group();
    this.root.name = 'pickups';
    parent.add(this.root);

    this.orbMat = new THREE.MeshStandardMaterial({
      color: 0x0b1a24,
      emissive: new THREE.Color(PALETTE.cyan),
      emissiveIntensity: 1.6,
      roughness: 0.25,
      metalness: 0.4,
    });
    this.haloMat = new THREE.MeshBasicMaterial({
      map: getGlowTexture(),
      color: PALETTE.cyan,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.5,
    });

    for (let i = 0; i < MAX_ORBS; i++) {
      this.orbs.push({ active: false, x: 0, y: 0.95, z: 0, phase: 0, magnet: 0 });
    }

    this.orbMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.23, 0), this.orbMat, MAX_ORBS);
    this.orbMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.orbMesh.frustumCulled = false;
    this.orbMesh.visible = false;

    this.haloMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.5), this.haloMat, MAX_ORBS);
    this.haloMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.haloMesh.frustumCulled = false;
    this.haloMesh.visible = false;
    this.root.add(this.orbMesh, this.haloMesh);

    // --------------------------------------------------------- power-ups ---
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0x0a1c14,
      emissive: new THREE.Color(PALETTE.lime),
      emissiveIntensity: 1.5,
      roughness: 0.3,
      metalness: 0.4,
    });
    const boostMat = new THREE.MeshStandardMaterial({
      color: 0x231007,
      emissive: new THREE.Color(PALETTE.amber),
      emissiveIntensity: 1.5,
      roughness: 0.3,
      metalness: 0.4,
    });
    const coreShield = new THREE.MeshBasicMaterial({ color: PALETTE.lime, toneMapped: false });
    const coreBoost = new THREE.MeshBasicMaterial({ color: PALETTE.amber, toneMapped: false });
    const haloShield = new THREE.MeshBasicMaterial({
      map: getGlowTexture(),
      color: PALETTE.lime,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.55,
    });
    const haloBoost = haloShield.clone();
    haloBoost.color.setHex(PALETTE.amber);
    this.powerMats.push(shieldMat, boostMat, coreShield, coreBoost, haloShield, haloBoost);

    const shellGeo = new THREE.OctahedronGeometry(0.44, 0);
    const coreGeo = new THREE.IcosahedronGeometry(0.2, 0);
    const haloGeo = new THREE.PlaneGeometry(2.6, 2.6);

    for (let i = 0; i < MAX_POWERS; i++) {
      const group = new THREE.Group();
      const shell = new THREE.Mesh(shellGeo, shieldMat);
      const core = new THREE.Mesh(coreGeo, coreShield);
      const halo = new THREE.Mesh(haloGeo, haloShield);
      group.add(shell, core, halo);
      group.visible = false;
      this.root.add(group);
      this.powers.push({
        active: false,
        kind: 'shield',
        x: 0,
        y: 1.15,
        z: 0,
        phase: 0,
        group,
        visual: { shell, core, halo },
        magnet: 0,
      });
    }
    this.powerLookup = { shieldMat, boostMat, coreShield, coreBoost, haloShield, haloBoost };
  }

  spawnOrb(x: number, z: number, y = 0.95): void {
    const o = this.orbs.find((v) => !v.active);
    if (!o) return;
    o.active = true;
    o.x = x;
    o.y = y;
    o.z = z;
    o.phase = Math.random() * 6.28;
    o.magnet = 0;
  }

  spawnPower(kind: 'shield' | 'boost', x: number, z: number): void {
    const p = this.powers.find((v) => !v.active);
    if (!p) return;
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = 1.15;
    p.z = z;
    p.phase = 0;
    p.magnet = 0;
    p.group.visible = true;
    p.visual.shell.material = kind === 'shield' ? this.powerLookup.shieldMat : this.powerLookup.boostMat;
    p.visual.core.material = kind === 'shield' ? this.powerLookup.coreShield : this.powerLookup.coreBoost;
    p.visual.halo.material = kind === 'shield' ? this.powerLookup.haloShield : this.powerLookup.haloBoost;
  }

  /** Moves/animated every pickup and resolves collection against the player box. */
  update(dt: number, worldSpeed: number, player: PlayerBox, magnetRange: number): void {
    const { x: px, y: py, z: pz } = player;

    for (const o of this.orbs) {
      if (!o.active) continue;
      o.phase += dt;
      const dx = o.x - px;
      const dz = o.z - pz;
      if (Math.hypot(dx, dz) < magnetRange && dz > -2 && dz < 7) {
        o.magnet = Math.min(1, o.magnet + dt * 4);
      }
      if (o.magnet > 0) {
        const pull = o.magnet * dt * (8 + worldSpeed * 0.16);
        o.x -= dx * Math.min(pull * 0.4, 0.6);
        o.z -= dz * Math.min(pull * 0.2, 0.4);
        o.y += (py - o.y) * Math.min(pull * 0.25, 0.4);
      }
      o.z += worldSpeed * dt;

      if (
        Math.abs(o.x - px) < player.halfW + 0.45 &&
        Math.abs(o.z - pz) < 0.95 &&
        o.y > py - player.halfH - 0.55 &&
        o.y < py + player.halfH + 0.55
      ) {
        o.active = false;
        this.orbCount++;
        this.events.push({ kind: 'orb', x: o.x, y: o.y, z: o.z });
      } else if (o.z > DESPAWN_Z) {
        o.active = false;
      }
    }

    for (const p of this.powers) {
      if (!p.active) continue;
      p.phase += dt;
      const dx = p.x - px;
      const dz = p.z - pz;
      if (Math.hypot(dx, dz) < magnetRange + 1.6 && dz > -2 && dz < 7) {
        p.magnet = Math.min(1, p.magnet + dt * 3);
      }
      if (p.magnet > 0) {
        const pull = p.magnet * dt * 6;
        p.x -= dx * Math.min(pull * 0.35, 0.5);
        p.y += (py - p.y) * Math.min(pull * 0.25, 0.4);
      }
      p.z += worldSpeed * dt;
      p.group.position.set(p.x, p.y + Math.sin(p.phase * 2.4) * 0.14, p.z);
      p.group.rotation.y += dt * 1.9;
      p.group.rotation.x += dt * 1.1;

      if (
        Math.abs(p.x - px) < player.halfW + 0.8 &&
        Math.abs(p.z - pz) < 1.1 &&
        p.y > py - player.halfH - 0.9 &&
        p.y < py + player.halfH + 0.9
      ) {
        p.active = false;
        p.group.visible = false;
        this.events.push({ kind: p.kind, x: p.x, y: p.y, z: p.z });
      } else if (p.z > DESPAWN_Z) {
        p.active = false;
        p.group.visible = false;
      }
    }
  }

  /** Pushes instance transforms to the GPU after an update. */
  sync(time: number): void {
    let any = false;
    for (let i = 0; i < this.orbs.length; i++) {
      const o = this.orbs[i];
      const i3 = i;
      if (o.active) {
        any = true;
        const bob = Math.sin(time * 3 + o.phase) * 0.09;
        this.dummy.position.set(o.x, o.y + bob, o.z);
        this.dummy.rotation.set(o.phase * 1.7, o.phase * 2.3, 0);
        this.dummy.scale.setScalar(1 + Math.sin(time * 5 + o.phase) * 0.12);
        this.dummy.updateMatrix();
        this.orbMesh.setMatrixAt(i3, this.dummy.matrix);

        this.dummy.position.set(o.x, o.y + bob, o.z);
        this.dummy.rotation.set(0, 0, o.phase * 0.8);
        this.dummy.scale.setScalar(1 + Math.sin(time * 6 + o.phase) * 0.18);
        this.dummy.updateMatrix();
        this.haloMesh.setMatrixAt(i3, this.dummy.matrix);
      } else {
        this.dummy.position.set(0, -999, 0);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(0.001);
        this.dummy.updateMatrix();
        this.orbMesh.setMatrixAt(i3, this.dummy.matrix);
        this.haloMesh.setMatrixAt(i3, this.dummy.matrix);
      }
    }
    this.orbMesh.instanceMatrix.needsUpdate = true;
    this.haloMesh.instanceMatrix.needsUpdate = true;
    this.orbMesh.visible = any;
    this.haloMesh.visible = any;
  }

  takeEvents(): { kind: PickupKind; x: number; y: number; z: number }[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  reset(): void {
    this.orbs.forEach((o) => (o.active = false));
    this.powers.forEach((p) => {
      p.active = false;
      p.group.visible = false;
    });
    this.orbCount = 0;
    this.events = [];
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    this.orbMesh.geometry.dispose();
    this.haloMesh.geometry.dispose();
    this.orbMat.dispose();
    this.haloMat.dispose();
    this.powerMats.forEach((m) => m.dispose());
    this.powerMats = [];
  }
}
