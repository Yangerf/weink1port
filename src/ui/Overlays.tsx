import { memo } from 'react';
import type { GameStats } from '@/game/config';
import type { Command } from '@/game/game';

const KEYS: [string, string][] = [
  ['← →  /  A D', 'change lane'],
  ['SPACE  /  ↑  /  W', 'jump'],
  ['↓  /  S', 'slide / dive'],
  ['ESC  /  P', 'pause'],
  ['R', 'restart run'],
  ['swipe / tap', 'touch controls'],
];

interface MenuProps {
  best: number;
  onCommand: (c: Command) => void;
}

export const MenuOverlay = memo(function MenuOverlay({ best, onCommand }: MenuProps) {
  return (
    <div className="screen">
      <div className="screen-inner">
        <span className="kicker">procedural neon runner</span>
        <h1 className="title">
          HYPER<span>TUNNEL</span>
        </h1>
        <p className="lede">
          Endless corridor, three lanes, no brakes. Jump the barriers, slide under the walls, dodge the
          drones and chain orbs to stack your multiplier.
        </p>

        <div className="keys">
          {KEYS.map(([k, v]) => (
            <div className="key-row" key={k}>
              <kbd>{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>

        <button className="cta" onClick={() => onCommand('start')}>
          <span className="cta-fill">START RUN</span>
          <span className="cta-label">PRESS ENTER</span>
        </button>

        <div className="menu-foot">
          <span>
            best <b>{best.toString().padStart(6, '0')}</b>
          </span>
          <span className="sep">/</span>
          <span>everything generated in your browser — no downloads</span>
        </div>
      </div>
    </div>
  );
});

interface OverProps {
  stats: GameStats;
  final: GameStats | null;
  onCommand: (c: Command) => void;
}

export const GameOverOverlay = memo(function GameOverOverlay({ stats, final, onCommand }: OverProps) {
  const s = final ?? stats;
  const mult = Math.max(1, Math.round(s.mult));
  return (
    <div className="screen screen-dark">
      <div className="screen-inner">
        <span className="kicker danger">run terminated</span>
        <h1 className="title small">
          {s.newRecord ? 'NEW RECORD' : 'GAME OVER'}
        </h1>

        <div className="score-grid">
          <div>
            <span>score</span>
            <b>{s.score.toString().padStart(6, '0')}</b>
          </div>
          <div>
            <span>best</span>
            <b>{s.best.toString().padStart(6, '0')}</b>
          </div>
          <div>
            <span>distance</span>
            <b>{s.distance.toFixed(0)}m</b>
          </div>
          <div>
            <span>orbs</span>
            <b>{s.orbs}</b>
          </div>
          <div>
            <span>top mult</span>
            <b>x{mult}</b>
          </div>
          <div>
            <span>hull</span>
            <b>{s.hp} / 3</b>
          </div>
        </div>

        <div className="cta-row">
          <button className="cta" onClick={() => onCommand('restart')}>
            <span className="cta-fill">RETRY</span>
            <span className="cta-label">PRESS ENTER</span>
          </button>
          <button className="ghost" onClick={() => onCommand('menu')}>
            main menu
          </button>
        </div>
      </div>
    </div>
  );
});

interface PauseProps {
  stats: GameStats;
  onCommand: (c: Command) => void;
}

export const PauseOverlay = memo(function PauseOverlay({ stats, onCommand }: PauseProps) {
  return (
    <div className="screen screen-soft">
      <div className="screen-inner">
        <span className="kicker">paused</span>
        <h1 className="title small">TAKE A BREATH</h1>
        <div className="score-grid">
          <div>
            <span>score</span>
            <b>{stats.score.toString().padStart(6, '0')}</b>
          </div>
          <div>
            <span>distance</span>
            <b>{stats.distance.toFixed(0)}m</b>
          </div>
        </div>
        <div className="cta-row">
          <button className="cta" onClick={() => onCommand('pause')}>
            <span className="cta-fill">RESUME</span>
            <span className="cta-label">ESC</span>
          </button>
          <button className="ghost" onClick={() => onCommand('restart')}>
            restart run
          </button>
        </div>
      </div>
    </div>
  );
});
