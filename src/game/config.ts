/**
 * HYPERTUNNEL — global tuning constants.
 * All units are metres / seconds so the physics and scoring stay readable.
 */

/* ------------------------------------------------------------- geometry -- */

/** Distance between lane centres. */
export const LANE_W = 2.8;
/** Lateral position of each lane. */
export const LANES = [-LANE_W, 0, LANE_W];
/** Total drivable width (3 lanes). */
export const ROAD_W = LANE_W * 3;
/** Half width of the road, where the neon rails live. */
export const ROAD_EDGE = ROAD_W / 2;

/** Where obstacles are born and where they are recycled. */
export const SPAWN_Z = -235;
export const DESPAWN_Z = 26;
/** The player never moves along Z — the world comes to them. */
export const PLAYER_Z = 0;

/* --------------------------------------------------------------- player -- */

export const PLAYER_HALF_W = 0.5;
/** Standing collision box (centre / half height). */
export const STAND_CY = 0.95;
export const STAND_HH = 0.72;
/** Sliding collision box. */
export const SLIDE_CY = 0.5;
export const SLIDE_HH = 0.34;

export const GRAVITY = 36;
export const JUMP_V = 12.6;
export const SLIDE_TIME = 0.62;
export const HIT_INVULN = 1.4;
export const MAX_HP = 3;

/* -------------------------------------------------------------- motion --- */

export const BASE_SPEED = 34;
export const MAX_SPEED = 104;
/** Higher = slower ramp-up. Speed is a function of distance travelled. */
export const SPEED_FALLOFF = 6500;
/** Speed multiplier while OVERDRIVE is active. */
export const OD_SPEED_MUL = 1.2;
export const OD_TIME = 6;
export const OD_SCORE_MUL = 2;

/* --------------------------------------------------------------- combat -- */

export const ORB_SCORE = 25;
/** Consecutive orbs needed for one extra multiplier step. */
export const COMBO_STEP = 5;
export const MAX_MULT = 8;
export const SHIELD_HEAL = 1;

/* --------------------------------------------------------------- world --- */

export const FOG_COLOR = 0x05060c;
export const PALETTE = {
  cyan: 0x3ef0ff,
  blue: 0x2a6cff,
  magenta: 0xff2f9d,
  violet: 0x9b4bff,
  amber: 0xffb03a,
  lime: 0xaaff4d,
  red: 0xff3b3b,
  ice: 0xdff3ff,
  void: 0x05060c,
};

/** Event bus payloads shared with the React layer. */
export type GameEventKind = 'orb' | 'shield' | 'boost' | 'hit' | 'death' | 'jump' | 'slide' | 'od-end';

export interface GameStats {
  state: 'menu' | 'playing' | 'paused' | 'dead';
  score: number;
  best: number;
  speed: number;
  distance: number;
  hp: number;
  combo: number;
  mult: number;
  orbs: number;
  /** 0..1 — charge meter while idle, remaining time fraction while active */
  overdrive: number;
  overdriveActive: boolean;
  newRecord: boolean;
  fps: number;
}

export const emptyStats = (best = 0): GameStats => ({
  state: 'menu',
  score: 0,
  best,
  speed: 0,
  distance: 0,
  hp: MAX_HP,
  combo: 0,
  mult: 1,
  orbs: 0,
  overdrive: 0,
  overdriveActive: false,
  newRecord: false,
  fps: 60,
});
