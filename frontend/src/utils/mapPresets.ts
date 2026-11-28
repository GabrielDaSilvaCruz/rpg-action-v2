import {
  MapAnnotation,
  MapPresetId,
  MiniatureData,
  TerrainKind,
  TileCell,
  tileKey,
} from '../types/vtt';
import { CATALOG_BY_ID } from './assetCatalog';
import { createDefaultSheet } from './sheetTemplates';

export const BOARD_COLS = 16;
export const BOARD_ROWS = 16;

function makeTile(
  x: number,
  z: number,
  terrain: TerrainKind = 'stone',
  elevation = 0
): TileCell {
  return { x, z, terrain, elevation, prop: 'none', propRotation: 0 };
}

function fromCatalog(
  id: string,
  catalogId: string,
  x: number,
  z: number,
  rotationY = 0,
  overrides: Partial<MiniatureData> = {}
): MiniatureData {
  const item = CATALOG_BY_ID[catalogId];
  const isPropOnly = overrides.isPropOnly ?? item.isPropOnly;
  const ownerName =
    overrides.ownerName !== undefined
      ? overrides.ownerName
      : isPropOnly || item.category === 'monster'
      ? '__GM__'
      : '';
  const isMonster = !isPropOnly && (ownerName === '__GM__' || item.category === 'monster');

  return {
    id,
    name: overrides.name || item.name,
    format: item.format,
    assetId: `cat:${item.id}`,
    assetName: item.name,
    remoteUrl: item.url,
    x,
    z,
    rotationY,
    footprint: overrides.footprint ?? item.footprint,
    scaleMultiplier: overrides.scaleMultiplier ?? item.scaleMultiplier,
    fixZUp: overrides.fixZUp ?? item.fixZUp,
    showBase: isPropOnly ? false : overrides.showBase ?? item.showBase,
    baseStyle: overrides.baseStyle ?? item.baseStyle,
    color: overrides.color ?? item.color,
    finish: overrides.finish ?? item.finish,
    hp: overrides.hp ?? 35,
    maxHp: overrides.maxHp ?? 35,
    ownerName,
    isPropOnly,
    sheet: isPropOnly
      ? undefined
      : overrides.sheet ?? createDefaultSheet(isMonster, `${catalogId} ${overrides.name || item.name}`),
  };
}

export function buildMapPreset(preset: MapPresetId): {
  tiles: Record<string, TileCell>;
  miniatures: Record<string, MiniatureData>;
  annotations: Record<string, MapAnnotation>;
} {
  const tiles: Record<string, TileCell> = {};
  const miniatures: Record<string, MiniatureData> = {};
  const annotations: Record<string, MapAnnotation> = {};

  const set = (x: number, z: number, terrain: TerrainKind, elevation = 0) => {
    if (x < 0 || x >= BOARD_COLS || z < 0 || z >= BOARD_ROWS) return;
    tiles[tileKey(x, z)] = makeTile(x, z, terrain, elevation);
  };

  const place = (m: MiniatureData) => {
    miniatures[m.id] = m;
  };

  if (preset === 'blank') {
    for (let x = 0; x < BOARD_COLS; x++) {
      for (let z = 0; z < BOARD_ROWS; z++) {
        set(x, z, 'stone', 0);
      }
    }
    return { tiles, miniatures, annotations };
  }

  if (preset === 'crypt') {
    // Skyrim Bleak Falls Barrow / TaleSpire Dungeon Courtyard
    for (let x = 0; x < BOARD_COLS; x++) {
      for (let z = 0; z < BOARD_ROWS; z++) {
        let terrain: TerrainKind = 'stone';
        let elevation = 0;

        if (z === 11 && x >= 1 && x <= 14) {
          terrain = x === 7 || x === 8 ? 'cobble' : 'water';
          elevation = 0;
        } else if (z >= 12 && (x === 7 || x === 8)) {
          terrain = 'cobble';
          elevation = 0;
        } else if (x === 0 || x === 15 || z === 15) {
          terrain = 'grass';
          elevation = 0;
        }

        // Elevated Nordic sanctuary (z: 1..5, x: 4..11)
        if (x >= 4 && x <= 11 && z >= 1 && z <= 5) {
          terrain = 'cobble';
          elevation = 1;
        }
        // High Dragon Shrine dais (z: 1..3, x: 6..9)
        if (x >= 6 && x <= 9 && z >= 1 && z <= 3) {
          terrain = 'stone';
          elevation = 2;
        }
        // North wall ridge
        if (z === 0 && x >= 2 && x <= 13) {
          terrain = 'stone';
          elevation = 1;
        }

        set(x, z, terrain, elevation);
      }
    }

    // Real Textured .GLB TaleSpire / Skyrim Architecture & Nature
    place(fromCatalog('prop-gate', 'kk-wall-doorway', 7.5, 0.2, 0));
    place(fromCatalog('prop-wall-l1', 'kk-wall-cracked', 4.5, 0.2, 0));
    place(fromCatalog('prop-wall-r1', 'kk-wall-cracked', 10.5, 0.2, 0));
    place(fromCatalog('prop-stairs-1', 'kk-stairs', 7.5, 6, Math.PI));

    place(fromCatalog('prop-pillar-1', 'kk-pillar-decorated', 4, 5, 0));
    place(fromCatalog('prop-pillar-2', 'kk-pillar-decorated', 11, 5, 0));
    place(fromCatalog('prop-pillar-3', 'kk-pillar-decorated', 5, 9, 0));
    place(fromCatalog('prop-pillar-4', 'kk-pillar-decorated', 10, 9, 0));

    place(fromCatalog('prop-torch-1', 'kk-torch-lit', 6, 6, 0));
    place(fromCatalog('prop-torch-2', 'kk-torch-lit', 9, 6, 0));
    place(fromCatalog('prop-torch-3', 'kk-torch-lit', 6, 10, 0));
    place(fromCatalog('prop-torch-4', 'kk-torch-lit', 9, 10, 0));

    place(fromCatalog('prop-chest-gold', 'kk-chest-gold', 10, 2, -Math.PI / 4));
    place(fromCatalog('prop-statue', 'pm-statue', 5, 2, Math.PI / 6));
    place(fromCatalog('prop-ruins-1', 'pm-ruins', 2, 8, Math.PI / 2));

    place(fromCatalog('prop-pine-1', 'pm-big-pine', 1.2, 13.5, 0));
    place(fromCatalog('prop-pine-2', 'pm-big-pine', 13.8, 13.5, 1.1));
    place(fromCatalog('prop-pine-3', 'pm-big-pine', 1.2, 3.5, 2.2));
    place(fromCatalog('prop-pine-4', 'pm-big-pine', 13.8, 4.5, 0.7));

    // Cenário limpo: apenas relevo, arquitetura e props 3D (sem personagens pré-definidos)
    annotations['ann-treasure'] = {
      id: 'ann-treasure',
      kind: 'marker',
      x: 10,
      z: 2,
      radius: 1,
      rotationY: 0,
      color: '#f59e0b',
      label: 'Tesouro Oculto',
      gmOnly: true,
      createdBy: 'Mestre',
    };

    return { tiles, miniatures, annotations };
  }

  if (preset === 'tavern') {
    // Bannered Mare / Skyrim Whiterun Tavern
    for (let x = 0; x < BOARD_COLS; x++) {
      for (let z = 0; z < BOARD_ROWS; z++) {
        const inside = x >= 2 && x <= 13 && z >= 2 && z <= 12;
        if (inside) {
          set(x, z, x >= 3 && x <= 6 && z >= 3 && z <= 4 ? 'wood' : 'wood', x >= 3 && x <= 6 && z >= 3 && z <= 4 ? 1 : 0);
        } else {
          set(x, z, x >= 6 && x <= 9 && z > 12 ? 'cobble' : 'grass', 0);
        }
      }
    }

    place(fromCatalog('tav-door', 'kk-wall-doorway', 7.5, 12.2, Math.PI));
    place(fromCatalog('tav-wall-1', 'kk-wall-window-gated', 4.5, 2.0, 0));
    place(fromCatalog('tav-wall-2', 'kk-wall-window-gated', 10.5, 2.0, 0));
    place(fromCatalog('tav-banner', 'kk-banner-shield', 7.5, 2.2, 0));

    place(fromCatalog('tav-table-1', 'kk-table-banquet', 5.5, 7.5, 0));
    place(fromCatalog('tav-table-2', 'kk-table-banquet', 10.5, 7.5, Math.PI / 2));
    place(fromCatalog('tav-keg-1', 'kk-keg', 3.2, 11, Math.PI / 4));
    place(fromCatalog('tav-barrel-1', 'kk-barrel', 4.2, 11, 0));
    place(fromCatalog('tav-bed-1', 'kk-bed', 12, 4, -Math.PI / 2));
    place(fromCatalog('tav-shelf-1', 'kk-shelves-candles', 10, 2.8, 0));
    place(fromCatalog('tav-torch-1', 'kk-torch-lit', 3, 5, 0));
    place(fromCatalog('tav-torch-2', 'kk-torch-lit', 12, 11, 0));
    place(fromCatalog('tav-cart', 'pm-cart', 12.5, 14.2, -Math.PI / 3));
    place(fromCatalog('tav-pine-1', 'pm-big-pine', 1.2, 14, 0));

    // Cenário limpo: apenas arquitetura da taverna e props 3D (sem personagens pré-definidos)
    return { tiles, miniatures, annotations };
  }

  // 'arena' — Dragon Peak / Volcanic Ruins
  for (let x = 0; x < BOARD_COLS; x++) {
    for (let z = 0; z < BOARD_ROWS; z++) {
      const dx = x - 7.5;
      const dz = z - 7.5;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 7.4) {
        set(x, z, 'lava', 0);
      } else if (dist > 5.8) {
        set(x, z, 'stone', 1);
      } else if (dist < 2.1) {
        set(x, z, 'cobble', 1);
      } else {
        set(x, z, 'stone', 0);
      }
    }
  }

  place(fromCatalog('ar-pillar-1', 'kk-pillar-decorated', 4, 4, 0));
  place(fromCatalog('ar-pillar-2', 'kk-pillar-decorated', 11, 4, 0));
  place(fromCatalog('ar-pillar-3', 'kk-pillar-decorated', 4, 11, 0));
  place(fromCatalog('ar-pillar-4', 'kk-pillar-decorated', 11, 11, 0));
  place(fromCatalog('ar-arc-1', 'pm-ruin-arc', 7.5, 1.5, 0));
  place(fromCatalog('ar-fountain', 'pm-fountain', 7.5, 7.5, 0));
  place(fromCatalog('ar-spikes-1', 'kk-spikes-trap', 5.5, 7.5, 0));
  place(fromCatalog('ar-spikes-2', 'kk-spikes-trap', 9.5, 7.5, 0));
  place(fromCatalog('ar-crystals-1', 'pm-crystals', 2, 7.5, 0));
  place(fromCatalog('ar-crystals-2', 'pm-crystals', 13, 7.5, Math.PI));

  // Cenário limpo: apenas ruínas vulcânicas e props 3D (sem personagens pré-definidos)
  return { tiles, miniatures, annotations };
}
