import React, { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  Music,
  Pause,
  Play,
  Repeat,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { MusicState, Role } from '../types/vtt';

interface YTPlayerInstance {
  loadVideoById: (opts: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (opts: { videoId: string; startSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  setVolume: (vol: number) => void;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
}

interface YTGlobal {
  Player: new (
    el: HTMLElement | string,
    opts: {
      height?: string | number;
      width?: string | number;
      videoId?: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: (e: { target: YTPlayerInstance }) => void;
        onStateChange?: (e: { data: number; target: YTPlayerInstance }) => void;
        onError?: () => void;
      };
    }
  ) => YTPlayerInstance;
  PlayerState?: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTGlobal;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTGlobal> | null = null;

function loadYouTubeIframeApi(): Promise<YTGlobal> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('No window'));
  }
  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<YTGlobal>((resolve) => {
    let resolved = false;
    const checkReady = () => {
      if (window.YT && window.YT.Player && !resolved) {
        resolved = true;
        resolve(window.YT);
      }
    };

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      checkReady();
    };

    const interval = setInterval(checkReady, 100);
    setTimeout(() => clearInterval(interval), 10000);

    const existing = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return ytApiPromise;
}

interface YouTubeSyncPlayerProps {
  music: MusicState | null;
  role: Role;
  onControlMusic: (payload: {
    action: 'set_and_play' | 'play' | 'pause' | 'seek' | 'toggle_loop' | 'stop';
    videoId?: string;
    title?: string;
    positionSec?: number;
  }) => void;
  onOpenMusicTab?: () => void;
}

export const YouTubeSyncPlayer: React.FC<YouTubeSyncPlayerProps> = ({
  music,
  role,
  onControlMusic,
  onOpenMusicTab,
}) => {
  const [localVolume, setLocalVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('spiretable_music_vol');
      const n = saved ? Number(saved) : 45;
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 45;
    } catch {
      return 45;
    }
  });
  const [localMuted, setLocalMuted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [playerError, setPlayerError] = useState(false);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const playerReadyRef = useRef(false);
  const loadedVideoIdRef = useRef<string | null>(null);
  const musicRef = useRef<MusicState | null>(music);
  musicRef.current = music;
  const volRef = useRef({ vol: localVolume, muted: localMuted });
  volRef.current = { vol: localVolume, muted: localMuted };

  const computeTargetSec = (m: MusicState): number => {
    if (!m.isPlaying) return Math.max(0, m.positionSec);
    return Math.max(0, m.positionSec + Math.max(0, (Date.now() - m.updatedAt) / 1000));
  };

  const applyVolumeToPlayer = (player: YTPlayerInstance) => {
    const { vol, muted } = volRef.current;
    if (muted || vol <= 0) {
      player.mute();
      player.setVolume(0);
    } else {
      player.unMute();
      player.setVolume(vol);
    }
  };

  const syncPlayerToMusic = (player: YTPlayerInstance, m: MusicState) => {
    setPlayerError(false);
    applyVolumeToPlayer(player);
    const targetSec = computeTargetSec(m);

    if (loadedVideoIdRef.current !== m.videoId) {
      loadedVideoIdRef.current = m.videoId;
      if (m.isPlaying) {
        player.loadVideoById({ videoId: m.videoId, startSeconds: targetSec });
      } else {
        player.cueVideoById({ videoId: m.videoId, startSeconds: targetSec });
      }
    } else {
      const curr = typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : targetSec;
      const drift = Math.abs((curr || 0) - targetSec);
      if (m.isPlaying) {
        if (drift > 2.5) {
          player.seekTo(targetSec, true);
        }
        player.playVideo();
      } else {
        player.pauseVideo();
        if (drift > 1.2) {
          player.seekTo(targetSec, true);
        }
      }
    }

    if (m.isPlaying) {
      window.setTimeout(() => {
        const p = playerRef.current;
        const latest = musicRef.current;
        if (!p || !playerReadyRef.current || !latest?.isPlaying) return;
        const st = typeof p.getPlayerState === 'function' ? p.getPlayerState() : -1;
        // 1 = PLAYING, 3 = BUFFERING
        if (st !== 1 && st !== 3) {
          setNeedsGesture(true);
        } else {
          setNeedsGesture(false);
        }
      }, 1100);
    } else {
      setNeedsGesture(false);
    }
  };

  useEffect(() => {
    if (!music) {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
        playerReadyRef.current = false;
        loadedVideoIdRef.current = null;
      }
      setNeedsGesture(false);
      setPlayerError(false);
      return;
    }

    let cancelled = false;

    if (!playerRef.current && hostRef.current) {
      loadYouTubeIframeApi()
        .then((YT) => {
          if (cancelled || !hostRef.current || playerRef.current) return;
          const m = musicRef.current;
          if (!m) return;

          const mountEl = document.createElement('div');
          hostRef.current.innerHTML = '';
          hostRef.current.appendChild(mountEl);

          loadedVideoIdRef.current = m.videoId;
          playerRef.current = new YT.Player(mountEl, {
            width: '100%',
            height: '100%',
            videoId: m.videoId,
            playerVars: {
              autoplay: m.isPlaying ? 1 : 0,
              controls: 1,
              rel: 0,
              modestbranding: 1,
              playsinline: 1,
              enablejsapi: 1,
              start: Math.floor(computeTargetSec(m)),
              origin: window.location.origin,
            },
            events: {
              onReady: (evt) => {
                if (cancelled) return;
                playerReadyRef.current = true;
                const latest = musicRef.current;
                if (latest) {
                  syncPlayerToMusic(evt.target, latest);
                }
              },
              onStateChange: (evt) => {
                if (cancelled) return;
                const latest = musicRef.current;
                if (!latest) return;
                if (evt.data === 1) {
                  setNeedsGesture(false);
                } else if (evt.data === 0 && latest.loop && latest.isPlaying) {
                  evt.target.seekTo(0, true);
                  evt.target.playVideo();
                }
              },
              onError: () => {
                setPlayerError(true);
              },
            },
          });
        })
        .catch(() => {
          setPlayerError(true);
        });
    } else if (playerRef.current && playerReadyRef.current) {
      syncPlayerToMusic(playerRef.current, music);
    }

    return () => {
      cancelled = true;
    };
  }, [music?.videoId, music?.isPlaying, music?.positionSec, music?.updatedAt, music?.loop]);

  useEffect(() => {
    try {
      localStorage.setItem('spiretable_music_vol', String(localVolume));
    } catch {
      // ignore
    }
    if (playerRef.current && playerReadyRef.current) {
      applyVolumeToPlayer(playerRef.current);
    }
  }, [localVolume, localMuted]);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, []);

  if (!music) {
    if (role !== 'gm') return null;
    return (
      <button
        type="button"
        onClick={onOpenMusicTab}
        title="Abrir player de musica do YouTube para a mesa"
        className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 bg-[#12161e]/95 hover:bg-[#1c2230] border border-stone-700/60 rounded-xl text-xs text-stone-300 hover:text-amber-300 shadow-md transition-colors whitespace-nowrap cursor-pointer"
      >
        <Music className="w-3.5 h-3.5 text-amber-400" />
        <span>Música</span>
      </button>
    );
  }

  return (
    <div className="relative pointer-events-auto flex items-center">
      {/* Hidden / minimal YouTube IFrame container (always mounted so playback is continuous) */}
      <div
        ref={hostRef}
        className={
          expanded
            ? 'fixed top-14 left-1/2 -translate-x-1/2 z-50 w-72 h-44 rounded-xl overflow-hidden border border-amber-500/70 shadow-2xl bg-black'
            : 'absolute w-1 h-1 opacity-0 pointer-events-none -z-10 overflow-hidden'
        }
      />

      {/* Sleek Compact Music Capsule */}
      <div className="flex items-center gap-1.5 px-2 py-1 bg-[#12161e]/95 hover:bg-[#161c28] border border-stone-700/70 rounded-xl shadow-md text-xs text-stone-200 transition-all max-w-[210px] sm:max-w-[250px]">
        {/* Disc / Music Note Icon */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? 'Recolher mini vídeo' : 'Expandir vídeo do YouTube'}
          className="text-amber-400 hover:text-amber-300 shrink-0 cursor-pointer"
        >
          <Music
            className={`w-3.5 h-3.5 ${
              music.isPlaying ? 'animate-spin [animation-duration:5s]' : ''
            }`}
          />
        </button>

        {/* Song Title (Truncated) */}
        <span
          className="truncate font-medium text-[11px] text-stone-200 cursor-pointer select-none"
          title={`${music.title} (${music.isPlaying ? 'Tocando' : 'Pausado'})`}
          onClick={() => role === 'gm' && onOpenMusicTab?.()}
        >
          {music.title || 'Música da Mesa'}
        </span>

        {/* GM Play/Pause Button */}
        {role === 'gm' && (
          <button
            type="button"
            onClick={() => onControlMusic({ action: music.isPlaying ? 'pause' : 'play' })}
            title={music.isPlaying ? 'Pausar para todos' : 'Tocar para todos'}
            className="p-1 text-amber-400 hover:text-amber-300 hover:bg-[#1f2737] rounded transition-colors cursor-pointer shrink-0"
          >
            {music.isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </button>
        )}

        {/* Local Volume Button with Popover on Hover */}
        <div className="relative group shrink-0">
          <button
            type="button"
            onClick={() => setLocalMuted(!localMuted)}
            className="p-1 text-stone-400 hover:text-stone-200 transition-colors cursor-pointer"
            title={`Volume: ${localMuted ? 'Mudo' : `${localVolume}%`}`}
          >
            {localMuted || localVolume === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-stone-300" />
            )}
          </button>

          {/* Floating Volume Flyout */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover:flex items-center gap-2 p-2 bg-[#0c1017] border border-stone-700/90 rounded-xl shadow-2xl z-50 w-36">
            <input
              type="range"
              min="0"
              max="100"
              value={localMuted ? 0 : localVolume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setLocalVolume(v);
                if (v > 0 && localMuted) setLocalMuted(false);
              }}
              className="w-full h-1 accent-amber-500 cursor-pointer"
            />
            <span className="text-[10px] font-mono text-stone-400 w-6 text-right">
              {localMuted ? '0%' : `${localVolume}%`}
            </span>
          </div>
        </div>

        {/* Gesture unlock prompt if autoplay was blocked */}
        {needsGesture && music.isPlaying && (
          <button
            type="button"
            onClick={() => {
              const p = playerRef.current;
              if (!p || !playerReadyRef.current) return;
              applyVolumeToPlayer(p);
              p.seekTo(computeTargetSec(music), true);
              p.playVideo();
              setNeedsGesture(false);
            }}
            className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-500 text-stone-950 rounded animate-pulse cursor-pointer shrink-0"
          >
            Ouvir
          </button>
        )}
      </div>
    </div>
  );
};
