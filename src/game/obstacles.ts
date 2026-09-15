import * as THREE from 'three';
import { LANE_W, PALETTE } from './config';
import { barrierTexture, panelTexture } from './materials';

/**
 * Hazards are pooled: every slot owns one prebuilt group per variant and
 * spawning is just a visibility + transform swap, so nothing allocates
 * geometry during a run (no GC hitches at 200 km/h).
 */

export type ObstacleKind = 'low' | 'wall' | 'high' | 'drone';

export interface Obstacle {
  kind: ObstacleKind;
  active: boolean;
  /** lane index relative to the road centre: -1, 0, 1 */
  lane: number;
  /** how many lanes the hazard occupies */
  span: number;
  /** world Z of the hazard centre */
  z: number;
  x: number;
  /** collision box, in world units */
  halfW: number;
  minY: number;
  maxY: number;
  /** extra velocity along Z (drones crawl toward the player) */
  vel: number;
  phase: number;
  /** true once the vicinity score has been handed out */
  rewarded: boolean;
}

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const UNIT_RING = new THREE.TorusGeometry(1, 0.06, 6, 24);

interface Slot {
  root: THREE.Group;
  low: THREE.Group;
  wall: THREE.Group;
  high: THREE.Group;
  drone: THREE.Group;
}

export class ObstacleField {
  readonly list: Obstacle[] = [];
  private slots: Slot[] = [];
  private root = new THREE.Group();
  private lowMats: THREE.MeshStandardMaterial[] = [];
  private wallMats: THREE.MeshStandardMaterial[] = [];
  private droneMats: THREE.MeshStandardMaterial[] = [];

  constructor(parent: THREE.Object3D, count = 18) {
    this.root.name = 'hazards';
    parent.add(this.root);
    for (let i = 0; i < count; i++) {
      const slot = this.buildSlot();
      slot.root.visible = false;
      this.root.add(slot.root);
      this.slots.push(slot);
      this.list.push({
        kind: 'low',
        active: false,
        lane: 0,
        span: 1,
        z: 0,
        x: 0,
        halfW: LANE_W / 2,
        minY: 0,
        maxY: 1.2,
        vel: 0,
        phase: 0,
        rewarded: false,
      });
    }
  }

  /* ------------------------------------------------------------ building -- */

  private box(
    group: THREE.Group,
    mat: THREE.Material,
    size: [number, number, number],
    pos: [number, number, number],
  ): THREE.Mesh {
    const m = new THREE.Mesh(UNIT, mat);
    m.scale.set(size[0], size[1], size[2]);
    m.position.set(pos[0], pos[1], pos[2]);
    m.castShadow = false;
    m.receiveShadow = false;
    group.add(m);
    return m;
  }

  private buildSlot(): Slot {
    const root = new THREE.Group();
    const low = new THREE.Group();
    const wall = new THREE.Group();
    const high = new THREE.Group();
    const drone = new THREE.Group();

    // ------------------------------------------------------------ barrier --
    const lowMat = new THREE.MeshStandardMaterial({
      map: barrierTexture('#ffb03a', 'JUMP'),
      emissive: new THREE.Color(PALETTE.amber),
      emissiveIntensity: 0.5,
      emissiveMap: barrierTexture('#ffb03a', 'JUMP'),
      roughness: 0.45,
      metalness: 0.25,
    });
    const railMat = new THREE.MeshBasicMaterial({ color: PALETTE.amber, toneMapped: false });
    this.lowMats.push(lowMat);
    this.box(low, lowMat, [LANE_W - 0.24, 1.15, 0.5], [0, 0.62, 0]);
    this.box(low, railMat, [LANE_W - 0.24, 0.09, 0.62], [0, 1.2, 0]);
    this.box(low, railMat, [0.09, 1.24, 0.62], [-(LANE_W - 0.24) / 2, 0.62, 0]);
    this.box(low, railMat, [0.09, 1.24, 0.62], [(LANE_W - 0.24) / 2, 0.62, 0]);

    // ------------------------------------------------- floating wall (slide) --
    const wallMat = new THREE.MeshStandardMaterial({
      map: panelTexture('#3ef0ff'),
      emissive: new THREE.Color(PALETTE.cyan),
      emissiveIntensity: 0.42,
      emissiveMap: panelTexture('#3ef0ff'),
      roughness: 0.4,
      metalness: 0.35,
    });
    const sillMat = new THREE.MeshBasicMaterial({ color: PALETTE.ice, toneMapped: false });
    const warnMat = new THREE.MeshBasicMaterial({ color: PALETTE.red, toneMapped: false });
    this.wallMats.push(wallMat);
    this.box(wall, wallMat, [LANE_W - 0.24, 2.5, 0.55], [0, 2.35, 0]);
    this.box(wall, sillMat, [LANE_W - 0.24, 0.07, 0.7], [0, 1.12, 0]);
    this.box(wall, warnMat, [LANE_W - 0.24, 0.07, 0.7], [0, 1.2, 0]);

    // --------------------------------------------------------- high gate ----
    const highMat = new THREE.MeshStandardMaterial({
      map: barrierTexture('#9b4bff', 'SLIDE'),
      emissive: new THREE.Color(PALETTE.violet),
      emissiveIntensity: 0.45,
      emissiveMap: barrierTexture('#9b4bff', 'SLIDE'),
      roughness: 0.45,
      metalness: 0.3,
    });
    this.wallMats.push(highMat);
    this.box(high, highMat, [LANE_W - 0.24, 1.6, 0.55], [0, 2.3, 0]);
    this.box(high, sillMat, [LANE_W - 0.24, 0.08, 0.7], [0, 1.52, 0]);

    // ------------------------------------------------------------- drone ----
    const droneMat = new THREE.MeshStandardMaterial({
      map: panelTexture('#ff2f9d'),
      emissive: new THREE.Color(PALETTE.magenta),
      emissiveIntensity: 0.6,
      emissiveMap: panelTexture('#ff2f9d'),
      roughness: 0.35,
      metalness: 0.5,
    });
    const ringMat = new THREE.MeshBasicMaterial({ color: PALETTE.magenta, toneMapped: false });
    const coreMat = new THREE.MeshBasicMaterial({ color: PALETTE.ice, toneMapped: false });
    this.droneMats.push(droneMat);
    this.box(drone, droneMat, [LANE_W - 0.3, 2.0, 1.1], [0, 1.65, 0]);
    const ring = new THREE.Mesh(UNIT_RING, ringMat);
    ring.scale.setScalar(1.35);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.65;
    drone.add(ring);
    const core = new THREE.Mesh(UNIT, coreMat);
    core.scale.set(0.5, 0.5, 1.3);
    core.position.set(0, 1.65, 0);
    drone.add(core);

    root.add(low, wall, high, drone);
    return { root, low, wall, high, drone };
  }

  /* -------------------------------------------------------------- spawn --- */

  spawn(kind: ObstacleKind, laneX: number, z: number, span = 1, lane = 0): Obstacle | null {
    const o = this.list.find((x) => !x.active) ?? null;
    if (!o) return null;
    const idx = this.list.indexOf(o);
    const slot = this.slots[idx];

    o.active = true;
    o.kind = kind;
    o.lane = lane;
    o.span = span;
    o.z = z;
    o.x = laneX;
    o.vel = kind === 'drone' ? -7 - Math.random() * 5 : 0;
    o.phase = 0;
    o.rewarded = false;

    const half = (span * LANE_W) / 2 - 0.14;
    o.halfW = half;

    switch (kind) {
      case 'low':
        o.minY = 0;
        o.maxY = 1.28;
        slot.low.scale.set(span, 1, 1);
        break;
      case 'wall':
        o.minY = 1.05;
        o.maxY = 3.7;
        slot.wall.scale.set(span, 1, 1);
        break;
      case 'high':
        o.minY = 1.45;
        o.maxY = 3.2;
        slot.high.scale.set(span, 1, 1);
        break;
      case 'drone':
        o.minY = 0.5;
        o.maxY = 2.8;
        break;
    }

    slot.low.visible = kind === 'low';
    slot.wall.visible = kind === 'wall';
    slot.high.visible = kind === 'high';
    slot.drone.visible = kind === 'drone';
    slot.root.visible = true;
    slot.root.position.set(laneX, 0, z);
    slot.root.scale.set(1, 0.02, 1); // grow-in stunt
    return o;
  }

  /* ------------------------------------------------------------- update --- */

  update(dt: number, worldSpeed: number, despawnZ: number): void {
    for (let i = 0; i < this.list.length; i++) {
      const o = this.list[i];
      if (!o.active) continue;
      const slot = this.slots[i];
      o.phase += dt;
      o.z += (worldSpeed - o.vel) * dt;

      // grow-in and drone hover animation
      const s = Math.min(1, o.phase * 6);
      slot.root.scale.y = 0.02 + 0.98 * s;
      slot.root.position.z = o.z;
      slot.root.position.x = o.x;
      if (o.kind === 'drone') {
        slot.root.position.y = Math.sin(o.phase * 2.2) * 0.18;
        slot.drone.rotation.y += dt * 0.9;
        slot.drone.rotation.z = Math.sin(o.phase * 1.4) * 0.06;
      } else {
        slot.root.position.y = 0;
      }

      if (o.z > despawnZ) {
        o.active = false;
        slot.root.visible = false;
      }
    }
  }

  recycleAll(): void {
    for (let i = 0; i < this.list.length; i++) {
      this.list[i].active = false;
      this.list[i].rewarded = false;
      this.slots[i].root.visible = false;
    }
  }

  /** Total emissive heat — drives the flash of the scene while hazards fly past. */
  pulseMaterials(time: number): void {
    const p = 0.42 + Math.sin(time * 4) * 0.14;
    for (const m of this.lowMats) m.emissiveIntensity = p + 0.12;
    for (const m of this.wallMats) m.emissiveIntensity = p;
    for (const m of this.droneMats) m.emissiveIntensity = p + 0.24;
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    for (const m of [...this.lowMats, ...this.wallMats, ...this.droneMats]) m.dispose();
    this.lowMats = [];
    this.wallMats = [];
    this.droneMats = [];
  }
}
