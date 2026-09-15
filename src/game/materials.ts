import * as THREE from 'three';

/**
 * Procedural glow textures for the tunnel scenery and the hazards.
 * Everything is drawn on 2D canvases at boot: no asset downloads, no CORS,
 * and the game still works when opened straight from disk.
 */

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

const cache = new Map<string, THREE.Texture>();
function memo(key: string, build: () => THREE.Texture): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const t = build();
  cache.set(key, t);
  return t;
}

/* ------------------------------------------------------------ obstacles -- */

/** Warning-striped barrier face, tinted per hazard colour. */
export function barrierTexture(colorHex: string, label: string): THREE.Texture {
  return memo(`barrier:${colorHex}:${label}`, () => {
    const [c, ctx] = mk(512, 256);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(8,10,18,0.96)');
    g.addColorStop(0.5, 'rgba(14,18,32,0.9)');
    g.addColorStop(1, 'rgba(8,10,18,0.96)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);

    // diagonal hazard stripes
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 16;
    for (let x = -256; x < 640; x += 56) {
      ctx.beginPath();
      ctx.moveTo(x, 256);
      ctx.lineTo(x + 256, 0);
      ctx.stroke();
    }
    ctx.restore();

    // scan lines
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = colorHex;
    for (let y = 0; y < 256; y += 8) ctx.fillRect(0, y, 512, 2);
    ctx.globalAlpha = 1;

    // edge rails
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, 512, 7);
    ctx.fillRect(0, 249, 512, 7);

    // repeated label
    ctx.fillStyle = 'rgba(240,250,255,0.92)';
    ctx.font = 'bold 40px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      ctx.fillText(label, 24 + i * 170, 132);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  });
}

/** Emissive grid panel used for the solid walls / drones. */
export function panelTexture(colorHex: string): THREE.Texture {
  return memo(`panel:${colorHex}`, () => {
    const [c, ctx] = mk(256, 256);
    ctx.fillStyle = 'rgba(6,8,14,0.97)';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = colorHex;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, 256, 10);
    ctx.fillRect(0, 246, 256, 10);
    ctx.fillRect(0, 0, 10, 256);
    ctx.fillRect(246, 0, 10, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  });
}

/* --------------------------------------------------------------- tunnel -- */

/** Endless tunnel shell: rings + panel seams, scrolled along the tube axis. */
export function tunnelTexture(): THREE.Texture {
  return memo('tunnel', () => {
    const [c, ctx] = mk(1024, 512);
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, 1024, 512);

    // longitudinal seams
    ctx.strokeStyle = 'rgba(62,240,255,0.16)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= 1024; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }

    // ring gates
    const ringCols = ['rgba(62,240,255,', 'rgba(155,75,255,', 'rgba(255,47,157,'];
    for (let i = 0; i < 8; i++) {
      const y = i * 64 + 16;
      const col = ringCols[i % ringCols.length];
      ctx.strokeStyle = `${col}0.85)`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1024, y);
      ctx.stroke();
      ctx.strokeStyle = `${col}0.18)`;
      ctx.lineWidth = 26;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1024, y);
      ctx.stroke();
    }

    // small tick marks
    ctx.fillStyle = 'rgba(223,243,255,0.5)';
    for (let x = 0; x < 1024; x += 128) {
      ctx.fillRect(x, 0, 3, 14);
      ctx.fillRect(x, 498, 3, 14);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  });
}

/** Earth-like fractal noise used by the starfield / nebula dome. */
export function nebulaTexture(): THREE.Texture {
  return memo('nebula', () => {
    const size = 256;
    const [c, ctx] = mk(size, size);
    ctx.fillStyle = '#03040a';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 1.6 + 0.2;
      const a = Math.random() * 0.5;
      ctx.fillStyle = Math.random() > 0.7 ? `rgba(160,210,255,${a})` : `rgba(120,130,190,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // a few soft nebula blobs
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 12 + Math.random() * 44;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const hue = [190, 280, 320][i % 3];
      g.addColorStop(0, `hsla(${hue}, 90%, 60%, 0.16)`);
      g.addColorStop(1, 'hsla(0,0%,0%,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/** One road tile: 3 lanes of asphalt, lane dashes and glowing kerbs. */
export function roadTexture(): THREE.Texture {
  return memo('road', () => {
    const W = 256;
    const H = 512;
    const [c, ctx] = mk(W, H);
    ctx.fillStyle = '#070810';
    ctx.fillRect(0, 0, W, H);

    // asphalt speckle
    for (let i = 0; i < 2200; i++) {
      ctx.fillStyle = `rgba(${90 + Math.random() * 60},${110 + Math.random() * 60},${150 + Math.random() * 70},${Math.random() * 0.06})`;
      ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
    }

    // lane dashes at u = 1/6 and 5/6
    ctx.fillStyle = 'rgba(200,232,255,0.5)';
    for (const u of [W / 6, (W * 5) / 6]) {
      for (let y = 0; y < H; y += 128) ctx.fillRect(u - 2, y, 4, 64);
    }

    // kerb glow
    const kerb = ctx.createLinearGradient(0, 0, 26, 0);
    kerb.addColorStop(0, 'rgba(62,240,255,0.85)');
    kerb.addColorStop(1, 'rgba(62,240,255,0)');
    ctx.fillStyle = kerb;
    ctx.fillRect(0, 0, 26, H);
    const kerb2 = ctx.createLinearGradient(W, 0, W - 26, 0);
    kerb2.addColorStop(0, 'rgba(62,240,255,0.85)');
    kerb2.addColorStop(1, 'rgba(62,240,255,0)');
    ctx.fillStyle = kerb2;
    ctx.fillRect(W - 26, 0, 26, H);

    // transverse scan line for motion feedback
    ctx.fillStyle = 'rgba(155,75,255,0.10)';
    ctx.fillRect(0, 0, W, 3);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  });
}

/** Cyan lattice for the void floor. */
export function gridTexture(): THREE.Texture {
  return memo('grid', () => {
    const S = 128;
    const [c, ctx] = mk(S, S);
    ctx.fillStyle = '#03040a';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(62,240,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(62,240,255,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(S / 2, 0);
    ctx.lineTo(S / 2, S);
    ctx.moveTo(0, S / 2);
    ctx.lineTo(S, S / 2);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  });
}

/** Corridor wall panels: seams, pipes and service lights. */
export function wallTexture(): THREE.Texture {
  return memo('wall', () => {
    const W = 256;
    const H = 256;
    const [c, ctx] = mk(W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0d1a');
    g.addColorStop(1, '#05060d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // panel seams
    ctx.strokeStyle = 'rgba(120,150,190,0.22)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= W; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(120,150,190,0.14)';
    for (let y = 0; y <= H; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // pipes
    ctx.fillStyle = 'rgba(70,90,130,0.5)';
    ctx.fillRect(0, 26, W, 6);
    ctx.fillRect(0, 210, W, 4);

    // service lights
    for (let x = 32; x < W; x += 64) {
      const lg = ctx.createRadialGradient(x, 128, 0, x, 128, 26);
      lg.addColorStop(0, 'rgba(62,240,255,0.55)');
      lg.addColorStop(1, 'rgba(62,240,255,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(x - 26, 102, 52, 52);
      ctx.fillStyle = 'rgba(223,243,255,0.9)';
      ctx.fillRect(x - 3, 125, 6, 6);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    return tex;
  });
}

export function disposeMaterials(): void {
  cache.forEach((t) => t.dispose());
  cache.clear();
}
