import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';
import { cn } from '../lib/utils';

export function AudioPlayer({
  blob,
  duration,
  className,
}: {
  blob: Blob;
  duration?: number;
  className?: string;
}) {
  const [url, setUrl] = useState('');
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(duration ?? 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5',
        className,
      )}
    >
      <button
        type="button"
        onClick={toggle}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white "
        aria-label={playing ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
      >
        {playing ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <Volume2 size={13} />
          Nota de voz
          <span className="font-normal normal-case text-slate-400">
            {Math.round(total)} s
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-slate-900 transition-[width]"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value) && value > 0) setTotal(value);
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          if (audio.duration && Number.isFinite(audio.duration)) {
            setProgress(audio.currentTime / audio.duration);
          }
        }}
        className="hidden"
      />
    </div>
  );
}
