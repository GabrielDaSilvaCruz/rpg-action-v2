export interface RpgMusicTrack {
  videoId: string;
  title: string;
  mood: string;
  color: string;
}

export const RPG_MUSIC_PRESETS: RpgMusicTrack[] = [
  {
    videoId: 'GIKyhCVJbWA',
    title: 'Taverna de Whiterun (Bannered Mare)',
    mood: 'Taverna',
    color: '#d97706',
  },
  {
    videoId: 'xWtfo9kuRTU',
    title: 'Exploracao Nordica (Skyrim Suite)',
    mood: 'Exploracao',
    color: '#0ea5e9',
  },
  {
    videoId: 'fv_7EurNAss',
    title: 'Caminho Sombrio & Masmorra',
    mood: 'Masmorra',
    color: '#a855f7',
  },
  {
    videoId: 't3B802PIuB0',
    title: 'Combate Tatico D&D',
    mood: 'Combate',
    color: '#f97316',
  },
  {
    videoId: 'tBI63CPbW9c',
    title: 'Chefe de Masmorra / Boss',
    mood: 'Chefe',
    color: '#ef4444',
  },
  {
    videoId: '4mvgI4ZC5qM',
    title: 'Dragonborn & Inverno Epico',
    mood: 'Epico',
    color: '#10b981',
  },
];

const YT_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (YT_ID_REGEX.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();

    if (host === 'youtu.be') {
      const seg = url.pathname.split('/').filter(Boolean)[0];
      return seg && YT_ID_REGEX.test(seg) ? seg : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = url.searchParams.get('v');
      if (v && YT_ID_REGEX.test(v)) return v;

      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
        return YT_ID_REGEX.test(parts[1]) ? parts[1] : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}
