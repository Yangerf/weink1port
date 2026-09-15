import { memo } from 'react';
import { MAX_HP, MAX_SPEED, OD_TIME, type GameStats } from '@/game/config';
import type { Command } from '@/game/game';

interface Props {
  stats: GameStats;
  muted: boolean;
  paused: boolean;
  onCommand: (c: Command) => void;
  onToggleMute: () => void;
}

const pad = (n: number, len: number) => n.toString().padStart(len, '0');

function Chevon({ on }: { on: boolean }) {
  return <i className={on ? 'hp-cell on' : 'hp-cell'} />;
}

export const Hud = memo(function Hud({ stats, muted, paused, onCommand, onToggleMute }: Props) {
  const kmh = Math.round(stats.speed * 3.6);
  const speedPct = Math.min(100, (stats.speed / (MAX_SPEED * 1.2)) * 100);
  const odActive = stats.overdriveActive;
  const odPct = Math.max(0, Math.min(100, stats.overdrive * 100));
  const odSeconds = (stats.overdrive * OD_TIME).toFixed(1);

  return (
    <div className="hud">
      {/* ------------------------------------------------------- score ----- */}
      <div className="hud-block hud-tl">
        <span className="label">score</span>
        <span className="value big">{pad(stats.score, 6)}</span>
        <span className="label dim">
          best <b>{pad(stats.best, 6)}</b>
        </span>
      </div>

      {/* ----------------------------------------------------- telemetry --- */}
      <div className="hud-block hud-tc">
        <div className="telemetry">
          <span className="label">velocity</span>
          <span className="value">
            {kmh}
            <em>km/h</em>
          </span>
        </div>
        <div className="speedbar">
          <i style={{ width: `${speedPct}%` }} />
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} style={{ left: `${(i + 1) * 9.09}%` }} />
          ))}
        </div>
        <div className="telemetry small">
          <span className="label">distance</span>
          <span className="value">
            {(stats.distance / 1000).toFixed(2)}
            <em>km</em>
          </span>
          <span className="label">orbs</span>
          <span className="value">{pad(stats.orbs, 3)}</span>
        </div>
      </div>

      {/* ---------------------------------------------------------- hull --- */}
      <div className="hud-block hud-tr">
        <div className="row">
          <span className="label">hull</span>
          <span className="hp">
            {Array.from({ length: MAX_HP }).map((_, i) => (
              <Chevon key={i} on={i < stats.hp} />
            ))}
          </span>
        </div>
        <div className="row">
          <button className="icon-btn" onClick={onToggleMute} title="sound">
            {muted ? 'SND OFF' : 'SND ON'}
          </button>
          <button className="icon-btn" onClick={() => onCommand('pause')} title="pause">
            {paused ? 'RESUME' : 'PAUSE'}
          </button>
        </div>
        <span className="label dim tiny">{stats.fps.toFixed(0)} fps · esc to pause</span>
      </div>

      {/* -------------------------------------------------------- combo ---- */}
      <div className="hud-block hud-bl">
        <div className="mult">
          <span className="label">multiplier</span>
          <span className={stats.mult > 1 ? 'value mult-x hot' : 'value mult-x'}>x{stats.mult.toFixed(0)}</span>
        </div>
        <div className="chain">
          {Array.from({ length: 5 }).map((_, i) => (
            <i key={i} className={stats.combo % 5 > i || (stats.combo > 0 && stats.combo % 5 === 0) ? 'on' : ''} />
          ))}
          <span className="label dim tiny">chain {stats.combo}</span>
        </div>
      </div>

      {/* --------------------------------------------------- overdrive ----- */}
      <div className="hud-block hud-br">
        <span className={odActive ? 'label od-label hot' : 'label od-label'}>
          {odActive ? `overdrive ${odSeconds}s` : 'overdrive charge'}
        </span>
        <div className={odActive ? 'odbar active' : 'odbar'}>
          <i style={{ width: `${odPct}%` }} />
        </div>
      </div>

      {/* ------------------------------------------------- touch controls -- */}
      <div className="touch">
        <button className="tbtn" onPointerDown={() => onCommand('left')}>
          ◀
        </button>
        <button className="tbtn wide" onPointerDown={() => onCommand('jump')}>
          JUMP
        </button>
        <button className="tbtn wide" onPointerDown={() => onCommand('slide')}>
          SLIDE
        </button>
        <button className="tbtn" onPointerDown={() => onCommand('right')}>
          ▶
        </button>
      </div>
    </div>
  );
});
