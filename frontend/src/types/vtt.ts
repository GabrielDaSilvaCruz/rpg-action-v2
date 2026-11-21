export type Role = 'gm' | 'player';

export type TerrainKind =
  | 'void'
  | 'stone'
  | 'grass'
  | 'wood'
  | 'cobble'
  | 'water'
  | 'lava';

export type PropKind =
  | 'none'
  | 'wall'
  | 'wall_torch'
  | 'pillar'
  | 'brazier'
  | 'chest'
  | 'tree'
  | 'stairs'
  | 'arch'
  | 'table'
  | 'bookshelf'
  | 'barrel'
  | 'altar'
  | 'throne'
  | 'bed'
  | 'fireplace'
  | 'crystal'
  | 'grave'
  | 'bridge'
  | 'fountain';

export interface TileCell {
  x: number;
  z: number;
  terrain: TerrainKind;
  elevation: number; // 0 to 4
  prop: PropKind;
  propRotation: number; // 0, 1, 2, 3 (90 deg steps)
}

export type FootprintSize = 0.5 | 1 | 2 | 3 | 4;

export type BaseStyle = 'rune' | 'cobble' | 'moss' | 'magma' | 'royal';

export type BuiltinMiniKind =
  | 'paladin'
  | 'mage'
  | 'rogue'
  | 'barbarian'
  | 'cleric'
  | 'bard'
  | 'ranger'
  | 'goblin'
  | 'skeleton'
  | 'orc'
  | 'beholder'
  | 'mimic'
  | 'dragon'
  | 'golem';

export type ModelFormat = 'builtin' | 'stl' | 'obj' | 'glb' | 'gltf' | 'image';

export type MiniFinish =
  | 'resin'
  | 'bronze'
  | 'stone'
  | 'gold'
  | 'arcane'
  | 'original';

export interface SheetAttack {
  name: string;
  bonus: string;
  damage: string;
}

export interface CharacterSheet {
  isMonster: boolean;
  hiddenFromPlayers: boolean;
  raceOrType: string;
  classOrRole: string;
  levelOrCr: string;
  ac: number;
  speed: string;
  initiativeBonus: number;
  stats: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  attacks: SheetAttack[];
  abilities: string;
  equipment: string;
  notes: string;
}

export interface MiniatureData {
  id: string;
  name: string;
  format: ModelFormat;
  builtinKind?: BuiltinMiniKind;
  assetId?: string;
  assetName?: string;
  remoteUrl?: string;
  x: number;
  z: number;
  rotationY: number;
  footprint: FootprintSize;
  scaleMultiplier: number;
  fixZUp: boolean;
  showBase: boolean;
  baseStyle?: BaseStyle;
  color: string;
  finish: MiniFinish;
  hp: number;
  maxHp: number;
  ownerName: string; // '' = any player, '__GM__' = GM locked, or specific player name
  ownerUid?: string;
  isPropOnly?: boolean;
  sheet?: CharacterSheet;
}

export interface RoomUser {
  id: string;
  name: string;
  role: Role;
  color: string;
}

export interface DiceRollEvent {
  id: string;
  userName: string;
  color?: string;
  die: number;
  result: number;
  modifier: number;
  total: number;
  timestamp: number;
}

export type MapPresetId = 'crypt' | 'tavern' | 'arena' | 'blank' | 'dungeon-gate';

export type AnnotationKind = 'marker' | 'circle' | 'square' | 'cone' | 'line';

export interface MapAnnotation {
  id: string;
  kind: AnnotationKind;
  x: number;
  z: number;
  radius: number; // grid cells (1..6)
  rotationY: number;
  color: string;
  label: string;
  gmOnly: boolean;
  createdBy: string;
}

export type MeasureRule = 'dnd5e' | 'dnd5e_alt' | 'euclidean';

export interface RulerMeasurement {
  userId: string;
  userName: string;
  color: string;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  rule: MeasureRule;
  active: boolean;
}

export interface MusicState {
  videoId: string;
  title: string;
  isPlaying: boolean;
  loop: boolean;
  positionSec: number;
  updatedAt: number;
  updatedBy: string;
}

export interface InitiativeEntry {
  id: string; // miniature id
  miniId: string;
  name: string;
  isMonster: boolean;
  initiative: number;
  bonus: number;
  roll: number;
  hasRolled: boolean;
  color?: string;
  hp?: number;
  maxHp?: number;
  ownerName?: string;
}

export interface CombatState {
  active: boolean;
  round: number;
  turnIndex: number;
  entries: InitiativeEntry[];
  lastUpdated?: number;
}

export interface RoomState {
  roomId: string;
  presetName: MapPresetId;
  cols: number;
  rows: number;
  tiles: Record<string, TileCell>;
  miniatures: Record<string, MiniatureData>;
  annotations: Record<string, MapAnnotation>;
  rulers?: Record<string, RulerMeasurement>;
  music?: MusicState | null;
  combat?: CombatState | null;
  users: RoomUser[];
  recentRolls: DiceRollEvent[];
}

export interface ModelDimensionsInfo {
  rawWidth: number;
  rawHeight: number;
  rawDepth: number;
  appliedScale: number;
  finalHeight: number;
  unitHint: string;
}

export const TILE_SIZE = 1.0;
export const ELEVATION_STEP = 0.45;
export const BASE_THICKNESS = 0.14;

export function tileKey(x: number, z: number): string {
  return `${x},${z}`;
}

export function getTileSurfaceY(tile?: TileCell): number {
  if (!tile || tile.terrain === 'void') return 0;
  if (tile.prop === 'bridge') {
    return tile.elevation * ELEVATION_STEP + BASE_THICKNESS + 0.14;
  }
  if (tile.terrain === 'water' || tile.terrain === 'lava') {
    return tile.elevation * ELEVATION_STEP + 0.06;
  }
  return tile.elevation * ELEVATION_STEP + BASE_THICKNESS;
}

// Client -> Server WebSocket events
export type ClientMessage =
  | { type: 'user:join'; payload: { name: string; role: Role; color: string } }
  | { type: 'tile:set'; payload: { cell: TileCell } }
  | { type: 'tile:batch'; payload: { cells: TileCell[] } }
  | { type: 'map:preset'; payload: { preset: MapPresetId } }
  | {
      type: 'map:restore';
      payload: {
        presetName: MapPresetId;
        tiles: Record<string, TileCell>;
        miniatures: Record<string, MiniatureData>;
        annotations: Record<string, MapAnnotation>;
      };
    }
  | { type: 'mini:create'; payload: { mini: MiniatureData } }
  | { type: 'mini:update'; payload: { id: string; patch: Partial<MiniatureData> } }
  | {
      type: 'mini:sheet';
      payload: {
        id: string;
        name?: string;
        hp: number;
        maxHp: number;
        sheet: CharacterSheet;
        ownerName?: string;
      };
    }
  | { type: 'mini:move'; payload: { id: string; x: number; z: number; rotationY?: number } }
  | { type: 'mini:delete'; payload: { id: string } }
  | { type: 'annotation:create'; payload: { annotation: MapAnnotation } }
  | { type: 'annotation:update'; payload: { id: string; patch: Partial<MapAnnotation> } }
  | { type: 'annotation:delete'; payload: { id: string } }
  | {
      type: 'ruler:update';
      payload: {
        startX: number;
        startZ: number;
        endX: number;
        endZ: number;
        rule: MeasureRule;
        active: boolean;
      };
    }
  | {
      type: 'music:control';
      payload: {
        action: 'set_and_play' | 'play' | 'pause' | 'seek' | 'toggle_loop' | 'stop';
        videoId?: string;
        title?: string;
        positionSec?: number;
      };
    }
  | { type: 'dice:roll'; payload: { die: number; modifier?: number } }
  | { type: 'combat:start' }
  | { type: 'combat:roll'; payload: { miniId: string } }
  | { type: 'combat:roll_all' }
  | { type: 'combat:next_turn' }
  | { type: 'combat:prev_turn' }
  | { type: 'combat:set_turn'; payload: { turnIndex: number } }
  | { type: 'combat:end' };

// Server -> Client WebSocket events
export type ServerMessage =
  | { type: 'room:state'; payload: RoomState }
  | { type: 'user:list'; payload: { users: RoomUser[] } }
  | { type: 'tile:updated'; payload: { cells: TileCell[] } }
  | { type: 'mini:created'; payload: { mini: MiniatureData } }
  | { type: 'mini:updated'; payload: { mini: MiniatureData } }
  | { type: 'mini:moved'; payload: { id: string; x: number; z: number; rotationY: number } }
  | { type: 'mini:deleted'; payload: { id: string } }
  | { type: 'annotation:created'; payload: { annotation: MapAnnotation } }
  | { type: 'annotation:updated'; payload: { annotation: MapAnnotation } }
  | { type: 'annotation:deleted'; payload: { id: string } }
  | { type: 'ruler:updated'; payload: { ruler: RulerMeasurement } }
  | { type: 'map:restored'; payload: any }
  | { type: 'room:preset_applied'; payload: any }
  | { type: 'tile:batch_updated'; payload: { cells: TileCell[] } }
  | { type: 'mini:added'; payload: { mini?: MiniatureData; miniature?: MiniatureData } }
  | { type: 'music:updated'; payload: { music: MusicState | null } }
  | { type: 'music:state'; payload: any }
  | { type: 'combat:updated'; payload: { combat: CombatState | null } }
  | { type: 'dice:rolled'; payload: { roll: DiceRollEvent } }
  | { type: 'error'; payload: { message: string } };
