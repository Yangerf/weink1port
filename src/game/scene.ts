import * as THREE from 'three';
import { FOG_COLOR, PALETTE, ROAD_EDGE, ROAD_W, SPAWN_Z } from './config';
import { gridTexture, nebulaTexture, roadTexture, tunnelTexture, wallTexture } from './materials';
import { getGlowTexture } from './textures';

interface Scroller {
  tex: THREE.Texture;
  /** world metres represented by one texture tile */
  tile: number;
  axis: 'x' | 'y';
  dir: 1 | -1;
}

/**
 * Everything that is not gameplay: the road, the neon canyon, the starfield
 * and the speed cues. Static geometry scrolls via texture offsets, while the
 * arches/pylons/streaks are instanced and recycled.
 */
export class World {
  private root = new THREE.Group();
  private scrollers: Scroller[] = [];
  private archMat: THREE.MeshBasicMaterial;
  private railMat: THREE.MeshBasicMaterial;
  private arches: THREE.Mesh[] = [];
  private pylonMesh: THREE.InstancedMesh;
  private pylonMat: THREE.MeshBasicMaterial;
  private streakGeo: THREE.BufferGeometry;
  private streakPos: Float32Array;
  private streaks: THREE.Points;
  private dummy = new THREE.Object3D();
  private baseRail = new THREE.Color(PALETTE.cyan);
  private hotRail = new THREE.Color(PALETTE.amber);
  private boostAmount = 0;

  private readonly archCount = 18;
  private readonly archGap = 26;
  private readonly pylonCount = 40;
  private readonly pylonGap = 18;

  constructor(scene: THREE.Scene) {
    this.root.name = 'world';
    scene.add(this.root);

    scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0125);

    const LEN = 900;
    const center = SPAWN_Z * 0.5 - 40; // cover from far spawn to just behind the ship

    // ------------------------------------------------------------ floor ----
    const grid = gridTexture();
    grid.repeat.set(150, 300);
    const floorMat = new THREE.MeshBasicMaterial({ map: grid, fog: true });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, LEN), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.05, center);
    this.root.add(floor);
    this.scrollers.push({ tex: grid, tile: 4, axis: 'y', dir: 1 });

    // ------------------------------------------------------------- road ----
    const road = roadTexture();
    road.repeat.set(1, LEN / 16);
    const roadMat = new THREE.MeshBasicMaterial({ map: road, fog: true });
    const roadMesh = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, LEN), roadMat);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(0, 0.01, center);
    this.root.add(roadMesh);
    this.scrollers.push({ tex: road, tile: 16, axis: 'y', dir: 1 });

    // glowing kerb strips
    const kerbMat = new THREE.MeshBasicMaterial({
      color: PALETTE.ice,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    for (const sx of [-1, 1]) {
      const kerb = new THREE.Mesh(new THREE.PlaneGeometry(0.4, LEN), kerbMat);
      kerb.rotation.x = -Math.PI / 2;
      kerb.position.set(sx * (ROAD_EDGE - 0.18), 0.03, center);
      this.root.add(kerb);
    }

    // ------------------------------------------------------------ walls ----
    const wallTexA = wallTexture();
    wallTexA.repeat.set(LEN / 10, 1);
    const wallTexB = wallTexA.clone();
    wallTexB.needsUpdate = true;
    const wallGeo = new THREE.PlaneGeometry(LEN, 4.6);
    for (const sx of [-1, 1]) {
      const tex = sx < 0 ? wallTexA : wallTexB;
      tex.repeat.set(LEN / 10, 1);
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, fog: true });
      const wall = new THREE.Mesh(wallGeo, mat);
      wall.position.set(sx * (ROAD_EDGE + 1.3), 2.3, center);
      wall.rotation.y = (sx * Math.PI) / 2;
      this.root.add(wall);
      this.scrollers.push({ tex, tile: 10, axis: 'x', dir: sx < 0 ? 1 : -1 });
    }

    // neon rails along the top of both walls
    this.railMat = new THREE.MeshBasicMaterial({
      color: PALETTE.cyan,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.PlaneGeometry(0.5, LEN), this.railMat);
      rail.rotation.x = -Math.PI / 2;
      rail.position.set(sx * (ROAD_EDGE + 1.35), 4.62, center);
      this.root.add(rail);
      const haze = new THREE.Mesh(
        new THREE.PlaneGeometry(5, LEN),
        new THREE.MeshBasicMaterial({
          map: getGlowTexture(),
          color: PALETTE.violet,
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      haze.rotation.set(-Math.PI / 2, 0, 0);
      haze.position.set(sx * (ROAD_EDGE + 2.6), 0.35, center);
      this.root.add(haze);
    }

    // ------------------------------------------------------------ arches ---
    const archGeo = new THREE.TorusGeometry(ROAD_EDGE + 1.1, 0.085, 6, 48, Math.PI);
    this.archMat = new THREE.MeshBasicMaterial({
      color: PALETTE.cyan,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: true,
    });
    for (let i = 0; i < this.archCount; i++) {
      const arch = new THREE.Mesh(archGeo, this.archMat);
      arch.position.set(0, 0.1, 20 - i * this.archGap);
      this.root.add(arch);
      this.arches.push(arch);
    }

    // ------------------------------------------------------------ pylons ---
    this.pylonMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.magenta),
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      fog: true,
    });
    const pylonGeo = new THREE.BoxGeometry(0.34, 3.2, 0.34);
    this.pylonMesh = new THREE.InstancedMesh(pylonGeo, this.pylonMat, this.pylonCount);
    this.pylonMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pylonMesh.frustumCulled = false;
    this.root.add(this.pylonMesh);

    // ----------------------------------------------------------- streaks ---
    const n = 220;
    this.streakPos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.streakPos[i * 3] = (Math.random() - 0.5) * 34;
      this.streakPos[i * 3 + 1] = Math.random() * 9 + 0.2;
      this.streakPos[i * 3 + 2] = 20 - Math.random() * 600;
    }
    this.streakGeo = new THREE.BufferGeometry();
    this.streakGeo.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3));
    this.streaks = new THREE.Points(
      this.streakGeo,
      new THREE.PointsMaterial({
        size: 0.2,
        map: getGlowTexture(),
        color: new THREE.Color(PALETTE.cyan),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        toneMapped: false,
      }),
    );
    this.streaks.frustumCulled = false;
    this.root.add(this.streaks);

    // ------------------------------------------------------------- stars ---
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(700, 32, 20),
      new THREE.MeshBasicMaterial({ map: nebulaTexture(), side: THREE.BackSide, fog: false, toneMapped: false }),
    );
    sky.position.y = 40;
    this.root.add(sky);

    // ------------------------------------------------------------ lights ---
    scene.add(new THREE.AmbientLight(0x4a5b86, 1.1));
    const key = new THREE.DirectionalLight(0xdfefff, 1.5);
    key.position.set(-6, 14, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(PALETTE.magenta, 0.9);
    rim.position.set(9, 4, -12);
    scene.add(rim);
    const fill = new THREE.PointLight(PALETTE.cyan, 2.4, 40, 2);
    fill.position.set(0, 4, -6);
    scene.add(fill);

    // ------------------------------------------------- optional tunnel shell --
    // A dim far shell adds depth without costing much: one material, one mesh.
    const shellTex = tunnelTexture();
    shellTex.repeat.set(4, 12);
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(60, 60, 900, 24, 1, true),
      new THREE.MeshBasicMaterial({
        map: shellTex,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.5,
        fog: true,
        toneMapped: false,
      }),
    );
    shell.rotation.x = Math.PI / 2;
    shell.position.set(0, 12, center);
    this.root.add(shell);
    this.scrollers.push({ tex: shellTex, tile: 24, axis: 'y', dir: 1 });
  }

  /** Fired on hits / overdrive so the corridor flashes warm. */
  flash(amount: number): void {
    this.boostAmount = Math.min(1.6, this.boostAmount + amount);
  }

  update(dt: number, distance: number, speed: number, time: number, overdrive: boolean): void {
    // scroll the road / walls / shell
    for (const s of this.scrollers) {
      const v = (distance / s.tile) * s.dir;
      if (s.axis === 'y') s.tex.offset.y = v;
      else s.tex.offset.x = v;
    }

    // arches ride toward the player and wrap
    const span = this.archCount * this.archGap;
    for (const arch of this.arches) {
      arch.position.z += speed * dt;
      if (arch.position.z > 30) arch.position.z -= span;
    }

    // pylons: two columns, recycled (mod keeps them moving toward the camera)
    const period = (this.pylonCount / 2) * this.pylonGap;
    const mod = (a: number, b: number) => ((a % b) + b) % b;
    let i = 0;
    for (let side = -1; side <= 1; side += 2) {
      for (let k = 0; k < this.pylonCount / 2; k++) {
        const z = 20 - mod(k * this.pylonGap - distance, period);
        this.dummy.position.set(side * (ROAD_EDGE + 4.2), 1.6, z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        this.pylonMesh.setMatrixAt(i++, this.dummy.matrix);
      }
    }
    this.pylonMesh.instanceMatrix.needsUpdate = true;

    // streaks blaze toward the camera, faster than the world
    const sp = this.streakPos;
    const v = speed * 3.2 * dt;
    for (let k = 0; k < sp.length; k += 3) {
      sp[k + 2] += v;
      if (sp[k + 2] > 22) {
        sp[k + 2] = -620 + Math.random() * 40;
        sp[k] = (Math.random() - 0.5) * 34;
        sp[k + 1] = Math.random() * 9 + 0.2;
      }
    }
    (this.streakGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

    // overdrive warms the whole corridor up
    this.boostAmount = Math.max(0, this.boostAmount - dt * 1.2);
    const hot = Math.min(1, (overdrive ? 0.55 : 0) + this.boostAmount * 0.6);
    const pulse = 0.5 + Math.sin(time * (4 + hot * 8)) * 0.5;
    this.railMat.color.copy(this.baseRail).lerp(this.hotRail, hot);
    this.railMat.opacity = 0.55 + pulse * 0.35;
    this.archMat.color.copy(this.baseRail).lerp(new THREE.Color(PALETTE.violet), hot * 0.8);
    this.archMat.opacity = 0.55 + pulse * 0.4;
    this.pylonMat.color
      .setHex(PALETTE.magenta)
      .lerp(new THREE.Color(PALETTE.amber), hot * 0.7);
    this.streaks.rotation.z = 0;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.pylonMesh.geometry.dispose();
    this.archMat.dispose();
    this.railMat.dispose();
    this.pylonMat.dispose();
    (this.streaks.material as THREE.Material).dispose();
    this.root.parent?.remove(this.root);
  }
}
