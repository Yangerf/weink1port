import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from '@/game/audio';
import { emptyStats, type GameEventKind, type GameStats } from '@/game/config';
import { Game, loadBest, type Command } from '@/game/game';
import { Hud } from '@/ui/Hud';
import { GameOverOverlay, MenuOverlay, PauseOverlay } from '@/ui/Overlays';

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const flashId = useRef(0);

  const [stats, setStats] = useState<GameStats>(() => emptyStats(loadBest()));
  const [finalStats, setFinalStats] = useState<GameStats | null>(null);
  const [muted, setMuted] = useState(false);
  const [flash, setFlash] = useState<{ kind: GameEventKind; id: number } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const audio = new AudioEngine();
    audioRef.current = audio;

    const game = new Game(host, audio, {
      onStats: (s) => {
        setStats(s);
        if (s.state === 'playing') setFinalStats(null);
      },
      onEvent: (kind) => {
        flashId.current += 1;
        setFlash({ kind, id: flashId.current });
      },
      onDeath: (s) => setFinalStats(s),
    });
    gameRef.current = game;

    return () => {
      game.dispose();
      gameRef.current = null;
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  const command = useCallback((c: Command) => {
    const g = gameRef.current;
    if (!g) return;
    if (c === 'start' || c === 'restart') {
      audioRef.current?.init();
      audioRef.current?.resume();
    }
    g.command(c);
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.init();
    const next = !muted;
    audio.setMuted(next);
    setMuted(next);
  }, [muted]);

  const inMenu = stats.state === 'menu';

  return (
    <div className="app">
      <div className="stage" ref={hostRef} />

      <div className="vignette" />
      <div className="scanlines" />

      {flash && <div key={flash.id} className={`event-flash ${flash.kind}`} />}

      {!inMenu && (
        <Hud
          stats={stats}
          muted={muted}
          paused={stats.state === 'paused'}
          onCommand={command}
          onToggleMute={toggleMute}
        />
      )}

      {inMenu && <MenuOverlay best={stats.best} onCommand={command} />}
      {stats.state === 'paused' && <PauseOverlay stats={stats} onCommand={command} />}
      {stats.state === 'dead' && <GameOverOverlay stats={stats} final={finalStats} onCommand={command} />}
    </div>
  );
}
