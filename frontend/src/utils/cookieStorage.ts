import { Role } from '../types/vtt';

export function setCookie(name: string, value: string, days = 365): void {
  if (typeof document === 'undefined') return;
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
    localStorage.setItem(name, value);
  } catch {
    // ignore in restricted envs
  }
}

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const cookieMatches = document.cookie.match(
      new RegExp(`(?:^|; )${encodeURIComponent(name).replace(/[-.$*]/g, '\\$&')}=([^;]*)`)
    );
    if (cookieMatches && cookieMatches[1]) {
      return decodeURIComponent(cookieMatches[1]);
    }
    const local = localStorage.getItem(name);
    return local || null;
  } catch {
    return null;
  }
}

export function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
    localStorage.removeItem(name);
  } catch {
    // ignore
  }
}

export interface SavedPlayerProfile {
  name: string;
  role: Role;
  color: string;
  roomId: string;
}

const COOKIE_NAME_PLAYER = 'rpg_player_name';
const COOKIE_ROLE_PLAYER = 'rpg_player_role';
const COOKIE_COLOR_PLAYER = 'rpg_player_color';
const COOKIE_ROOM_PLAYER = 'rpg_player_room';

export function savePlayerProfile(profile: {
  name: string;
  role: Role;
  color: string;
  roomId?: string;
}): void {
  if (profile.name) setCookie(COOKIE_NAME_PLAYER, profile.name.trim());
  if (profile.role) setCookie(COOKIE_ROLE_PLAYER, profile.role);
  if (profile.color) setCookie(COOKIE_COLOR_PLAYER, profile.color);
  if (profile.roomId) setCookie(COOKIE_ROOM_PLAYER, profile.roomId.trim().toUpperCase());
}

export function getSavedPlayerProfile(): SavedPlayerProfile | null {
  const name = getCookie(COOKIE_NAME_PLAYER);
  const role = getCookie(COOKIE_ROLE_PLAYER) as Role | null;
  const color = getCookie(COOKIE_COLOR_PLAYER);
  const roomId = getCookie(COOKIE_ROOM_PLAYER);

  if (!name && !role && !color && !roomId) {
    return null;
  }

  return {
    name: name || 'Aventureiro',
    role: role === 'gm' ? 'gm' : 'player',
    color: color || '#0ea5e9',
    roomId: roomId || 'MESA-01',
  };
}
