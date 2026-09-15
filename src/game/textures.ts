import * as THREE from 'three';

/**
 * Tiny procedurally generated textures — the game ships as a single HTML file
 * so there are no external assets to load.
 */

let glowTex: THREE.Texture | null = null;
let ringTex: THREE.Texture | null = null;
let shadowTex: THREE.Texture | null = null;

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

/** Soft radial dot — used for engine trails, sparks and halos. */
export function getGlowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const [c, ctx] = canvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** Thin ring — used for shockwaves. */
export function getRingTexture(): THREE.Texture {
  if (ringTex) return ringTex;
  const [c, ctx] = canvas(256);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.stroke();
  ringTex = new THREE.CanvasTexture(c);
  ringTex.colorSpace = THREE.SRGBColorSpace;
  return ringTex;
}

/** Soft blob — the ship's drop shadow, which sells the jump height. */
export function getShadowTexture(): THREE.Texture {
  if (shadowTex) return shadowTex;
  const [c, ctx] = canvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

export function disposeTextures(): void {
  glowTex?.dispose();
  ringTex?.dispose();
  shadowTex?.dispose();
  glowTex = ringTex = shadowTex = null;
}
