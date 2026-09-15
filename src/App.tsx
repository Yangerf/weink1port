import { useCallback, useEffect, useRef, useState } from 'react';
import { Installation, SECTIONS, type SectionId, type Telemetry } from './lib/installation';
import { Ambience } from './lib/audio';
import { Cursor, type CursorMode } from './ui/Cursor';
import { Loader } from './ui/Loader';
import { Hud } from './ui/Hud';
import { Panel, WorkDetail } from './ui/Panels';

export default function App() {
  const stage = useRef<HTMLDivElement>(null);
  const engine = useRef<Installation | null>(null);
  const audio = useRef<Ambience | null>(null);
  const telemetry = useRef<Telemetry>({ cam: '0.00 / 0.00 / 0.00', cursor: '0.000 0.000', fps: 60, drops: 0 });

  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState('BOOT');
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [opened, setOpened] = useState(false);
  const [section, setSection] = useState<SectionId>('HOME');
  const [detail, setDetail] = useState<number | null>(null);
  const [cursor, setCursor] = useState<CursorMode>('idle');
  const [audioOn, setAudioOn] = useState(false);

  const openedRef = useRef(false);
  const sectionRef = useRef<SectionId>('HOME');

  const goSection = useCallback((s: SectionId) => {
    if (!engine.current) return;
    engine.current.setSection(s);
    sectionRef.current = s;
    openedRef.current = true;
    setOpened(true);
    setSection(s);
    setDetail(null);
  }, []);

  useEffect(() => {
    if (!stage.current) return;
    let mounted = true;

    const inst = new Installation({
      container: stage.current,
      onProgress: (p, l) => {
        if (!mounted) return;
        setProgress(p);
        setLabel(l);
      },
      onReady: () => {
        if (!mounted) return;
        setReady(true);
        window.setTimeout(() => mounted && setHidden(true), 1100);
      },
      onHover: (target) => {
        if (!mounted) return;
        setCursor(target === 'text' ? 'hot' : typeof target === 'number' ? 'link' : 'idle');
      },
      onTextClick: () => {
        if (!mounted) return;
        if (!openedRef.current) {
          engine.current?.open();
          openedRef.current = true;
          setOpened(true);
          setSection('HOME');
        } else if (sectionRef.current !== 'HOME') {
          goSection('HOME');
        } else {
          engine.current?.pulse(0.9);
        }
      },
      onWorkClick: (i) => mounted && setDetail(i),
      onTelemetry: (t) => {
        telemetry.current = t;
      },
    });
    engine.current = inst;
    inst.init().catch((err) => {
      console.error('[WEINK1] init failed', err);
      setLabel('WEBGL UNAVAILABLE');
    });

    return () => {
      mounted = false;
      inst.dispose();
      engine.current = null;
    };
  }, [goSection]);

  // keyboard + wheel navigation
  useEffect(() => {
    const idx = () => SECTIONS.indexOf(sectionRef.current);

    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDetail(null);
        return;
      }
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= SECTIONS.length) {
        goSection(SECTIONS[num - 1]);
        return;
      }
      if (!openedRef.current) {
        if (e.key === 'Enter' || e.key === ' ') {
          engine.current?.open();
          openedRef.current = true;
          setOpened(true);
        }
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') goSection(SECTIONS[Math.min(SECTIONS.length - 1, idx() + 1)]);
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') goSection(SECTIONS[Math.max(0, idx() - 1)]);
    };

    let lock = 0;
    const wheel = (e: WheelEvent) => {
      const now = performance.now();
      if (now < lock || Math.abs(e.deltaY) < 8) return;
      lock = now + 900;
      if (!openedRef.current) {
        engine.current?.open();
        openedRef.current = true;
        setOpened(true);
        return;
      }
      const dir = e.deltaY > 0 ? 1 : -1;
      const n = Math.max(0, Math.min(SECTIONS.length - 1, idx() + dir));
      goSection(SECTIONS[n]);
    };

    let sy = 0;
    const tStart = (e: TouchEvent) => {
      sy = e.touches[0].clientY;
    };
    const tEnd = (e: TouchEvent) => {
      const dy = sy - (e.changedTouches[0]?.clientY ?? sy);
      if (Math.abs(dy) < 60) return;
      if (!openedRef.current) {
        engine.current?.open();
        openedRef.current = true;
        setOpened(true);
        return;
      }
      const n = Math.max(0, Math.min(SECTIONS.length - 1, idx() + (dy > 0 ? 1 : -1)));
      goSection(SECTIONS[n]);
    };

    window.addEventListener('keydown', key);
    window.addEventListener('wheel', wheel, { passive: true });
    window.addEventListener('touchstart', tStart, { passive: true });
    window.addEventListener('touchend', tEnd, { passive: true });
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('touchstart', tStart);
      window.removeEventListener('touchend', tEnd);
    };
  }, [goSection]);

  const toggleAudio = useCallback(() => {
    audio.current ??= new Ambience();
    setAudioOn(audio.current.toggle());
    engine.current?.pulse(0.3);
  }, []);

  useEffect(() => () => audio.current?.dispose(), []);

  const hoverOn = useCallback(() => setCursor('link'), []);
  const hoverOff = useCallback(() => setCursor('idle'), []);

  return (
    <div className="no-cursor">
      <div className="stage" ref={stage} />

      {!hidden && <Loader progress={progress} label={label} done={ready} />}

      {ready && (
        <>
          <Hud
            section={section}
            opened={opened}
            telemetry={telemetry}
            onSection={goSection}
            audioOn={audioOn}
            onAudio={toggleAudio}
            hoverOn={hoverOn}
            hoverOff={hoverOff}
          />

          <div className={`hint ${opened ? 'hide' : ''}`}>
            <span className="brk">[</span>
            CLICK THE MONOLITH TO OPEN
            <span className="brk r">]</span>
          </div>

          {opened && (
            <div className="hud" style={{ pointerEvents: 'none' }}>
              <Panel section={section} hoverOn={hoverOn} hoverOff={hoverOff} />
              {detail !== null && section === 'WORK' && (
                <WorkDetail
                  index={detail}
                  onClose={() => setDetail(null)}
                  hoverOn={hoverOn}
                  hoverOff={hoverOff}
                />
              )}
            </div>
          )}
        </>
      )}

      <Cursor mode={cursor} />
    </div>
  );
}
