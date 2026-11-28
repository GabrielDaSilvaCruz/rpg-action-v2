import React, { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { User } from 'firebase/auth';
import {
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Cloud,
  Copy,
  Crown,
  Database,
  Dices,
  Disc,
  Eraser,
  ExternalLink,
  Eye,
  EyeOff,
  Bookmark,
  DoorOpen,
  Download,
  FolderDown,
  FolderPlus,
  Globe,
  Hammer,
  Image as ImageIcon,
  Layers,
  Link2,
  Lock,
  LogOut,
  Map,
  MapPin,
  MousePointer,
  Music,
  Pause,
  Play,
  Plus,
  Redo2,
  Repeat,
  RotateCcw,
  RotateCw,
  Ruler,
  Save,
  ScrollText,
  Shield,
  Skull,
  Sparkles,
  Square,
  Swords,
  Trash2,
  Undo2,
  Upload,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  AnnotationKind,
  BaseStyle,
  DiceRollEvent,
  FootprintSize,
  MapAnnotation,
  MapPresetId,
  MeasureRule,
  MiniFinish,
  MiniatureData,
  ModelDimensionsInfo,
  ModelFormat,
  Role,
  RoomScene,
  RoomState,
  SavedActorTemplate,
  SavedScenario,
  TerrainKind,
  tileKey,
} from '../types/vtt';
import { buildMapPreset } from '../utils/mapPresets';
import { AnnotationBrush, CameraPreset, RulerLineCoords, SculptBrush } from './TabletopViewport';
import {
  fetchAssetBuffer,
  normalizeAndDimensionModel,
  parseRawModel,
  clearUnusedModelCache,
} from '../engine/modelNormalizer';
import { uploadImageFileAsTazoAsset } from '../engine/tazoTokenBuilder';
import {
  CATALOG_BY_ID,
  CURATED_3D_CATALOG,
  CatalogCategory,
  CuratedAssetItem,
} from '../utils/assetCatalog';
import { MEASURE_RULES, calculateGridDistance } from '../utils/distanceRules';
import {
  RPG_MUSIC_PRESETS,
  RpgMusicTrack,
  extractYouTubeVideoId,
} from '../utils/youtubeMusic';
import { YouTubeSyncPlayer } from './YouTubeSyncPlayer';
import { ModelPreview3D } from './ModelPreview3D';
import { apiUrl } from '../utils/backendUrl';
import {
  HERO_SHEET_TEMPLATES,
  MONSTER_SHEET_TEMPLATES,
  cloneSheet,
  createDefaultSheet,
  resolveMiniSheet,
} from '../utils/sheetTemplates';

interface TabletopHUDProps {
  roomState: RoomState | null;
  connected: boolean;
  role: Role;
  gmLayer?: 'all' | 'characters' | 'props';
  onSetGmLayer?: (layer: 'all' | 'characters' | 'props') => void;
  userName: string;
  userColor: string;
  firebaseUser: User | null;
  cloudSyncing: boolean;
  cloudSavedAt: number | null;
  onGoogleSignOut: () => void;
  onSaveCloud: () => void;
  onLoadCloud: () => void;
  toolMode: 'interact' | 'sculpt' | 'annotate' | 'measure';
  sculptBrush: SculptBrush;
  annotationBrush: AnnotationBrush;
  measureRule: MeasureRule;
  measureSnap: boolean;
  measureShare: boolean;
  localRuler: RulerLineCoords | null;
  selectedMiniId: string | null;
  selectedAnnotationId: string | null;
  hoverInfo: { x: number; z: number; distanceCells: number | null } | null;
  muted: boolean;
  errorToast: string | null;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  onUndo: () => void;
  onRedo: () => void;
  onSetToolMode: (mode: 'interact' | 'sculpt' | 'annotate' | 'measure') => void;
  onSetSculptBrush: (brush: SculptBrush) => void;
  onSetAnnotationBrush: (brush: AnnotationBrush) => void;
  onSetMeasureRule: (rule: MeasureRule) => void;
  onSetMeasureSnap: (snap: boolean) => void;
  onSetMeasureShare: (share: boolean) => void;
  onClearRuler: () => void;
  onSelectMini: (id: string | null) => void;
  onSelectAnnotation: (id: string | null) => void;
  onCreateMini: (mini: MiniatureData) => void;
  onUpdateMini: (id: string, patch: Partial<MiniatureData>) => void;
  onMoveMini: (id: string, x: number, z: number, rotationY?: number) => void;
  onDeleteMini: (id: string) => void;
  onUpdateAnnotation: (id: string, patch: Partial<MapAnnotation>) => void;
  onDeleteAnnotation: (id: string) => void;
  onChangePreset: (preset: MapPresetId) => void;
  onResizeBoard: (cols: number, rows: number) => void;
  onRollDice: (die: number, modifier?: number) => void;
  onCameraPreset: (preset: CameraPreset) => void;
  onToggleMute: () => void;
  onSwitchRole: (nextRole: Role) => void;
  onOpenSheet: (miniId: string) => void;
  onControlMusic: (payload: {
    action: 'set_and_play' | 'play' | 'pause' | 'seek' | 'toggle_loop' | 'stop';
    videoId?: string;
    title?: string;
    positionSec?: number;
  }) => void;
  onStartCombat: () => void;
  onRollInitiative: (miniId: string) => void;
  onRollMonstersInitiative?: () => void;
  onRollAllInitiative: () => void;
  onNextTurn: () => void;
  onPrevTurn: () => void;
  onSetTurn: (turnIndex: number) => void;
  onEndCombat: () => void;
  savedScenarios?: SavedScenario[];
  onSaveCurrentScenario?: (name: string, description?: string) => SavedScenario;
  onLoadScenario?: (scenarioIdOrPreset: string) => void;
  onDeleteScenario?: (id: string) => void;
  onExportScenario?: (scenario: SavedScenario) => void;
  onImportScenario?: (file: File) => void;
  onClearCharacters?: () => void;
  savedActors?: SavedActorTemplate[];
  onSaveActorToLibrary?: (mini: MiniatureData) => void;
  onSpawnActorFromLibrary?: (actor: SavedActorTemplate) => void;
  onDeleteSavedActor?: (id: string) => void;
  onExportActor?: (actor: SavedActorTemplate) => void;
  onImportActor?: (file: File) => void;
  activePortalPrompt?: {
    portal: MapAnnotation;
    miniId: string;
    miniName: string;
  } | null;
  onConfirmPortalTeleport?: () => void;
  onCancelPortalTeleport?: () => void;
  scenes?: Record<string, RoomScene>;
  activeSceneId?: string;
  onSelectScene?: (sceneId: string) => void;
  onCreateScene?: (scene: RoomScene) => void;
  onDeleteScene?: (sceneId: string) => void;
  onMoveMiniToScene?: (miniId: string, sceneId: string, targetX?: number, targetZ?: number) => void;
  onGatherAllToScene?: (sceneId: string) => void;
}

const TERRAINS: { id: TerrainKind; label: string; swatch: string }[] = [
  { id: 'stone', label: 'Pedra', swatch: '#525866' },
  { id: 'cobble', label: 'Lajota', swatch: '#6d727e' },
  { id: 'wood', label: 'Madeira', swatch: '#785032' },
  { id: 'grass', label: 'Grama', swatch: '#3d5e35' },
  { id: 'water', label: 'Agua', swatch: '#1d759e' },
  { id: 'lava', label: 'Lava', swatch: '#dc4b13' },
];

const FOOTPRINTS: { value: FootprintSize; label: string }[] = [
  { value: 0.5, label: '0.5x' },
  { value: 1, label: '1x1' },
  { value: 2, label: '2x2' },
  { value: 3, label: '3x3' },
  { value: 4, label: '4x4' },
];

const BASE_STYLES: { id: BaseStyle; label: string }[] = [
  { id: 'rune', label: 'Base Runica' },
  { id: 'cobble', label: 'Base Pedra' },
  { id: 'moss', label: 'Base Musgo' },
  { id: 'magma', label: 'Base Magma' },
  { id: 'royal', label: 'Base Real' },
];

const FINISHES: { id: MiniFinish; label: string }[] = [
  { id: 'stone', label: 'Pedra de Xadrez' },
  { id: 'resin', label: 'Resina 3D' },
  { id: 'bronze', label: 'Bronze' },
  { id: 'gold', label: 'Ouro' },
  { id: 'arcane', label: 'Arcano' },
  { id: 'original', label: 'Original' },
];

const MINI_COLORS = ['#d97706', '#0ea5e9', '#10b981', '#ef4444', '#a855f7', '#a8a29e'];

const ANNOTATION_KINDS: { id: AnnotationKind; label: string }[] = [
  { id: 'marker', label: 'Marcador Texto' },
  { id: 'portal', label: '🚪 Área de Transferência / Portal' },
  { id: 'circle', label: 'Circulo' },
  { id: 'square', label: 'Quadrado' },
  { id: 'cone', label: 'Cone 60°' },
  { id: 'line', label: 'Linha' },
];

const ANNOTATION_COLORS = ['#f59e0b', '#ef4444', '#a855f7', '#0ea5e9', '#10b981', '#f8fafc'];

const QUICK_ANNOTATION_TAGS = ['Tesouro', 'Armadilha', 'Perigo', 'Segredo', 'Zona Magica'];

const EXTERNAL_REPOS = [
  {
    title: 'MakerWorld · Colecao TTRPG (Baixar .STL)',
    desc: 'Baixe os .STL da colecao e envie no botao "Enviar .STL" — o sistema dimensiona e aplica Pedra de Xadrez automaticamente',
    url: 'https://makerworld.com/pt/collections/25327872-ttrpg',
  },
  {
    title: 'GitHub · triangletodd/dnd_models',
    desc: 'Repositorio comunitario com herois e monstros D&D esculpidos em .STL',
    url: 'https://github.com/triangletodd/dnd_models',
  },
  {
    title: 'GitHub · ToxSam/open-source-3D-assets',
    desc: 'Acervo CC0 com centenas de props medievais e arquitetura .GLB',
    url: 'https://github.com/ToxSam/open-source-3D-assets',
  },
  {
    title: 'mz4250 · Colecao Completa D&D',
    desc: 'Milhares de miniaturas gratuitas de todos os monstros e herois de D&D 5e',
    url: 'https://mz4250.com/',
  },
];

export const TabletopHUD: React.FC<TabletopHUDProps> = ({
  roomState,
  connected,
  role,
  gmLayer = 'all',
  onSetGmLayer,
  userName,
  userColor,
  firebaseUser,
  cloudSyncing,
  cloudSavedAt,
  onGoogleSignOut,
  onSaveCloud,
  onLoadCloud,
  toolMode,
  sculptBrush,
  annotationBrush,
  measureRule,
  measureSnap,
  measureShare,
  localRuler,
  selectedMiniId,
  selectedAnnotationId,
  hoverInfo,
  muted,
  errorToast,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
  onSetToolMode,
  onSetSculptBrush,
  onSetAnnotationBrush,
  onSetMeasureRule,
  onSetMeasureSnap,
  onSetMeasureShare,
  onClearRuler,
  onSelectMini,
  onSelectAnnotation,
  onCreateMini,
  onUpdateMini,
  onMoveMini,
  onDeleteMini,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onChangePreset,
  onResizeBoard,
  onRollDice,
  onCameraPreset,
  onToggleMute,
  onSwitchRole,
  onOpenSheet,
  onControlMusic,
  onStartCombat,
  onRollInitiative,
  onRollMonstersInitiative,
  onRollAllInitiative,
  onNextTurn,
  onPrevTurn,
  onSetTurn,
  onEndCombat,
  savedScenarios = [],
  onSaveCurrentScenario,
  onLoadScenario,
  onDeleteScenario,
  onExportScenario,
  onImportScenario,
  onClearCharacters,
  savedActors = [],
  onSaveActorToLibrary,
  onSpawnActorFromLibrary,
  onDeleteSavedActor,
  onExportActor,
  onImportActor,
  activePortalPrompt,
  onConfirmPortalTeleport,
  onCancelPortalTeleport,
  scenes,
  activeSceneId,
  onSelectScene,
  onCreateScene,
  onDeleteScene,
  onMoveMiniToScene,
  onGatherAllToScene,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [showAddMapModal, setShowAddMapModal] = useState(false);
  const [newMapName, setNewMapName] = useState('');
  const [newMapTemplate, setNewMapTemplate] = useState<string>('tavern');
  const [boardCols, setBoardCols] = useState(String(roomState?.cols || 16));
  const [boardRows, setBoardRows] = useState(String(roomState?.rows || 16));
  const [gmTab, setGmTab] = useState<'map' | 'minis' | 'scale' | 'sheets' | 'annotations' | 'music' | 'players'>('map');
  const [assetSourceView, setAssetSourceView] = useState<'catalog' | 'import'>('catalog');
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'scenery' | CatalogCategory>('all');
  const charCount = Object.values(roomState?.miniatures || {}).filter((m) => !m.isPropOnly).length;
  const propCount = Object.values(roomState?.miniatures || {}).filter((m) => !!m.isPropOnly).length;
  const [previewCatalogId, setPreviewCatalogId] = useState<string>('stl-red-dragon');
  const [previewFinish, setPreviewFinish] = useState<MiniFinish>('stone');
  const [showSources, setShowSources] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [dicePaletteOpen, setDicePaletteOpen] = useState(false);

  useEffect(() => {
    setBoardCols(String(roomState?.cols || 16));
    setBoardRows(String(roomState?.rows || 16));
  }, [roomState?.cols, roomState?.rows]);
  const [diceModifier, setDiceModifier] = useState<number>(0);
  const [showDiceLog, setShowDiceLog] = useState(false);

  // Modais de Cenários e Biblioteca Pessoal
  const [showSaveScenarioModal, setShowSaveScenarioModal] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [newScenarioDesc, setNewScenarioDesc] = useState('');
  const [showScenarioManagerModal, setShowScenarioManagerModal] = useState(false);
  const scenarioImportInputRef = useRef<HTMLInputElement | null>(null);
  const actorImportInputRef = useRef<HTMLInputElement | null>(null);
  const [libraryToast, setLibraryToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setLibraryToast(msg);
    setTimeout(() => setLibraryToast(null), 3000);
  };

  // Monster & Hero-for-Player sheet creator state (GM)
  const [newMonsterTplId, setNewMonsterTplId] = useState<string>(MONSTER_SHEET_TEMPLATES[0].id);
  const [newMonsterAssetId, setNewMonsterAssetId] = useState<string>(
    MONSTER_SHEET_TEMPLATES[0].catalogAssetId || 'stl-goblin'
  );
  const [newMonsterFinish, setNewMonsterFinish] = useState<MiniFinish>('stone');
  const [newMonsterName, setNewMonsterName] = useState('');
  const [newMonsterTazoFile, setNewMonsterTazoFile] = useState<File | null>(null);
  const [newMonsterTazoPreview, setNewMonsterTazoPreview] = useState<string | null>(null);
  const [creatingMonsterTazo, setCreatingMonsterTazo] = useState(false);
  const monsterTazoInputRef = useRef<HTMLInputElement | null>(null);

  const [gmHeroTplId, setGmHeroTplId] = useState<string>(HERO_SHEET_TEMPLATES[0].id);
  const [gmHeroOwner, setGmHeroOwner] = useState<string>('');
  const [gmHeroName, setGmHeroName] = useState<string>('');
  const [gmHeroTazoFile, setGmHeroTazoFile] = useState<File | null>(null);
  const [creatingGmHeroTazo, setCreatingGmHeroTazo] = useState(false);
  const gmHeroTazoInputRef = useRef<HTMLInputElement | null>(null);

  // Player 1-Character Self-Creator state (supports 3D mini OR circular Tazo image)
  const [showPlayerCreator, setShowPlayerCreator] = useState(false);
  const [playerTokenMode, setPlayerTokenMode] = useState<'3d' | 'tazo'>('3d');
  const [playerCharName, setPlayerCharName] = useState('');
  const [playerHeroTplId, setPlayerHeroTplId] = useState<string>(HERO_SHEET_TEMPLATES[0].id);
  const [playerHeroAssetId, setPlayerHeroAssetId] = useState<string>('stl-hero-barbarian');
  const [playerHeroColor, setPlayerHeroColor] = useState<string>(userColor || '#0ea5e9');
  const [playerCustomFile, setPlayerCustomFile] = useState<File | null>(null);
  const [playerTazoFile, setPlayerTazoFile] = useState<File | null>(null);
  const [playerTazoUrl, setPlayerTazoUrl] = useState('');
  const [playerTazoPreview, setPlayerTazoPreview] = useState<string | null>(null);
  const [playerCreating, setPlayerCreating] = useState(false);
  const [playerCreateError, setPlayerCreateError] = useState<string | null>(null);
  const playerFileInputRef = useRef<HTMLInputElement | null>(null);
  const playerImageInputRef = useRef<HTMLInputElement | null>(null);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);

  // YouTube Music DJ state (GM)
  const [ytUrlInput, setYtUrlInput] = useState('');
  const [ytTitleInput, setYtTitleInput] = useState('');
  const [customTracks, setCustomTracks] = useState<RpgMusicTrack[]>([]);
  const [loadingYtInfo, setLoadingYtInfo] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);

  // Remote URL importer state
  const [remoteUrl, setRemoteUrl] = useState('');
  const [fetchingUrl, setFetchingUrl] = useState(false);

  // 3D Model & Image Tazo Import State (.stl, .obj, .glb, .gltf, .png, .jpg, .webp)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [importDraft, setImportDraft] = useState<{
    file?: File;
    preUploadedAssetId?: string;
    previewUrl?: string;
    fileName: string;
    format: ModelFormat;
    name: string;
    footprint: FootprintSize;
    scaleMultiplier: number;
    fixZUp: boolean;
    showBase: boolean;
    baseStyle: BaseStyle;
    finish: MiniFinish;
    color: string;
    ownerName: string;
    isPropOnly: boolean;
    dimInfo: ModelDimensionsInfo | null;
    rawObject: unknown;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const selectedMini = selectedMiniId ? roomState?.miniatures[selectedMiniId] || null : null;
  const selectedAnnotation = selectedAnnotationId
    ? roomState?.annotations?.[selectedAnnotationId] || null
    : null;

  useEffect(() => {
    if (role === 'gm' && selectedMini && gmTab === 'map' && toolMode === 'interact') {
      setGmTab('scale');
    }
  }, [selectedMiniId]);

  useEffect(() => {
    if (role === 'gm' && selectedAnnotation) {
      setGmTab('annotations');
    }
  }, [selectedAnnotationId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      } else if (e.key === 'm' || e.key === 'M') {
        onSetToolMode(toolMode === 'measure' ? 'interact' : 'measure');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toolMode, onSetToolMode]);

  const copyInviteLink = () => {
    const url = new URL(window.location.href);
    if (roomState?.roomId) url.searchParams.set('room', roomState.roomId);
    navigator.clipboard.writeText(url.toString()).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };

  const clearImportDraft = () => {
    setImportDraft((prev) => {
      if (prev?.previewUrl && prev.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return null;
    });
  };

  const stageParsedModel = async (
    buffer: ArrayBuffer,
    fileName: string,
    format: ModelFormat,
    file?: File,
    preUploadedAssetId?: string
  ) => {
    if (format === 'image') {
      const previewUrl = file
        ? URL.createObjectURL(file)
        : preUploadedAssetId
        ? apiUrl(`/api/assets/${encodeURIComponent(preUploadedAssetId)}`)
        : undefined;
      setImportDraft((prev) => {
        if (prev?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(prev.previewUrl);
        return {
          file,
          preUploadedAssetId,
          previewUrl,
          fileName,
          format: 'image',
          name: fileName.replace(/\.[^.]+$/, '').slice(0, 24) || 'Tazo',
          footprint: 1,
          scaleMultiplier: 1,
          fixZUp: false,
          showBase: false,
          baseStyle: 'rune',
          finish: 'original',
          color: '#d97706',
          ownerName: '',
          isPropOnly: false,
          dimInfo: null,
          rawObject: null,
        };
      });
      return;
    }

    const defaultZUp = format === 'stl';
    const defaultFinish: MiniFinish = format === 'glb' || format === 'gltf' ? 'original' : 'stone';
    const rawObj = await parseRawModel(format, buffer);
    const { info } = normalizeAndDimensionModel(rawObj, {
      footprint: 1,
      scaleMultiplier: 1,
      fixZUp: defaultZUp,
      showBase: true,
      finish: defaultFinish,
      color: '#d97706',
      isPropOnly: false,
    });

    setImportDraft((prev) => {
      if (prev?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(prev.previewUrl);
      return {
        file,
        preUploadedAssetId,
        fileName,
        format,
        name: fileName.replace(/\.[^.]+$/, '').slice(0, 24),
        footprint: 1,
        scaleMultiplier: 1,
        fixZUp: defaultZUp,
        showBase: true,
        baseStyle: 'rune',
        finish: defaultFinish,
        color: '#d97706',
        ownerName: '',
        isPropOnly: false,
        dimInfo: info,
        rawObject: rawObj,
      };
    });
  };

  const handleFileChosen = async (file: File) => {
    setImportError(null);
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      try {
        const buffer = await file.arrayBuffer();
        await stageParsedModel(buffer, file.name, 'image', file);
      } catch (err) {
        console.error(err);
        setImportError('Nao foi possivel ler esta imagem para criar o Tazo.');
      }
      return;
    }

    if (!['stl', 'obj', 'glb', 'gltf'].includes(ext)) {
      setImportError(
        'Formato nao suportado. Envie modelos .STL, .OBJ, .GLB, .GLTF ou imagem .PNG, .JPG, .WEBP.'
      );
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      await stageParsedModel(buffer, file.name, ext as ModelFormat, file);
    } catch (err) {
      console.error(err);
      setImportError('Nao foi possivel ler a malha 3D deste arquivo.');
    }
  };

  const handleImportFromUrl = async () => {
    if (!remoteUrl.trim()) return;
    setImportError(null);
    setFetchingUrl(true);

    try {
      const res = await fetch(apiUrl('/api/assets/from-url'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: remoteUrl.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        assetId?: string;
        name?: string;
        format?: ModelFormat;
        error?: string;
      };
      if (!res.ok || !data.assetId || !data.format) {
        throw new Error(data.error || 'Falha ao baixar arquivo da URL.');
      }
      const buf = await fetchAssetBuffer(data.assetId);
      await stageParsedModel(buf, data.name || 'modelo', data.format, undefined, data.assetId);
      setRemoteUrl('');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erro ao importar URL.');
    } finally {
      setFetchingUrl(false);
    }
  };

  const updateImportDraft = (patch: Partial<NonNullable<typeof importDraft>>) => {
    setImportDraft((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...patch };
      if (next.rawObject && next.format !== 'image') {
        try {
          const { info } = normalizeAndDimensionModel(next.rawObject as never, {
            footprint: next.footprint,
            scaleMultiplier: next.scaleMultiplier,
            fixZUp: next.fixZUp,
            showBase: next.showBase,
            finish: next.finish,
            color: next.color,
            isPropOnly: next.isPropOnly,
          });
          next.dimInfo = info;
        } catch {
          // ignore
        }
      }
      return next;
    });
  };

  const uploadImportDraftAssetIfNeeded = async (): Promise<{
    assetId: string;
    assetName: string;
  }> => {
    if (!importDraft) {
      throw new Error('Nenhum modelo preparado para envio.');
    }
    if (importDraft.preUploadedAssetId) {
      return {
        assetId: importDraft.preUploadedAssetId,
        assetName: importDraft.fileName,
      };
    }
    if (!importDraft.file) {
      throw new Error('Arquivo 3D nao encontrado.');
    }
    if (importDraft.format === 'image') {
      const uploadedImg = await uploadImageFileAsTazoAsset(importDraft.file);
      return { assetId: uploadedImg.assetId, assetName: uploadedImg.name };
    }
    const arrayBuf = await importDraft.file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const res = await fetch(apiUrl('/api/assets'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: importDraft.file.name,
        format: importDraft.format,
        dataBase64: btoa(binary),
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Erro ao enviar arquivo 3D');
    }
    const uploaded = (await res.json()) as { assetId: string; name: string };
    return { assetId: uploaded.assetId, assetName: uploaded.name };
  };

  const handleConfirmImport = async (applyToSelected = false) => {
    if (!importDraft) return;
    setUploading(true);
    setImportError(null);

    try {
      const { assetId, assetName } = await uploadImportDraftAssetIfNeeded();

      if (applyToSelected && selectedMini) {
        onUpdateMini(selectedMini.id, {
          format: importDraft.format,
          assetId,
          assetName,
          remoteUrl: undefined,
          footprint: importDraft.footprint,
          scaleMultiplier: importDraft.scaleMultiplier,
          fixZUp: importDraft.fixZUp,
          showBase: importDraft.format === 'image' ? false : importDraft.showBase,
          baseStyle: importDraft.baseStyle,
          finish: importDraft.finish,
          isPropOnly: importDraft.isPropOnly,
        });
        clearImportDraft();
        setGmTab('scale');
        return;
      }

      const offset = importDraft.footprint % 2 === 0 ? 0.5 : 0;
      const isMonster = !importDraft.isPropOnly && importDraft.ownerName === '__GM__';
      const newMini: MiniatureData = {
        id: `mini-${crypto.randomUUID().slice(0, 8)}`,
        name: importDraft.name || (importDraft.format === 'image' ? 'Tazo' : 'Miniatura 3D'),
        format: importDraft.format,
        assetId,
        assetName,
        x: 7 + offset,
        z: 8 + offset,
        rotationY: 0,
        footprint: importDraft.footprint,
        scaleMultiplier: importDraft.scaleMultiplier,
        fixZUp: importDraft.fixZUp,
        showBase: importDraft.format === 'image' ? false : importDraft.showBase,
        baseStyle: importDraft.baseStyle,
        color: importDraft.color,
        finish: importDraft.finish,
        hp: 35,
        maxHp: 35,
        ownerName: importDraft.isPropOnly ? '__GM__' : importDraft.ownerName,
        isPropOnly: importDraft.isPropOnly,
        sheet: importDraft.isPropOnly
          ? undefined
          : createDefaultSheet(isMonster, importDraft.name),
      };

      onCreateMini(newMini);
      onSelectMini(newMini.id);
      onCameraPreset('top');
      clearImportDraft();
      setGmTab('scale');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Falha ao importar arquivo.');
    } finally {
      setUploading(false);
    }
  };

  const spawnCatalogAsset = (item: CuratedAssetItem, overrideFinish?: MiniFinish) => {
    setImportError(null);
    const offset = item.footprint % 2 === 0 ? 0.5 : 0;
    const isMonster = !item.isPropOnly && item.category === 'monster';
    const defaultSheet = item.isPropOnly
      ? undefined
      : createDefaultSheet(isMonster, `${item.id} ${item.name}`);
    const suggestedTpl = MONSTER_SHEET_TEMPLATES.find((t) => t.catalogAssetId === item.id);
    const startHp = suggestedTpl ? suggestedTpl.suggestedHp : isMonster ? 40 : 35;

    const isEven = item.footprint % 2 === 0;
    const spawnX = hoverInfo ? (isEven ? Math.floor(hoverInfo.x) + 0.5 : Math.round(hoverInfo.x)) : (isEven ? 7.5 : 7);
    const spawnZ = hoverInfo ? (isEven ? Math.floor(hoverInfo.z) + 0.5 : Math.round(hoverInfo.z)) : (isEven ? 7.5 : 8);

    const newMini: MiniatureData = {
      id: `mini-${crypto.randomUUID().slice(0, 8)}`,
      name: item.name,
      format: item.format,
      assetId: `cat:${item.id}`,
      assetName: item.name,
      remoteUrl: item.url,
      x: spawnX,
      z: spawnZ,
      rotationY: item.isPropOnly ? 0 : Math.PI,
      footprint: item.footprint,
      scaleMultiplier: item.scaleMultiplier,
      fixZUp: item.fixZUp,
      showBase: item.isPropOnly ? false : item.showBase,
      baseStyle: item.baseStyle,
      color: item.color,
      finish: overrideFinish || item.finish,
      hp: startHp,
      maxHp: startHp,
      ownerName: item.isPropOnly || isMonster ? '__GM__' : '',
      isPropOnly: item.isPropOnly,
      sheet: defaultSheet,
    };
    onCreateMini(newMini);
    onSelectMini(newMini.id);
    onSetToolMode('interact');
    onCameraPreset('top');
    clearUnusedModelCache({ ...roomState?.miniatures, [newMini.id]: newMini });
  };

  const applyCatalogAssetToSelected = (item: CuratedAssetItem, overrideFinish?: MiniFinish) => {
    if (!selectedMini) return;
    setImportError(null);
    onUpdateMini(selectedMini.id, {
      format: item.format,
      assetId: `cat:${item.id}`,
      assetName: item.name,
      remoteUrl: item.url,
      footprint: item.footprint,
      scaleMultiplier: item.scaleMultiplier,
      fixZUp: item.fixZUp,
      showBase: item.isPropOnly ? false : item.showBase,
      baseStyle: item.baseStyle,
      finish: overrideFinish || item.finish,
      isPropOnly: item.isPropOnly,
    });
    setGmTab('scale');
  };

  const handleCreateMonsterWithSheet = async () => {
    const tpl =
      MONSTER_SHEET_TEMPLATES.find((t) => t.id === newMonsterTplId) ||
      MONSTER_SHEET_TEMPLATES[0];
    const catItem =
      CATALOG_BY_ID[newMonsterAssetId] ||
      (tpl.catalogAssetId && CATALOG_BY_ID[tpl.catalogAssetId]) ||
      CATALOG_BY_ID['stl-goblin'] ||
      CURATED_3D_CATALOG.find((c) => c.category === 'monster')!;

    const offset = catItem.footprint % 2 === 0 ? 0.5 : 0;
    const monsterName = (newMonsterName.trim() || tpl.label).slice(0, 32);

    let format: ModelFormat = catItem.format;
    let assetId: string = `cat:${catItem.id}`;
    let assetName: string = catItem.name;
    let remoteUrlField: string | undefined = catItem.url;
    let fixZUp = catItem.fixZUp;
    let showBase = catItem.showBase;
    let finish: MiniFinish = newMonsterFinish || catItem.finish;

    if (newMonsterTazoFile) {
      setCreatingMonsterTazo(true);
      try {
        const uploaded = await uploadImageFileAsTazoAsset(newMonsterTazoFile);
        format = 'image';
        assetId = uploaded.assetId;
        assetName = uploaded.name;
        remoteUrlField = undefined;
        fixZUp = false;
        showBase = false;
        finish = 'original';
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Falha ao enviar imagem do Tazo.');
        setCreatingMonsterTazo(false);
        return;
      } finally {
        setCreatingMonsterTazo(false);
      }
    }

    const newMini: MiniatureData = {
      id: `mini-${crypto.randomUUID().slice(0, 8)}`,
      name: monsterName,
      format,
      assetId,
      assetName,
      remoteUrl: remoteUrlField,
      x: 7 + offset,
      z: 6 + offset,
      rotationY: 0,
      footprint: catItem.footprint,
      scaleMultiplier: format === 'image' ? 1 : catItem.scaleMultiplier,
      fixZUp,
      showBase,
      baseStyle: catItem.baseStyle,
      color: format === 'image' ? '#ef4444' : catItem.color,
      finish,
      hp: tpl.suggestedHp,
      maxHp: tpl.suggestedHp,
      ownerName: '__GM__',
      isPropOnly: false,
      sheet: cloneSheet(tpl.sheet),
    };
    onCreateMini(newMini);
    onSelectMini(newMini.id);
    onSetToolMode('interact');
    onCameraPreset('top');
    clearUnusedModelCache({ ...roomState?.miniatures, [newMini.id]: newMini });
    setNewMonsterName('');
    setNewMonsterTazoFile(null);
    if (newMonsterTazoPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(newMonsterTazoPreview);
    }
    setNewMonsterTazoPreview(null);
    onOpenSheet(newMini.id);
  };

  const handleGmCreateHeroForPlayer = async () => {
    const tpl =
      HERO_SHEET_TEMPLATES.find((t) => t.id === gmHeroTplId) || HERO_SHEET_TEMPLATES[0];
    const catItem =
      (tpl.catalogAssetId && CATALOG_BY_ID[tpl.catalogAssetId]) ||
      CATALOG_BY_ID['stl-hero-barbarian'] ||
      CURATED_3D_CATALOG.find((c) => c.category === 'character')!;

    const existingCount = Object.values(roomState?.miniatures || {}).length;
    const spawnX = Math.max(1, Math.min(14, 5 + (existingCount % 6)));
    const spawnZ = Math.max(1, Math.min(14, 9 + Math.floor(existingCount / 6)));
    const charName = (gmHeroName.trim() || `${tpl.label.split(' ')[0]}`).slice(0, 32);

    let format: ModelFormat = catItem.format;
    let assetId: string = `cat:${catItem.id}`;
    let assetName: string = catItem.name;
    let remoteUrlField: string | undefined = catItem.url;
    let fixZUp = catItem.fixZUp;
    let showBase = catItem.showBase;
    let finish: MiniFinish = catItem.finish;

    if (gmHeroTazoFile) {
      setCreatingGmHeroTazo(true);
      try {
        const uploaded = await uploadImageFileAsTazoAsset(gmHeroTazoFile);
        format = 'image';
        assetId = uploaded.assetId;
        assetName = uploaded.name;
        remoteUrlField = undefined;
        fixZUp = false;
        showBase = false;
        finish = 'original';
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Falha ao enviar imagem do Tazo.');
        setCreatingGmHeroTazo(false);
        return;
      } finally {
        setCreatingGmHeroTazo(false);
      }
    }

    const newMini: MiniatureData = {
      id: `mini-${crypto.randomUUID().slice(0, 8)}`,
      name: charName,
      format,
      assetId,
      assetName,
      remoteUrl: remoteUrlField,
      x: spawnX,
      z: spawnZ,
      rotationY: format === 'image' ? 0 : Math.PI,
      footprint: catItem.footprint,
      scaleMultiplier: format === 'image' ? 1 : catItem.scaleMultiplier,
      fixZUp,
      showBase,
      baseStyle: catItem.baseStyle,
      color: format === 'image' ? '#0ea5e9' : catItem.color,
      finish,
      hp: tpl.suggestedHp,
      maxHp: tpl.suggestedHp,
      ownerName: gmHeroOwner,
      isPropOnly: false,
      sheet: cloneSheet(tpl.sheet),
    };
    onCreateMini(newMini);
    onSelectMini(newMini.id);
    onSetToolMode('interact');
    onCameraPreset('top');
    clearUnusedModelCache({ ...roomState?.miniatures, [newMini.id]: newMini });
    setGmHeroName('');
    setGmHeroTazoFile(null);
    onOpenSheet(newMini.id);
  };

  const handlePlayerCreateOwnCharacter = async () => {
    setPlayerCreateError(null);
    setPlayerCreating(true);
    try {
      const tpl =
        HERO_SHEET_TEMPLATES.find((t) => t.id === playerHeroTplId) || HERO_SHEET_TEMPLATES[0];
      const catItem =
        CATALOG_BY_ID[playerHeroAssetId] ||
        (tpl.catalogAssetId && CATALOG_BY_ID[tpl.catalogAssetId]) ||
        CATALOG_BY_ID['stl-hero-barbarian']!;

      let assetId: string = `cat:${catItem.id}`;
      let assetName: string = catItem.name;
      let format: ModelFormat = catItem.format;
      let remoteUrlField: string | undefined = catItem.url;
      let fixZUp = catItem.fixZUp;
      let finish: MiniFinish = catItem.finish;
      let showBase = true;
      let rotationY = Math.PI;
      let scaleMultiplier = catItem.scaleMultiplier || 1;

      if (playerTokenMode === 'tazo') {
        if (playerTazoFile) {
          const uploaded = await uploadImageFileAsTazoAsset(playerTazoFile);
          assetId = uploaded.assetId;
          assetName = uploaded.name;
        } else if (playerTazoUrl.trim()) {
          if (!/^https?:\/\//i.test(playerTazoUrl.trim())) {
            throw new Error('Informe uma URL HTTP/HTTPS valida para a imagem do Tazo.');
          }
          const res = await fetch(apiUrl('/api/assets/from-url'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: playerTazoUrl.trim() }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            assetId?: string;
            name?: string;
            format?: ModelFormat;
            error?: string;
          };
          if (!res.ok || !data.assetId || data.format !== 'image') {
            throw new Error(data.error || 'A URL informada nao retornou uma imagem PNG/JPG/WEBP valida.');
          }
          assetId = data.assetId;
          assetName = data.name || 'tazo.png';
        } else {
          throw new Error('Escolha uma imagem (.PNG, .JPG, .WEBP) ou cole a URL para criar seu Tazo.');
        }

        format = 'image';
        remoteUrlField = undefined;
        fixZUp = false;
        showBase = false;
        finish = 'original';
        rotationY = 0;
        scaleMultiplier = 1;
      } else if (playerCustomFile) {
        const ext = playerCustomFile.name.split('.').pop()?.toLowerCase() || '';
        if (!['stl', 'obj', 'glb', 'gltf'].includes(ext)) {
          throw new Error('Formato invalido. Use .STL, .OBJ, .GLB ou .GLTF.');
        }
        const arrayBuf = await playerCustomFile.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        const res = await fetch(apiUrl('/api/assets'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: playerCustomFile.name,
            format: ext,
            dataBase64: btoa(binary),
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Falha ao enviar modelo 3D.');
        }
        const uploaded = (await res.json()) as { assetId: string; name: string };
        assetId = uploaded.assetId;
        assetName = uploaded.name;
        format = ext as ModelFormat;
        remoteUrlField = undefined;
        fixZUp = ext === 'stl';
        finish = ext === 'glb' || ext === 'gltf' ? 'original' : 'stone';
      }

      const existingCount = Object.values(roomState?.miniatures || {}).length;
      const spawnX = Math.max(1, Math.min(14, 6 + (existingCount % 5)));
      const spawnZ = Math.max(1, Math.min(14, 10 + Math.floor(existingCount / 5)));
      const cleanName = (playerCharName.trim() || userName || tpl.label).slice(0, 32);

      const newMini: MiniatureData = {
        id: `mini-${crypto.randomUUID().slice(0, 8)}`,
        name: cleanName,
        format,
        assetId,
        assetName,
        remoteUrl: remoteUrlField,
        x: spawnX,
        z: spawnZ,
        rotationY,
        footprint: 1,
        scaleMultiplier,
        fixZUp,
        showBase,
        baseStyle: 'rune',
        color: playerHeroColor || userColor || '#0ea5e9',
        finish,
        hp: tpl.suggestedHp,
        maxHp: tpl.suggestedHp,
        ownerName: userName,
        ownerUid: firebaseUser?.uid,
        isPropOnly: false,
        sheet: {
          ...cloneSheet(tpl.sheet),
          isMonster: false,
          hiddenFromPlayers: false,
        },
      };

      onCreateMini(newMini);
      onSelectMini(newMini.id);
      onSetToolMode('interact');
      setShowPlayerCreator(false);
      setPlayerCharName('');
      setPlayerCustomFile(null);
      setPlayerTazoFile(null);
      setPlayerTazoUrl('');
      if (playerTazoPreview?.startsWith('blob:')) URL.revokeObjectURL(playerTazoPreview);
      setPlayerTazoPreview(null);
      onOpenSheet(newMini.id);
    } catch (err) {
      setPlayerCreateError(
        err instanceof Error ? err.message : 'Nao foi possivel criar seu personagem.'
      );
    } finally {
      setPlayerCreating(false);
    }
  };

  const handlePlayCustomYouTube = async () => {
    setMusicError(null);
    const vid = extractYouTubeVideoId(ytUrlInput);
    if (!vid) {
      setMusicError('Cole um link valido do YouTube (youtube.com/watch?v=... ou youtu.be/...)');
      return;
    }

    let finalTitle = ytTitleInput.trim();
    if (!finalTitle) {
      setLoadingYtInfo(true);
      try {
        const res = await fetch(apiUrl(`/api/music/info?url=${encodeURIComponent(ytUrlInput.trim())}`));
        if (res.ok) {
          const data = (await res.json()) as { title?: string };
          if (data.title) finalTitle = data.title;
        }
      } catch {
        // fallback below
      } finally {
        setLoadingYtInfo(false);
      }
    }

    const title = (finalTitle || `YouTube (${vid})`).slice(0, 80);
    setCustomTracks((prev) => {
      if (prev.some((t) => t.videoId === vid) || RPG_MUSIC_PRESETS.some((p) => p.videoId === vid)) {
        return prev;
      }
      return [{ videoId: vid, title, mood: 'YouTube', color: '#ef4444' }, ...prev];
    });

    onControlMusic({ action: 'set_and_play', videoId: vid, title, positionSec: 0 });
    setYtUrlInput('');
    setYtTitleInput('');
  };

  const latestRoll: DiceRollEvent | undefined = roomState?.recentRolls?.[0];
  const allMinis = Object.values(roomState?.miniatures || {});
  const controllableMinis =
    role === 'gm'
      ? allMinis
      : allMinis.filter(
          (m) =>
            !m.isPropOnly &&
            m.ownerName !== '__GM__' &&
            (!m.ownerName || m.ownerName.toLowerCase() === userName.toLowerCase())
        );
  const playerOwnChars = allMinis.filter(
    (m) =>
      !m.isPropOnly &&
      !m.sheet?.isMonster &&
      m.ownerName &&
      m.ownerName.toLowerCase() === userName.toLowerCase()
  );
  const canPlayerAddOwnChar = role === 'player' && playerOwnChars.length === 0;

  const rulerDist = localRuler
    ? (() => {
        const startTile = roomState?.tiles[tileKey(Math.round(localRuler.startX), Math.round(localRuler.startZ))];
        const endTile = roomState?.tiles[tileKey(Math.round(localRuler.endX), Math.round(localRuler.endZ))];
        const sElev = startTile && startTile.terrain !== 'void' ? startTile.elevation : 0;
        const eElev = endTile && endTile.terrain !== 'void' ? endTile.elevation : 0;
        return calculateGridDistance(
          localRuler.startX,
          localRuler.startZ,
          localRuler.endX,
          localRuler.endZ,
          measureRule,
          sElev,
          eElev
        );
      })()
    : null;

  const isMyMini = (miniId: string, miniName?: string) => {
    if (role === 'gm') return true;
    const target = roomState?.miniatures[miniId];
    if (target) {
      if (target.isPropOnly || target.sheet?.isMonster) return false;
      if (target.ownerName && target.ownerName.toLowerCase() === userName.toLowerCase()) return true;
      if (!target.ownerName && target.name.toLowerCase() === userName.toLowerCase()) return true;
    }
    if (miniName && miniName.toLowerCase() === userName.toLowerCase()) return true;
    return false;
  };

  const myMini =
    playerOwnChars[0] ||
    allMinis.find(
      (m) =>
        (!m.isPropOnly && !m.sheet?.isMonster && m.name.toLowerCase() === userName.toLowerCase()) ||
        (!m.isPropOnly && m.ownerName && m.ownerName.toLowerCase() === userName.toLowerCase())
    );
  const playerEntry = roomState?.combat?.entries?.find(
    (e) =>
      (myMini && (e.miniId === myMini.id || e.id === myMini.id)) ||
      e.name.toLowerCase() === userName.toLowerCase()
  );
  const playerNeedsRoll = Boolean(playerEntry && !playerEntry.hasRolled);
  const activeCombatEntry =
    roomState?.combat?.entries && roomState.combat.entries[roomState.combat.turnIndex];
  const isMyTurn = Boolean(
    roomState?.combat?.active &&
      activeCombatEntry &&
      ((myMini && (activeCombatEntry.miniId === myMini.id || activeCombatEntry.id === myMini.id)) ||
        activeCombatEntry.name.toLowerCase() === userName.toLowerCase())
  );

  return (
    <>
      <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-2 sm:p-4">
      {/* Top Perimeter Bar - Responsive Single-Line Ergonomic Header */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 px-1">
        {/* Top-Left: Room, Role, Online & Mute + Multi-Map Bar diretamente abaixo com o mesmo design */}
        <div className="flex max-w-full flex-col gap-1 items-start">
          <div className="pointer-events-auto flex max-w-full items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none px-2.5 py-1.5 bg-[#12161e]/95 border border-stone-700/60 rounded-xl shadow-lg">
            <div className="flex items-center gap-1.5 pr-1.5 border-r border-stone-800">
              <img
                src="/logo.png"
                alt="Logo"
                className="w-5 h-5 rounded-full object-cover border border-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.3)] shrink-0"
              />
              <span className="font-display text-xs font-bold text-amber-400 whitespace-nowrap">
                RPG
              </span>
              <span className="text-xs font-mono text-stone-300 font-medium whitespace-nowrap">
                {roomState?.roomId || 'MESA-01'}
              </span>
              <button
                type="button"
                onClick={copyInviteLink}
                title="Copiar link de convite para a mesa"
                className="p-1 hover:bg-[#1b212d] text-stone-400 hover:text-amber-300 rounded transition-colors cursor-pointer"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Role switcher */}
            <button
              type="button"
              onClick={() => onSwitchRole(role === 'gm' ? 'player' : 'gm')}
              title="Alternar visão Mestre / Jogador"
              className="flex items-center gap-1 px-2 py-0.5 text-xs bg-[#1b212d] hover:bg-[#242c3b] text-stone-300 border border-stone-700/70 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              {role === 'gm' ? <Crown className="w-3 h-3 text-amber-400" /> : <Shield className="w-3 h-3 text-sky-400" />}
              <span className="hidden sm:inline">{role === 'gm' ? 'Mestre' : 'Jogador'}</span>
            </button>

            {/* GM Layer Filter (Filtro de Camadas do Mestre) */}
            {role === 'gm' && onSetGmLayer && (
              <div className="flex items-center p-0.5 bg-[#0b0e14] border border-stone-800 rounded-md text-[11px] ml-0.5">
                <span className="text-[10px] text-stone-500 font-medium px-1 hidden md:inline">Camada:</span>
                <button
                  type="button"
                  onClick={() => onSetGmLayer('all')}
                  title="Camada Todas: Seleciona qualquer miniatura ou prop no tabuleiro"
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    gmLayer === 'all'
                      ? 'bg-amber-600 text-stone-950 font-bold'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  Todas ({charCount + propCount})
                </button>
                <button
                  type="button"
                  onClick={() => onSetGmLayer('characters')}
                  title="Camada Personagens: Seleciona APENAS Heróis e Monstros (ignora árvores, muros e móveis)"
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    gmLayer === 'characters'
                      ? 'bg-sky-600 text-white font-bold'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  🧙 Personagens ({charCount})
                </button>
                <button
                  type="button"
                  onClick={() => onSetGmLayer('props')}
                  title="Camada Cenário: Seleciona APENAS Objetos e Props de Cenário (ignora personagens)"
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    gmLayer === 'props'
                      ? 'bg-emerald-600 text-stone-950 font-bold'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  🏰 Cenário ({propCount})
                </button>
              </div>
            )}

            {/* Online count */}
            <span className="flex items-center gap-1 text-[11px] font-mono text-stone-400 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{connected ? `${roomState?.users.length || 1}` : '...'}</span>
            </span>

            {/* Sound FX Mute */}
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Ativar som dos efeitos' : 'Silenciar som dos efeitos'}
              className="p-1 text-stone-400 hover:text-amber-400 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>

            {/* GM Ask Initiative button */}
            {role === 'gm' && !roomState?.combat?.active && (
              <button
                type="button"
                onClick={onStartCombat}
                title="Pedir iniciativa para todos os combatentes"
                className="flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 text-stone-950 rounded-md shadow border border-amber-400/50 transition-all cursor-pointer whitespace-nowrap animate-pulse ml-0.5"
              >
                <Swords className="w-3 h-3" />
                <span className="hidden md:inline">Iniciativa</span>
              </button>
            )}
          </div>

          {/* Multi-Map Scene Selector Bar - Diretamente abaixo com o mesmo design do logo */}
          <div className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 bg-[#12161e]/95 border border-stone-700/60 rounded-xl shadow-lg text-xs overflow-x-auto max-w-full">
            <div className="flex items-center gap-1.5 pr-1.5 border-r border-stone-800 text-xs font-semibold text-amber-400 shrink-0">
              <Map className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Mapas:</span>
            </div>

            {/* Scene Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
              {scenes &&
                Object.values(scenes).map((scene) => {
                  const isCurrentView = (activeSceneId || 'scene-default') === scene.id;
                  const sceneUsers = (roomState?.users || []).filter((u) => {
                    if (u.currentSceneId === scene.id) return true;
                    const userMini = Object.values(roomState?.miniatures || {}).find(
                      (m) =>
                        (m.sceneId || 'scene-default') === scene.id &&
                        m.ownerName &&
                        m.ownerName.toLowerCase() === u.name.toLowerCase()
                    );
                    return Boolean(userMini);
                  });

                  if (role === 'player') {
                    if (!isCurrentView) return null;
                    return (
                      <div
                        key={scene.id}
                        className="flex items-center gap-1.5 px-2 py-0.5 text-xs bg-amber-500/20 border border-amber-500/60 rounded-md text-amber-300 font-semibold"
                      >
                        <MapPin className="w-3 h-3 text-amber-400" />
                        <span>{scene.name}</span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={scene.id}
                      className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border transition-all cursor-pointer shrink-0 ${
                        isCurrentView
                          ? 'bg-amber-600 text-stone-950 font-bold border-amber-500 shadow-sm'
                          : 'bg-[#1b212d] border-stone-700/70 text-stone-300 hover:text-stone-100 hover:bg-[#242c3b]'
                      }`}
                      onClick={() => onSelectScene?.(scene.id)}
                      title={`Alternar visão do Mestre para "${scene.name}"`}
                    >
                      <span>{scene.name}</span>
                      {sceneUsers.length > 0 && (
                        <span
                          className={`flex items-center gap-0.5 text-[10px] px-1 py-0.2 rounded-full font-mono ${
                            isCurrentView
                              ? 'bg-stone-950 text-amber-300'
                              : 'bg-stone-900 text-sky-300 border border-stone-700'
                          }`}
                          title={`Jogadores aqui: ${sceneUsers.map((u) => u.name).join(', ')}`}
                        >
                          <Users className="w-2.5 h-2.5" />
                          <span>{sceneUsers.length}</span>
                        </span>
                      )}
                      {Object.keys(scenes).length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Deseja realmente remover o mapa "${scene.name}" da mesa?`)) {
                              onDeleteScene?.(scene.id);
                            }
                          }}
                          title="Excluir este mapa da mesa"
                          className={`ml-0.5 p-0.5 transition-colors cursor-pointer rounded ${
                            isCurrentView
                              ? 'text-stone-950 hover:text-rose-950'
                              : 'text-stone-500 hover:text-rose-400'
                          }`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* GM Map Actions: Add New Map & Gather All Players */}
            {role === 'gm' && (
              <div className="flex items-center gap-1 pl-1.5 border-l border-stone-800 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setNewMapName('');
                    setShowAddMapModal(true);
                  }}
                  title="Adicionar um novo mapa/cenário à mesa"
                  className="flex items-center gap-1 px-2 py-0.5 text-xs bg-[#1b212d] hover:bg-[#242c3b] text-amber-300 border border-stone-700/70 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" />
                  <span>Novo</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Deseja reunir todos os heróis no mapa atual?')) {
                      onGatherAllToScene?.(activeSceneId || 'scene-default');
                    }
                  }}
                  title="Teletransportar todos os personagens para este mapa agora"
                  className="flex items-center gap-1 px-2 py-0.5 text-xs bg-[#1b212d] hover:bg-[#242c3b] text-sky-300 border border-stone-700/70 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Users className="w-3 h-3" />
                  <span className="hidden md:inline">Reunir</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Top-Center: Compact Synchronized YouTube Player */}
        <YouTubeSyncPlayer
          music={roomState?.music || null}
          role={role}
          onControlMusic={onControlMusic}
          onOpenMusicTab={() => {
            setDockCollapsed(false);
            setGmTab('music');
          }}
        />

        {/* Top-Right: Camera Presets & Compact Smart Dice Roller */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
          {/* Segmented Camera Presets */}
          <div className="flex items-center p-0.5 bg-[#12161e]/95 border border-stone-700/60 rounded-xl shadow-sm text-xs">
            <button
              type="button"
              onClick={() => onCameraPreset('iso')}
              title="Visão Isométrica clássica"
              className="px-2 py-1 text-stone-300 hover:text-white hover:bg-[#1f2633] rounded-lg transition-colors cursor-pointer"
            >
              Iso
            </button>
            <button
              type="button"
              onClick={() => onCameraPreset('top')}
              title="Visão Superior do Topo (Eixo Fixo)"
              className="px-2 py-1 text-stone-300 hover:text-white hover:bg-[#1f2633] rounded-lg transition-colors cursor-pointer"
            >
              Topo
            </button>
            <button
              type="button"
              onClick={() => onCameraPreset('dramatic')}
              title="Visão Imersiva em 3D"
              className="px-2 py-1 text-stone-300 hover:text-white hover:bg-[#1f2633] rounded-lg transition-colors cursor-pointer"
            >
              3D
            </button>
          </div>

          {/* Compact Smart Dice Roller */}
          <div className="relative flex items-center">
            <div className="flex items-center p-0.5 bg-[#12161e]/95 border border-stone-700/60 rounded-xl shadow-sm">
              <button
                type="button"
                onClick={() => onRollDice(20, diceModifier)}
                title={`Rolar d20 ${diceModifier !== 0 ? (diceModifier > 0 ? `+${diceModifier}` : `${diceModifier}`) : ''}`}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold font-mono text-stone-200 hover:text-amber-300 hover:bg-[#1c2230] rounded-lg transition-colors cursor-pointer"
              >
                <Dices className="w-3.5 h-3.5 text-amber-400" />
                <span>d20{diceModifier !== 0 ? (diceModifier > 0 ? `+${diceModifier}` : diceModifier) : ''}</span>
              </button>

              <button
                type="button"
                onClick={() => setDicePaletteOpen(!dicePaletteOpen)}
                title="Abrir painel com outros dados (d4..d100) e modificadores"
                className={`p-1 text-stone-400 hover:text-stone-200 hover:bg-[#1c2230] rounded-lg transition-colors cursor-pointer border-l border-stone-800 ${
                  dicePaletteOpen ? 'bg-[#1c2230] text-amber-400' : ''
                }`}
              >
                <ChevronDown className="w-3 h-3" />
              </button>

              {/* Latest Roll Pill (Clickable) */}
              {latestRoll && (
                <button
                  type="button"
                  onClick={() => setShowDiceLog((prev) => !prev)}
                  className={`ml-1 px-2 py-0.5 text-xs font-mono font-bold rounded-lg border transition-all cursor-pointer ${
                    latestRoll.total === 20 && latestRoll.die === 20
                      ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                      : latestRoll.total === 1 && latestRoll.die === 20
                      ? 'bg-rose-950/80 border-rose-500/80 text-rose-300'
                      : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                  }`}
                  title={`${latestRoll.userName} rolou d${latestRoll.die}${latestRoll.modifier !== 0 ? (latestRoll.modifier > 0 ? `+${latestRoll.modifier}` : latestRoll.modifier) : ''} = ${latestRoll.total}. Clique para ver o histórico.`}
                >
                  <span className="text-[10px] text-stone-400 font-normal mr-1">{latestRoll.userName.slice(0, 8)}:</span>
                  <span>{latestRoll.total}</span>
                </button>
              )}

              {/* Botão de Histórico de Rolagens */}
              <button
                type="button"
                onClick={() => setShowDiceLog((prev) => !prev)}
                title="Histórico de rolagens de dados"
                className={`ml-1 flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors cursor-pointer border ${
                  showDiceLog
                    ? 'bg-amber-500/30 border-amber-400 text-amber-300 font-bold'
                    : 'bg-[#161c28] border-stone-800 text-stone-400 hover:text-stone-200 hover:bg-stone-800'
                }`}
              >
                <ScrollText className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Log</span>
                <span className="font-mono text-[10px] text-stone-400">({roomState?.recentRolls?.length || 0})</span>
              </button>
            </div>

            {/* Floating Dice Palette Dropdown */}
            {dicePaletteOpen && (
              <div className="absolute top-full right-0 mt-1.5 p-2.5 bg-[#0e121a]/98 backdrop-blur-md border border-stone-700/80 rounded-2xl shadow-2xl z-50 w-64 text-stone-200 animate-fade-in">
                <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-stone-800 text-xs font-semibold text-stone-300">
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <Dices className="w-3.5 h-3.5" />
                    <span>Rolar Dados</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setDicePaletteOpen(false)}
                    className="text-stone-500 hover:text-stone-200 text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Dice Grid */}
                <div className="grid grid-cols-4 gap-1.5 mb-2.5">
                  {[4, 6, 8, 10, 12, 20, 100].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        onRollDice(d, diceModifier);
                        setDicePaletteOpen(false);
                      }}
                      className="py-1.5 px-1.5 text-xs font-mono font-bold bg-[#161c28] hover:bg-amber-500 hover:text-stone-950 border border-stone-700/60 rounded-lg transition-all cursor-pointer text-center"
                    >
                      d{d}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      onRollDice(20, diceModifier);
                      setDicePaletteOpen(false);
                    }}
                    className="py-1.5 px-1.5 text-xs font-mono font-bold bg-amber-600/80 hover:bg-amber-500 text-stone-950 rounded-lg transition-all cursor-pointer text-center shadow-sm"
                  >
                    d20★
                  </button>
                </div>

                {/* Quick Modifiers */}
                <div className="flex items-center justify-between gap-1 text-[11px] pt-1.5 border-t border-stone-800">
                  <span className="text-stone-400">Modif:</span>
                  <div className="flex items-center gap-1">
                    {[-2, -1, 0, 1, 2, 3, 5].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDiceModifier(m)}
                        className={`w-6 h-6 rounded flex items-center justify-center font-mono text-[10px] cursor-pointer transition-colors ${
                          diceModifier === m
                            ? 'bg-amber-500 text-stone-950 font-bold'
                            : 'bg-[#161c28] text-stone-300 hover:bg-stone-700'
                        }`}
                      >
                        {m > 0 ? `+${m}` : m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal / Painel Flutuante do Histórico de Rolagens */}
      {showDiceLog && (
        <div className="fixed top-14 right-4 w-88 max-w-[calc(100vw-2rem)] max-h-[75vh] bg-[#0e121a]/98 backdrop-blur-md border border-stone-700/80 rounded-2xl shadow-2xl z-50 flex flex-col pointer-events-auto animate-fade-in text-stone-200">
          {/* Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-stone-800">
            <div className="flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-amber-400" />
              <span className="font-display text-xs font-bold text-stone-200">
                Histórico de Rolagens
              </span>
              <span className="font-mono text-[11px] text-stone-400 px-1.5 py-0.5 bg-[#161c28] rounded border border-stone-800">
                {roomState?.recentRolls?.length || 0}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowDiceLog(false)}
              className="p-1 text-stone-400 hover:text-stone-200 hover:bg-[#1a2230] rounded-lg transition-colors cursor-pointer text-xs"
              title="Fechar histórico"
            >
              ✕
            </button>
          </div>

          {/* Roll List */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 scrollbar-thin">
            {!roomState?.recentRolls || roomState.recentRolls.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-500">
                <Dices className="w-6 h-6 mx-auto mb-2 text-stone-600 opacity-60" />
                <p>Nenhuma rolagem feita ainda nesta sessão.</p>
                <p className="text-[11px] text-stone-600 mt-1">Use o botão de d20 no topo ou na ficha.</p>
              </div>
            ) : (
              roomState.recentRolls.map((r, i) => {
                const isCritSuccess = r.die === 20 && r.result === 20;
                const isCritFail = r.die === 20 && r.result === 1;
                const timeStr = r.timestamp
                  ? new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : '';
                return (
                  <div
                    key={r.id || `${r.timestamp}-${i}`}
                    className={`flex items-center justify-between p-2 rounded-xl border transition-colors ${
                      isCritSuccess
                        ? 'bg-emerald-950/40 border-emerald-500/60 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                        : isCritFail
                        ? 'bg-rose-950/40 border-rose-500/60 shadow-[0_0_10px_rgba(244,63,94,0.15)]'
                        : 'bg-[#141923]/90 border-stone-800 hover:border-stone-700'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: r.color || '#f59e0b' }}
                        />
                        <span className="text-xs font-semibold text-stone-200 truncate">
                          {r.userName}
                        </span>
                        {timeStr && (
                          <span className="text-[10px] font-mono text-stone-500 shrink-0">
                            {timeStr}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-stone-400 font-mono mt-0.5 flex items-center gap-1">
                        <span>d{r.die}</span>
                        {r.modifier !== 0 && (
                          <span className={r.modifier > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {r.modifier > 0 ? `+${r.modifier}` : r.modifier}
                          </span>
                        )}
                        <span className="text-stone-600">·</span>
                        <span className="text-stone-400">base [{r.result}]</span>
                        {isCritSuccess && (
                          <span className="text-[10px] font-bold text-emerald-400 px-1 py-0.5 bg-emerald-950/80 rounded border border-emerald-500/40 ml-1">
                            CRÍTICO! 🎯
                          </span>
                        )}
                        {isCritFail && (
                          <span className="text-[10px] font-bold text-rose-400 px-1 py-0.5 bg-rose-950/80 rounded border border-rose-500/40 ml-1">
                            FALHA! 💀
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center">
                      <span
                        className={`text-base font-mono font-bold px-2 py-0.5 rounded-lg border ${
                          isCritSuccess
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                            : isCritFail
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                            : 'bg-stone-900 text-amber-300 border-stone-700'
                        }`}
                      >
                        {r.total}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Combat & Initiative Tracker Bar */}
      {roomState?.combat?.active && (
        <div className="pointer-events-auto mx-auto mt-2 w-full max-w-4xl bg-[#12161e]/95 backdrop-blur-md border border-amber-500/50 rounded-2xl shadow-2xl p-2.5 px-4 text-stone-100 flex flex-col gap-2 transition-all">
          {/* Top Line of Tracker: Round, Active Combatant, Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 font-bold text-xs uppercase tracking-wider rounded-md shadow-sm">
                <Swords className="w-3.5 h-3.5" />
                <span>Rodada {roomState.combat.round || 1}</span>
              </span>

              {/* Active combatant announcement */}
              {activeCombatEntry ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-stone-400">Vez de:</span>
                  <span className="font-display font-bold text-amber-300 text-sm flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    {activeCombatEntry.name}
                  </span>
                  {typeof activeCombatEntry.hp === 'number' && typeof activeCombatEntry.maxHp === 'number' && (
                    <span className="text-[11px] font-mono text-stone-400">
                      ({activeCombatEntry.hp}/{activeCombatEntry.maxHp} PV)
                    </span>
                  )}
                </div>
              ) : null}
            </div>

            {/* Actions for GM and Players */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Player roll initiative prompt: can roll for ALL unrolled characters they own */}
              {role === 'player' &&
                roomState.combat.entries
                  ?.filter((e) => !e.hasRolled && isMyMini(e.miniId, e.name))
                  .map((unrolledEntry) => (
                    <button
                      key={unrolledEntry.id || unrolledEntry.miniId}
                      type="button"
                      onClick={() => onRollInitiative(unrolledEntry.miniId)}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-lg shadow-lg border border-emerald-400/40 animate-bounce cursor-pointer"
                    >
                      <Dices className="w-3.5 h-3.5" />
                      <span>Rolar {unrolledEntry.name} ({unrolledEntry.bonus >= 0 ? `+${unrolledEntry.bonus}` : unrolledEntry.bonus})</span>
                    </button>
                  ))}

              {/* Player end my turn button */}
              {isMyTurn && (
                <button
                  type="button"
                  onClick={onNextTurn}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-stone-950 rounded-lg shadow-lg border border-amber-300 animate-pulse cursor-pointer"
                >
                  <span>Passar Minha Vez</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}

              {/* GM Controls */}
              {role === 'gm' && (
                <>
                  {onRollMonstersInitiative && (
                    <button
                      type="button"
                      onClick={onRollMonstersInitiative}
                      title="Rolar iniciativa apenas para os Monstros e NPCs (deixa os heróis rolarem pelos jogadores)"
                      className="flex items-center gap-1 px-2.5 py-1 text-xs bg-[#1f2633] hover:bg-[#2b3547] text-rose-300 border border-rose-500/40 rounded-lg transition-colors cursor-pointer"
                    >
                      <Skull className="w-3.5 h-3.5 text-rose-400" />
                      <span className="hidden sm:inline">Rolar Monstros</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onRollAllInitiative}
                    title="Rolar iniciativa para todos os combatentes de uma vez"
                    className="flex items-center gap-1 px-2.5 py-1 text-xs bg-[#1f2633] hover:bg-[#2b3547] text-amber-300 border border-amber-500/30 rounded-lg transition-colors cursor-pointer"
                  >
                    <Dices className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Rolar Todos</span>
                  </button>

                  <button
                    type="button"
                    onClick={onPrevTurn}
                    title="Voltar para o turno anterior"
                    className="p-1 px-2 text-xs bg-[#1f2633] hover:bg-[#2b3547] text-stone-300 border border-stone-700 rounded-lg transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={onNextTurn}
                    title="Avançar para o próximo combatente (destaca miniatura com feixe de luz)"
                    className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 rounded-lg shadow-md border border-amber-400 cursor-pointer transition-all"
                  >
                    <span>Próximo</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={onEndCombat}
                    title="Encerrar combate"
                    className="p-1 px-2 text-xs bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/50 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Bottom Line: Horizontal Queue of Combatant Badges */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
            {roomState.combat.entries?.map((entry, idx) => {
              const isActive = idx === roomState.combat!.turnIndex;
              return (
                <div
                  key={entry.id || entry.miniId}
                  onClick={() => {
                    onSelectMini(entry.miniId);
                    if (role === 'gm') onSetTurn(idx);
                  }}
                  title={`Clique para focar na miniatura de ${entry.name}${role === 'gm' ? ' (mudar turno)' : ''}`}
                  className={`flex-shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer ${
                    isActive
                      ? 'bg-amber-500/20 border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.45)] ring-2 ring-amber-400/80 scale-105'
                      : 'bg-[#181d27]/90 border-stone-800 hover:border-stone-600 opacity-80 hover:opacity-100'
                  }`}
                >
                  {/* Order Index */}
                  <span className="text-[10px] font-mono-tabular text-stone-400">
                    {idx + 1}º
                  </span>

                  {/* Initiative Score */}
                  <span
                    className={`font-mono font-bold text-xs px-1.5 py-0.5 rounded ${
                      entry.hasRolled
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-stone-800 text-stone-400 border border-stone-700'
                    }`}
                  >
                    {entry.hasRolled ? entry.initiative : '?'}
                  </span>

                  {/* Icon / Monster vs Hero */}
                  {entry.isMonster ? (
                    <Skull className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  ) : (
                    <Shield className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                  )}

                  {/* Name & HP */}
                  <div className="flex flex-col min-w-[70px]">
                    <span className="text-xs font-semibold text-stone-200 truncate max-w-[100px]">
                      {entry.name}
                    </span>
                    {typeof entry.hp === 'number' && typeof entry.maxHp === 'number' && (
                      <div className="w-full bg-stone-800 h-1.5 rounded-full overflow-hidden mt-0.5 border border-stone-700/50">
                        <div
                          className={`h-full transition-all ${
                            entry.hp / entry.maxHp > 0.5
                              ? 'bg-emerald-500'
                              : entry.hp / entry.maxHp > 0.25
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                          }`}
                          style={{
                            width: `${Math.max(0, Math.min(100, (entry.hp / entry.maxHp) * 100))}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Roll individual button: GM can roll for anyone unrolled, Player can roll ONLY for their own unrolled character */}
                  {!entry.hasRolled && (
                    (() => {
                      const canRollThis = role === 'gm' || isMyMini(entry.miniId, entry.name);
                      if (canRollThis) {
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRollInitiative(entry.miniId);
                            }}
                            title={
                              role === 'gm'
                                ? `Rolar iniciativa de ${entry.name}`
                                : `Rolar a iniciativa do seu personagem (${entry.bonus >= 0 ? `+${entry.bonus}` : entry.bonus})`
                            }
                            className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/20 hover:bg-amber-500/40 border border-amber-400/50 text-amber-300 rounded text-[11px] font-semibold transition-all cursor-pointer animate-pulse"
                          >
                            <Dices className="w-3 h-3 text-amber-400" />
                            <span>Rolar</span>
                          </button>
                        );
                      } else {
                        return (
                          <span
                            title="Apenas o dono deste personagem ou o Mestre pode rolar esta iniciativa"
                            className="p-1 text-stone-600 cursor-not-allowed"
                          >
                            <Lock className="w-3 h-3" />
                          </span>
                        );
                      }
                    })()
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transient Error / Hover & Ruler Distance Readout */}
      <div className="flex flex-col items-center gap-2 pointer-events-none">
        {errorToast && (
          <div className="px-4 py-2 bg-rose-950/95 border border-rose-500/60 text-rose-200 text-xs rounded-lg shadow-lg">
            {errorToast}
          </div>
        )}
        {rulerDist && (
          <div className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-1.5 bg-[#12161e]/95 border border-cyan-500/60 text-cyan-200 text-xs font-mono-tabular rounded-lg shadow-lg">
            <Ruler className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>
              <strong>{rulerDist.feet} ft</strong> · {rulerDist.cells}{' '}
              {rulerDist.cells === 1 ? 'casa' : 'casas'} · {rulerDist.meters} m
              {rulerDist.elevationDiffFeet > 0 && (
                <span className="text-amber-300"> · Δ{rulerDist.elevationDiffFeet} ft alt</span>
              )}
            </span>
            <span className="text-stone-400 text-[11px] hidden sm:inline">
              ({rulerDist.ruleLabel})
            </span>
            <button
              type="button"
              onClick={onClearRuler}
              className="ml-1 px-1.5 py-0.5 text-[11px] bg-[#1a2230] hover:bg-stone-700 border border-stone-600 rounded text-stone-200 cursor-pointer"
            >
              Limpar
            </button>
          </div>
        )}
        {hoverInfo && hoverInfo.distanceCells !== null && hoverInfo.distanceCells > 0 && (
          <div className="px-3.5 py-1.5 bg-[#12161e]/95 border border-sky-500/50 text-sky-300 text-xs font-mono-tabular rounded-lg shadow-md">
            Movimento: {hoverInfo.distanceCells} {hoverInfo.distanceCells === 1 ? 'casa' : 'casas'} ·{' '}
            {(hoverInfo.distanceCells * 1.5).toFixed(1)} m ({hoverInfo.distanceCells * 5} ft)
          </div>
        )}
      </div>

      {/* Collapsible Unified Bottom Control Dock */}
      <div className="flex flex-col items-center w-full pointer-events-none">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="pointer-events-auto mb-1.5 flex items-center gap-1.5 px-3 py-1 bg-[#12161e]/95 border border-stone-700/70 rounded-t-lg text-xs text-stone-300 hover:text-amber-400 transition-colors cursor-pointer"
        >
          {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{dockCollapsed ? 'Mostrar Painel (H)' : 'Ocultar Painel (H)'}</span>
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto min-h-0 w-full max-w-[1000px] max-h-[45dvh] overflow-y-auto bg-[#12161e]/95 border border-stone-700/70 rounded-xl shadow-2xl p-2 sm:p-3 lg:max-h-[50dvh]">
            {role === 'gm' ? (
              <div>
                {/* GM Top Mode & Tab Strip */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-stone-800">
                  <div className="flex items-center gap-1 p-0.5 bg-[#0b0e14] rounded-lg border border-stone-800">
                    <button
                      type="button"
                      onClick={() => onSetToolMode('interact')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        toolMode === 'interact'
                          ? 'bg-amber-600 text-stone-950'
                          : 'text-stone-300 hover:text-white'
                      }`}
                    >
                      <MousePointer className="w-3.5 h-3.5" />
                      <span>Mover Miniaturas</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSetToolMode('sculpt');
                        setGmTab('map');
                        onCameraPreset('top');
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        toolMode === 'sculpt'
                          ? 'bg-emerald-600 text-stone-950'
                          : 'text-stone-300 hover:text-white'
                      }`}
                    >
                      <Hammer className="w-3.5 h-3.5" />
                      <span>Esculpir Mapa</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSetToolMode('annotate');
                        onSelectAnnotation(null);
                        setGmTab('annotations');
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        toolMode === 'annotate'
                          ? 'bg-purple-500 text-stone-950'
                          : 'text-stone-300 hover:text-white'
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Marcadores 3D</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetToolMode(toolMode === 'measure' ? 'interact' : 'measure')}
                      title="Medir distancia na grade (Atalho: M)"
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        toolMode === 'measure'
                          ? 'bg-cyan-500 text-stone-950'
                          : 'text-stone-300 hover:text-white'
                      }`}
                    >
                      <Ruler className="w-3.5 h-3.5" />
                      <span>Regua (M)</span>
                    </button>

                    <span className="h-4 w-px bg-stone-800 mx-0.5" aria-hidden="true" />

                    <button
                      type="button"
                      disabled={!canUndo}
                      onClick={onUndo}
                      title={undoLabel ? `Desfazer: ${undoLabel} (Ctrl+Z)` : 'Desfazer edicao do mapa (Ctrl+Z)'}
                      aria-label="Desfazer (Ctrl+Z)"
                      className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md text-stone-200 hover:bg-[#1d2432] disabled:opacity-35 disabled:pointer-events-none transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Undo2 className="w-3.5 h-3.5 text-amber-300" />
                      <span className="hidden md:inline text-[11px] font-mono-tabular">Ctrl+Z</span>
                    </button>
                    <button
                      type="button"
                      disabled={!canRedo}
                      onClick={onRedo}
                      title={redoLabel ? `Refazer: ${redoLabel} (Ctrl+Y)` : 'Refazer edicao do mapa (Ctrl+Y)'}
                      aria-label="Refazer (Ctrl+Y)"
                      className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md text-stone-200 hover:bg-[#1d2432] disabled:opacity-35 disabled:pointer-events-none transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Redo2 className="w-3.5 h-3.5 text-sky-300" />
                      <span className="hidden md:inline text-[11px] font-mono-tabular">Ctrl+Y</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1 overflow-x-auto">
                    {[
                      { id: 'map', label: 'Mapa & Terreno' },
                      { id: 'minis', label: 'Objetos 3D & Herois' },
                      { id: 'sheets', label: 'Fichas & Monstros' },
                      { id: 'scale', label: selectedMini ? `Dimensionar: ${selectedMini.name}` : 'Dimensionar' },
                      { id: 'annotations', label: 'Marcadores & Formas' },
                      { id: 'music', label: 'Musica (YouTube)' },
                      { id: 'players', label: 'Mesa & Jogadores' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setGmTab(tab.id as typeof gmTab)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                          gmTab === tab.id
                            ? 'bg-[#222938] text-amber-300 border border-amber-500/40'
                            : 'text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Active Measurement Rules Bar for GM */}
                {toolMode === 'measure' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-cyan-500/30">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-cyan-300 mr-1">
                        Regra da Regua:
                      </span>
                      {MEASURE_RULES.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          title={r.shortDesc}
                          onClick={() => onSetMeasureRule(r.id)}
                          className={`px-2.5 py-1 text-xs rounded-lg border transition-colors cursor-pointer ${
                            measureRule === r.id
                              ? 'bg-cyan-950/70 border-cyan-400 text-cyan-200 font-medium'
                              : 'bg-[#181d27] border-stone-700 text-stone-300 hover:border-stone-500'
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSetMeasureSnap(!measureSnap)}
                        title="Alternar encaixe na grade 1x1 (ou segure Shift)"
                        className={`px-2.5 py-1 text-xs rounded-lg border cursor-pointer ${
                          measureSnap
                            ? 'bg-cyan-950/60 border-cyan-500/60 text-cyan-200'
                            : 'bg-[#181d27] border-stone-700 text-stone-300'
                        }`}
                      >
                        {measureSnap ? 'Encaixe: Grade 1x1' : 'Encaixe: Livre'}
                      </button>

                      <button
                        type="button"
                        onClick={() => onSetMeasureShare(!measureShare)}
                        title="Mostrar sua linha de medicao para todos na sala"
                        className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border cursor-pointer ${
                          measureShare
                            ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
                            : 'bg-[#181d27] border-stone-700 text-stone-400'
                        }`}
                      >
                        {measureShare ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        <span>{measureShare ? 'Visivel na Mesa' : 'Apenas Voce'}</span>
                      </button>

                      {localRuler && (
                        <button
                          type="button"
                          onClick={onClearRuler}
                          className="px-2.5 py-1 text-xs bg-[#181d27] hover:bg-stone-700 border border-stone-600 rounded-lg text-stone-200 cursor-pointer"
                        >
                          Limpar (Esc)
                        </button>
                      )}

                      <span className="text-[11px] text-stone-400">
                        Clique e arraste no tabuleiro 3D
                      </span>
                    </div>
                  </div>
                )}

                {/* GM Tab: Map & Terrain Sculpting */}
                {gmTab === 'map' && (
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {TERRAINS.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            onSetToolMode('sculpt');
                            onSetSculptBrush({ ...sculptBrush, terrain: t.id, erase: false });
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer ${
                            !sculptBrush.erase && sculptBrush.terrain === t.id
                              ? 'border-emerald-500 bg-emerald-950/50 text-emerald-200'
                              : 'border-stone-700/70 bg-[#181d27] text-stone-300 hover:border-stone-500'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: t.swatch }}
                          />
                          <span>{t.label}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          onSetToolMode('sculpt');
                          onSetSculptBrush({ ...sculptBrush, erase: !sculptBrush.erase });
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer ${
                          sculptBrush.erase
                            ? 'border-rose-500 bg-rose-950/60 text-rose-200'
                            : 'border-stone-700/70 bg-[#181d27] text-stone-300 hover:border-stone-500'
                        }`}
                      >
                        <Eraser className="w-3.5 h-3.5" />
                        <span>Apagar</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-700/70 bg-[#181d27] px-2 py-1">
                        <span className="text-xs font-medium text-amber-300">Tamanho do tabuleiro</span>
                        <label className="flex items-center gap-1 text-[11px] text-stone-400">
                          Colunas
                          <input
                            type="number"
                            min={4}
                            max={64}
                            value={boardCols}
                            onChange={(e) => setBoardCols(e.target.value)}
                            className="w-14 rounded border border-stone-700 bg-[#0b0e14] px-1.5 py-1 text-center text-stone-100"
                            aria-label="Quantidade de colunas do tabuleiro"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-[11px] text-stone-400">
                          Linhas
                          <input
                            type="number"
                            min={4}
                            max={64}
                            value={boardRows}
                            onChange={(e) => setBoardRows(e.target.value)}
                            className="w-14 rounded border border-stone-700 bg-[#0b0e14] px-1.5 py-1 text-center text-stone-100"
                            aria-label="Quantidade de linhas do tabuleiro"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => onResizeBoard(Number(boardCols), Number(boardRows))}
                          className="rounded bg-amber-600 px-2 py-1 text-[11px] font-semibold text-stone-950 transition-colors hover:bg-amber-500"
                        >
                          Aplicar
                        </button>
                      </div>

                      <div className="flex items-center gap-1 bg-[#181d27] border border-stone-700/70 rounded-lg px-2 py-1">
                        <span className="text-xs text-stone-400">Altura:</span>
                        {[0, 1, 2, 3, 4].map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => {
                              onSetToolMode('sculpt');
                              onSetSculptBrush({ ...sculptBrush, elevation: lvl, erase: false });
                            }}
                            className={`w-6 h-6 text-xs font-mono-tabular rounded transition-colors cursor-pointer ${
                              sculptBrush.elevation === lvl
                                ? 'bg-emerald-600 text-stone-950 font-semibold'
                                : 'text-stone-300 hover:bg-stone-700'
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setGmTab('minis');
                          setAssetSourceView('catalog');
                          onSetToolMode('interact');
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-[#181d27] hover:bg-[#222938] border border-stone-700/70 rounded-lg text-sky-300 cursor-pointer"
                      >
                        <Box className="w-3.5 h-3.5" />
                        <span>Objetos 3D (Skyrim / TaleSpire)</span>
                      </button>

                      <select
                        value={roomState?.presetName || 'blank'}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val.startsWith('saved:')) {
                            onLoadScenario?.(val.slice(6));
                          } else {
                            onChangePreset(val as MapPresetId);
                          }
                        }}
                        className="px-2.5 py-1.5 text-xs bg-[#181d27] border border-stone-700/70 rounded-lg text-amber-300 focus:outline-none"
                      >
                        {savedScenarios.length > 0 && (
                          <optgroup label="── Meus Cenários Salvos ──">
                            {savedScenarios.map((sc) => (
                              <option key={sc.id} value={`saved:${sc.id}`}>
                                🗺️ {sc.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="── Mapas Padrão ──">
                          <option value="blank">Mapa: Tabuleiro Limpo (Padrão)</option>
                          <option value="crypt">Mapa: Cripta Nórdica (Skyrim)</option>
                          <option value="tavern">Mapa: Taverna de Whiterun</option>
                          <option value="arena">Mapa: Pico dos Dragões</option>
                        </optgroup>
                      </select>

                      <button
                        type="button"
                        onClick={() => {
                          setNewScenarioName(
                            `Cenário ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                          );
                          setNewScenarioDesc('');
                          setShowSaveScenarioModal(true);
                        }}
                        title="Salvar este mapa completo (elevação, pisos, props 3D, música)"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-stone-950 font-semibold rounded-lg shadow cursor-pointer transition-colors"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Salvar Cenário</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowScenarioManagerModal(true)}
                        title="Gerenciar cenários salvos, importar e exportar JSON"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-[#181d27] hover:bg-[#222938] border border-stone-700/70 rounded-lg text-amber-300 cursor-pointer"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                        <span>Cenários ({savedScenarios.length})</span>
                      </button>

                      {charCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Deseja remover todos os personagens e monstros do tabuleiro, mantendo todo o cenário e construções 3D?')) {
                              onClearCharacters?.();
                              showToast('Tabuleiro limpo: todos os personagens foram removidos!');
                            }
                          }}
                          title="Remover todos os personagens e monstros do tabuleiro, mantendo cenário e props intactos"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 rounded-lg text-rose-300 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Limpar Personagens ({charCount})</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* GM Tab: Skyrim / TaleSpire Curated Online 3D Models + File/URL Importer */}
                {gmTab === 'minis' && (
                  <div className="space-y-2.5">
                    {/* Sub-mode switcher: Curated Online 3D Catalog vs Custom File/URL */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1 p-0.5 bg-[#0b0e14] border border-stone-800 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setAssetSourceView('catalog')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md cursor-pointer ${
                            assetSourceView === 'catalog'
                              ? 'bg-amber-600 text-stone-950 font-semibold'
                              : 'text-stone-300 hover:text-white'
                          }`}
                        >
                          <Globe className="w-3.5 h-3.5" />
                          <span>Acervo Skyrim & TaleSpire (.GLB / .STL)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAssetSourceView('import')}
                          className={`px-2.5 py-1 text-xs rounded-md cursor-pointer ${
                            assetSourceView === 'import'
                              ? 'bg-[#222938] text-amber-300 font-medium'
                              : 'text-stone-400 hover:text-stone-200'
                          }`}
                        >
                          Importar Arquivo / URL
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          ref={imageInputRef}
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              setAssetSourceView('import');
                              handleFileChosen(f);
                            }
                            e.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => imageInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-stone-950 rounded-lg transition-colors cursor-pointer"
                        >
                          <Disc className="w-3.5 h-3.5" />
                          <span>+ Tazo (Imagem)</span>
                        </button>

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".stl,.obj,.glb,.gltf,.png,.jpg,.jpeg,.webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              setAssetSourceView('import');
                              handleFileChosen(f);
                            }
                            e.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-lg transition-colors cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Enviar .STL / .OBJ / .GLB</span>
                        </button>
                      </div>
                    </div>

                    {/* View 1: Curated 3D Models with Live Turntable Preview before Spawn / Apply */}
                    {assetSourceView === 'catalog' && (() => {
                      const filteredCatalog = CURATED_3D_CATALOG.filter((c) => {
                        if (catalogFilter === 'all') return true;
                        if (catalogFilter === 'scenery') return Boolean(c.isPropOnly);
                        return c.category === catalogFilter;
                      });
                      const previewItem =
                        CATALOG_BY_ID[previewCatalogId] ||
                        filteredCatalog[0] ||
                        CURATED_3D_CATALOG[0];

                      return (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1 p-0.5 bg-[#0b0e14] border border-stone-800 rounded-lg">
                              {[
                                { id: 'all', label: `Todos (${CURATED_3D_CATALOG.length})` },
                                { id: 'scenery', label: '🏰 Cenário & Props (40+)' },
                                { id: 'character', label: 'Herois (.STL Xadrez)' },
                                { id: 'monster', label: 'Monstros (.STL Xadrez)' },
                                { id: 'dungeon', label: 'Masmorra (.GLB)' },
                                { id: 'tavern', label: 'Taverna (.GLB)' },
                                { id: 'nature', label: 'Natureza (.GLB)' },
                              ].map((f) => (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={() => {
                                    const nextCat = f.id as typeof catalogFilter;
                                    setCatalogFilter(nextCat);
                                    const firstInCat = CURATED_3D_CATALOG.find(
                                      (c) =>
                                        nextCat === 'all' ||
                                        (nextCat === 'scenery' ? Boolean(c.isPropOnly) : c.category === nextCat)
                                    );
                                    if (firstInCat) {
                                      setPreviewCatalogId(firstInCat.id);
                                      setPreviewFinish(firstInCat.finish);
                                    }
                                  }}
                                  className={`px-2.5 py-1 text-xs rounded-md cursor-pointer ${
                                    catalogFilter === f.id
                                      ? 'bg-[#222938] text-amber-300 font-medium'
                                      : 'text-stone-400 hover:text-stone-200'
                                  }`}
                                >
                                  {f.label}
                                </button>
                              ))}
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                              <span className="text-[11px] text-stone-400">
                                Clique para pré-visualizar em 3D antes de colocar no mapa
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const res = clearUnusedModelCache(roomState?.miniatures);
                                  setCacheNotice(`Cache limpo: ${res.clearedModels} modelos e ${res.clearedBuffers} arquivos liberados da memória.`);
                                  setTimeout(() => setCacheNotice(null), 3500);
                                }}
                                title="Libera da memória modelos 3D que foram visualizados mas não foram escolhidos"
                                className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] bg-[#1a202c] hover:bg-stone-700 border border-stone-600 rounded text-stone-300 hover:text-amber-300 cursor-pointer transition-colors"
                              >
                                <Trash2 className="w-3 h-3 text-stone-400" />
                                <span>Limpar Cache</span>
                              </button>
                            </div>
                            {cacheNotice && (
                              <div className="text-[11px] text-emerald-400 bg-emerald-950/50 border border-emerald-500/40 rounded px-2.5 py-1 animate-in fade-in">
                                {cacheNotice}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                            {filteredCatalog.map((item) => {
                              const isPreviewed = previewItem?.id === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setPreviewCatalogId(item.id);
                                    setPreviewFinish(item.finish);
                                  }}
                                  className={`flex flex-col items-start gap-0.5 px-3 py-1.5 text-xs border rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                                    isPreviewed
                                      ? 'bg-[#252d3d] border-amber-400 text-amber-200'
                                      : 'bg-[#1a202c] hover:bg-[#252d3d] border-stone-700/80 text-stone-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 font-medium">
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: item.color }}
                                    />
                                    <span>{item.name}</span>
                                  </div>
                                  <span className="text-[10px] font-mono-tabular text-stone-400">
                                    {item.footprint}x{item.footprint} · {item.sizeLabel}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {previewItem && (
                            <div className="flex flex-wrap items-center gap-3 p-2.5 bg-[#0c0f15] border border-stone-700/80 rounded-xl">
                              <ModelPreview3D
                                format={previewItem.format}
                                assetId={`cat:${previewItem.id}`}
                                remoteUrl={previewItem.url}
                                footprint={previewItem.footprint}
                                scaleMultiplier={previewItem.scaleMultiplier}
                                fixZUp={previewItem.fixZUp}
                                showBase={!previewItem.isPropOnly && previewItem.showBase}
                                baseStyle={previewItem.baseStyle}
                                finish={previewFinish}
                                color={previewItem.color}
                                isPropOnly={previewItem.isPropOnly}
                                label={previewItem.name}
                                sizePx={104}
                              />

                              <div className="flex-1 min-w-[220px] space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-semibold text-amber-300">
                                    Preview 3D: {previewItem.name}
                                  </span>
                                  <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-[#181d27] border border-stone-700 text-stone-300">
                                    Grade {previewItem.footprint}x{previewItem.footprint} · {previewItem.sizeLabel}
                                  </span>
                                </div>
                                <p className="text-[11px] text-stone-400">
                                  Arraste o modelo ao lado para girar e conferir proporcao e acabamento antes de aplicar.
                                </p>
                                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                  <select
                                    value={previewFinish}
                                    onChange={(e) => setPreviewFinish(e.target.value as MiniFinish)}
                                    className="px-2 py-1 text-xs bg-[#161b24] border border-stone-700 rounded-lg text-stone-200"
                                  >
                                    {FINISHES.map((f) => (
                                      <option key={f.id} value={f.id}>
                                        Material: {f.label}
                                      </option>
                                    ))}
                                  </select>

                                  <button
                                    type="button"
                                    onClick={() => spawnCatalogAsset(previewItem, previewFinish)}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-lg cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Colocar na Mesa</span>
                                  </button>

                                  {selectedMini && (
                                    <button
                                      type="button"
                                      onClick={() => applyCatalogAssetToSelected(previewItem, previewFinish)}
                                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-stone-950 rounded-lg cursor-pointer"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Aplicar em "{selectedMini.name}"</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* View 3: Custom URL + MakerWorld / GitHub Browser */}
                    {assetSourceView === 'import' && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex-1 min-w-[240px] flex items-center gap-2 px-2.5 py-1 bg-[#0c0f15] border border-stone-700/80 rounded-lg">
                            <Link2 className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <input
                              type="url"
                              value={remoteUrl}
                              onChange={(e) => setRemoteUrl(e.target.value)}
                              placeholder="Cole URL de imagem (.png/.jpg/.webp p/ Tazo) ou modelo 3D (.stl/.glb)..."
                              className="w-full text-xs bg-transparent text-stone-200 placeholder:text-stone-500 focus:outline-none"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={fetchingUrl || !remoteUrl.trim()}
                            onClick={handleImportFromUrl}
                            className="px-3 py-1.5 text-xs font-medium bg-[#1f2634] hover:bg-[#2b3447] disabled:opacity-45 border border-stone-700 text-stone-200 rounded-lg cursor-pointer"
                          >
                            {fetchingUrl ? 'Baixando...' : 'Carregar URL'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowSources((v) => !v)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-[#181d27] hover:bg-[#222938] border border-stone-700 rounded-lg text-stone-200 cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                            <span>MakerWorld & GitHub</span>
                          </button>
                        </div>

                        {showSources && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 bg-[#0c0f15] border border-stone-700/70 rounded-lg">
                            {EXTERNAL_REPOS.map((repo) => (
                              <a
                                key={repo.url}
                                href={repo.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-start justify-between gap-2 p-2 rounded-lg bg-[#161b24] hover:bg-[#1e2532] border border-stone-800 transition-colors"
                              >
                                <div>
                                  <div className="text-xs font-semibold text-amber-300">
                                    {repo.title}
                                  </div>
                                  <div className="text-[11px] text-stone-400 mt-0.5">{repo.desc}</div>
                                </div>
                                <ExternalLink className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {importError && (
                      <div className="text-xs text-rose-300 bg-rose-950/60 border border-rose-500/40 rounded-lg px-3 py-1.5">
                        {importError}
                      </div>
                    )}

                    {/* Smart Dimensioning / Live 3D Turntable Preview Panel */}
                    {importDraft && (
                      <div className="p-3 bg-[#0c0f15] border border-amber-500/40 rounded-lg flex flex-wrap items-center gap-3">
                        <ModelPreview3D
                          format={importDraft.format}
                          assetId={importDraft.preUploadedAssetId}
                          rawObject={importDraft.rawObject as THREE.Object3D | null}
                          imagePreviewUrl={importDraft.previewUrl}
                          footprint={importDraft.footprint}
                          scaleMultiplier={importDraft.scaleMultiplier}
                          fixZUp={importDraft.fixZUp}
                          showBase={importDraft.format === 'image' ? false : importDraft.showBase}
                          baseStyle={importDraft.baseStyle}
                          finish={importDraft.finish}
                          color={importDraft.color}
                          isPropOnly={importDraft.isPropOnly}
                          label={importDraft.name}
                          sizePx={104}
                        />

                        <div className="flex-1 min-w-[260px] space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={importDraft.name}
                                onChange={(e) => updateImportDraft({ name: e.target.value })}
                                className="px-2 py-1 text-xs font-semibold bg-[#161b24] border border-stone-700 rounded text-stone-100 w-44"
                              />
                              <span className="text-xs font-mono-tabular text-sky-300">
                                {importDraft.format === 'image'
                                  ? 'TAZO (IMAGEM)'
                                  : `.${importDraft.format.toUpperCase()}`}
                              </span>

                              {importDraft.format === 'image' ? (
                                <select
                                  value={
                                    importDraft.isPropOnly
                                      ? '__PROP__'
                                      : importDraft.ownerName === '__GM__'
                                      ? '__GM__'
                                      : importDraft.ownerName
                                  }
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === '__PROP__') {
                                      updateImportDraft({ isPropOnly: true, ownerName: '__GM__' });
                                    } else {
                                      updateImportDraft({ isPropOnly: false, ownerName: v });
                                    }
                                  }}
                                  className="px-2 py-1 text-xs bg-[#161b24] border border-stone-700 rounded text-stone-200"
                                >
                                  <option value="">Heroi (Qualquer Jogador)</option>
                                  <option value="__GM__">Monstro / NPC (So Mestre)</option>
                                  {(roomState?.users || [])
                                    .filter((u) => u.role === 'player')
                                    .map((u) => (
                                      <option key={u.id} value={u.name}>
                                        Jogador: {u.name}
                                      </option>
                                    ))}
                                  <option value="__PROP__">Marcador de Cenario (s/ Ficha)</option>
                                </select>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateImportDraft({
                                      isPropOnly: !importDraft.isPropOnly,
                                      showBase: importDraft.isPropOnly,
                                    })
                                  }
                                  className={`px-2 py-1 text-xs rounded border cursor-pointer ${
                                    importDraft.isPropOnly
                                      ? 'bg-sky-900/60 border-sky-500 text-sky-200'
                                      : 'bg-[#161b24] border-stone-700 text-amber-300'
                                  }`}
                                >
                                  {importDraft.isPropOnly
                                    ? 'Objeto de Cenario 3D (s/ Base)'
                                    : 'Miniatura (c/ Base)'}
                                </button>
                              )}
                            </div>

                            {importDraft.dimInfo ? (
                              <span className="text-xs font-mono-tabular text-stone-400">
                                Bruto: {importDraft.dimInfo.rawWidth} × {importDraft.dimInfo.rawHeight} ×{' '}
                                {importDraft.dimInfo.rawDepth} · {importDraft.dimInfo.unitHint} · Final:{' '}
                                {importDraft.dimInfo.finalHeight}u
                              </span>
                            ) : importDraft.format === 'image' ? (
                              <span className="text-xs text-stone-400">
                                Ficha circular com borda metalica 3D na mesa
                              </span>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-2.5">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-stone-400">Grade:</span>
                              {FOOTPRINTS.map((fp) => (
                                <button
                                  key={fp.value}
                                  type="button"
                                  onClick={() => updateImportDraft({ footprint: fp.value })}
                                  className={`px-2 py-1 text-xs font-mono-tabular rounded border cursor-pointer ${
                                    importDraft.footprint === fp.value
                                      ? 'bg-amber-600 text-stone-950 border-amber-500 font-semibold'
                                      : 'bg-[#161b24] text-stone-300 border-stone-700'
                                  }`}
                                >
                                  {fp.label}
                                </button>
                              ))}
                            </div>

                            <label className="flex items-center gap-2 text-xs text-stone-300">
                              <span>Escala {importDraft.scaleMultiplier.toFixed(2)}x</span>
                              <input
                                type="range"
                                min="0.25"
                                max="2.5"
                                step="0.05"
                                value={importDraft.scaleMultiplier}
                                onChange={(e) =>
                                  updateImportDraft({ scaleMultiplier: parseFloat(e.target.value) })
                                }
                                className="w-20 accent-amber-500"
                              />
                            </label>

                            {importDraft.format !== 'image' && (
                              <button
                                type="button"
                                onClick={() => updateImportDraft({ fixZUp: !importDraft.fixZUp })}
                                className={`px-2 py-1 text-xs rounded border cursor-pointer ${
                                  importDraft.fixZUp
                                    ? 'bg-sky-900/60 border-sky-500 text-sky-200'
                                    : 'bg-[#161b24] border-stone-700 text-stone-400'
                                }`}
                              >
                                {importDraft.fixZUp ? 'Z-Up Corrigido' : 'Y-Up'}
                              </button>
                            )}

                            {importDraft.format !== 'image' && !importDraft.isPropOnly && (
                              <select
                                value={importDraft.baseStyle}
                                onChange={(e) =>
                                  updateImportDraft({ baseStyle: e.target.value as BaseStyle })
                                }
                                className="px-2 py-1 text-xs bg-[#161b24] border border-stone-700 rounded text-stone-200"
                              >
                                {BASE_STYLES.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.label}
                                  </option>
                                ))}
                              </select>
                            )}

                            <select
                              value={importDraft.finish}
                              onChange={(e) =>
                                updateImportDraft({ finish: e.target.value as MiniFinish })
                              }
                              className="px-2 py-1 text-xs bg-[#161b24] border border-stone-700 rounded text-stone-200"
                            >
                              {FINISHES.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {importDraft.format === 'image' ? 'Borda' : 'Material'}: {f.label}
                                </option>
                              ))}
                            </select>

                            {importDraft.format === 'image' && (
                              <div className="flex items-center gap-1">
                                {MINI_COLORS.map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => updateImportDraft({ color: c })}
                                    aria-label={`Cor ${c}`}
                                    className={`w-4 h-4 rounded-full border cursor-pointer ${
                                      importDraft.color === c
                                        ? 'border-white scale-110'
                                        : 'border-transparent opacity-70'
                                    }`}
                                    style={{ backgroundColor: c }}
                                  />
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-1.5 ml-auto">
                              <button
                                type="button"
                                onClick={clearImportDraft}
                                className="px-2.5 py-1.5 text-xs text-stone-300 hover:text-white cursor-pointer"
                              >
                                Cancelar
                              </button>
                              {selectedMini && (
                                <button
                                  type="button"
                                  disabled={uploading}
                                  onClick={() => handleConfirmImport(true)}
                                  className="px-3 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-stone-950 rounded-lg cursor-pointer"
                                >
                                  {uploading ? 'Enviando...' : `Aplicar em "${selectedMini.name}"`}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={uploading}
                                onClick={() => handleConfirmImport(false)}
                                className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-stone-950 rounded-lg cursor-pointer"
                              >
                                {uploading ? 'Enviando...' : 'Colocar na Mesa'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* GM Tab: Dimensionar / Edit Selected Miniature or 3D Object */}
                {gmTab === 'scale' && (
                  <div>
                    {selectedMini ? (
                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={selectedMini.name}
                            onChange={(e) =>
                              onUpdateMini(selectedMini.id, { name: e.target.value })
                            }
                            className="px-2.5 py-1 text-xs font-semibold bg-[#0c0f15] border border-stone-700 rounded-lg text-stone-100 w-32"
                          />

                          <div className="flex items-center gap-1">
                            {FOOTPRINTS.map((fp) => (
                              <button
                                key={fp.value}
                                type="button"
                                onClick={() =>
                                  onUpdateMini(selectedMini.id, { footprint: fp.value })
                                }
                                className={`px-2 py-1 text-xs font-mono-tabular rounded border cursor-pointer ${
                                  selectedMini.footprint === fp.value
                                    ? 'bg-amber-600 text-stone-950 border-amber-500 font-semibold'
                                    : 'bg-[#181d27] text-stone-300 border-stone-700'
                                }`}
                              >
                                {fp.label}
                              </button>
                            ))}
                          </div>

                          <label className="flex items-center gap-1.5 text-xs text-stone-300">
                            <span className="font-mono-tabular">
                              {selectedMini.scaleMultiplier.toFixed(2)}x
                            </span>
                            <input
                              type="range"
                              min="0.25"
                              max="2.5"
                              step="0.05"
                              value={selectedMini.scaleMultiplier}
                              onChange={(e) =>
                                onUpdateMini(selectedMini.id, {
                                  scaleMultiplier: parseFloat(e.target.value),
                                })
                              }
                              className="w-20 accent-amber-500"
                            />
                          </label>

                          {selectedMini.format === 'image' && (
                            <span className="px-2 py-1 text-[11px] font-medium bg-sky-950/60 border border-sky-500/40 rounded text-sky-200">
                              Tazo 3D
                            </span>
                          )}

                          {!selectedMini.isPropOnly && selectedMini.format !== 'image' && (
                            <select
                              value={selectedMini.baseStyle || 'rune'}
                              onChange={(e) =>
                                onUpdateMini(selectedMini.id, {
                                  baseStyle: e.target.value as BaseStyle,
                                  showBase: true,
                                })
                              }
                              className="px-2 py-1 text-xs bg-[#181d27] border border-stone-700 rounded-lg text-stone-200"
                            >
                              {BASE_STYLES.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.label}
                                </option>
                              ))}
                            </select>
                          )}

                          {selectedMini.format !== 'builtin' && selectedMini.format !== 'image' && (
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateMini(selectedMini.id, { fixZUp: !selectedMini.fixZUp })
                              }
                              className={`px-2 py-1 text-xs rounded border cursor-pointer ${
                                selectedMini.fixZUp
                                  ? 'bg-sky-900/60 border-sky-500 text-sky-200'
                                  : 'bg-[#181d27] border-stone-700 text-stone-400'
                              }`}
                            >
                              {selectedMini.fixZUp ? 'Z-Up' : 'Y-Up'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              onUpdateMini(selectedMini.id, {
                                isPropOnly: !selectedMini.isPropOnly,
                                showBase:
                                  selectedMini.format === 'image'
                                    ? false
                                    : Boolean(selectedMini.isPropOnly),
                              })
                            }
                            title={
                              selectedMini.isPropOnly
                                ? 'Converter em Personagem (movido na camada de personagens)'
                                : 'Converter em Objeto de Cenário / Prop (movido na camada de cenário)'
                            }
                            className={`px-2.5 py-1 text-xs rounded border font-semibold cursor-pointer transition-colors flex items-center gap-1 ${
                              selectedMini.isPropOnly
                                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 hover:bg-emerald-900'
                                : 'bg-sky-950/80 border-sky-500 text-sky-300 hover:bg-sky-900'
                            }`}
                          >
                            {selectedMini.isPropOnly ? '🏰 Cenário 3D' : '🧙 Personagem'}
                          </button>

                          {role === 'gm' && scenes && Object.keys(scenes).length > 0 && (
                            <div className="flex items-center gap-1 bg-[#10141c] px-2 py-0.5 rounded-lg border border-stone-800">
                              <MapPin className="w-3.5 h-3.5 text-amber-400" />
                              <span className="text-[11px] text-stone-400">Mapa:</span>
                              <select
                                value={selectedMini.sceneId || activeSceneId || Object.keys(scenes)[0]}
                                onChange={(e) => {
                                  onMoveMiniToScene?.(selectedMini.id, e.target.value);
                                }}
                                title="Mover esta miniatura para outro mapa da mesa"
                                className="bg-[#181d27] text-amber-300 font-semibold text-xs border border-stone-700 rounded px-1.5 py-0.5 cursor-pointer"
                              >
                                {Object.values(scenes).map((sc) => (
                                  <option key={sc.id} value={sc.id}>
                                    {sc.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {!selectedMini.isPropOnly && selectedMini.format !== 'image' && (
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateMini(selectedMini.id, { showBase: !selectedMini.showBase })
                              }
                              className={`px-2 py-1 text-xs rounded border cursor-pointer ${
                                selectedMini.showBase
                                  ? 'bg-stone-700 border-stone-500 text-white'
                                  : 'bg-[#181d27] border-stone-700 text-stone-400'
                              }`}
                            >
                              Base
                            </button>
                          )}

                          <select
                            value={selectedMini.finish}
                            onChange={(e) =>
                              onUpdateMini(selectedMini.id, {
                                finish: e.target.value as MiniFinish,
                              })
                            }
                            className="px-2 py-1 text-xs bg-[#181d27] border border-stone-700 rounded-lg text-stone-200"
                          >
                            {FINISHES.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center gap-1">
                            {MINI_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => onUpdateMini(selectedMini.id, { color: c })}
                                className={`w-4 h-4 rounded-full border cursor-pointer ${
                                  selectedMini.color === c
                                    ? 'border-white scale-110'
                                    : 'border-transparent opacity-70'
                                }`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={selectedMini.ownerName}
                            onChange={(e) =>
                              onUpdateMini(selectedMini.id, { ownerName: e.target.value })
                            }
                            className="px-2 py-1 text-xs bg-[#181d27] border border-stone-700 rounded-lg text-stone-200"
                          >
                            <option value="">Controle: Qualquer Jogador</option>
                            <option value="__GM__">Controle: Apenas Mestre</option>
                            {roomState?.users
                              .filter((u) => u.role === 'player')
                              .map((u) => (
                                <option key={u.id} value={u.name}>
                                  Jogador: {u.name}
                                </option>
                              ))}
                          </select>

                          <button
                            type="button"
                            onClick={() =>
                              onMoveMini(
                                selectedMini.id,
                                selectedMini.x,
                                selectedMini.z,
                                selectedMini.rotationY + Math.PI / 4
                              )
                            }
                            title="Girar +45° (Tecla Q)"
                            className="px-2 py-1 text-xs bg-[#181d27] border border-stone-700 rounded-lg text-stone-200 hover:text-amber-300 cursor-pointer"
                          >
                            Girar
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const dup: MiniatureData = {
                                ...selectedMini,
                                id: `mini-${crypto.randomUUID().slice(0, 8)}`,
                                x: Math.min(15, selectedMini.x + 1),
                              };
                              onCreateMini(dup);
                              onSelectMini(dup.id);
                            }}
                            title="Duplicar objeto 3D / miniatura"
                            className="px-2 py-1 text-xs bg-[#181d27] border border-stone-700 rounded-lg text-stone-200 hover:text-emerald-300 cursor-pointer"
                          >
                            Duplicar
                          </button>

                          {!selectedMini.isPropOnly && (
                            <button
                              type="button"
                              onClick={() => onOpenSheet(selectedMini.id)}
                              title="Abrir Ficha do Personagem / Monstro"
                              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-amber-600/20 hover:bg-amber-600 hover:text-stone-950 border border-amber-500/40 rounded-lg text-amber-300 font-medium cursor-pointer"
                            >
                              <ScrollText className="w-3.5 h-3.5" />
                              <span>Ficha</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              const isMon =
                                selectedMini.ownerName === '__GM__' ||
                                Boolean(selectedMini.sheet?.isMonster);
                              const nextCat: CatalogCategory = selectedMini.isPropOnly
                                ? 'dungeon'
                                : isMon
                                ? 'monster'
                                : 'character';
                              setCatalogFilter(nextCat);
                              const currentId = selectedMini.assetId?.startsWith('cat:')
                                ? selectedMini.assetId.slice(4)
                                : '';
                              if (currentId && CATALOG_BY_ID[currentId]) {
                                setPreviewCatalogId(currentId);
                                setPreviewFinish(selectedMini.finish);
                              } else {
                                const first = CURATED_3D_CATALOG.find(
                                  (c) => c.category === nextCat
                                );
                                if (first) {
                                  setPreviewCatalogId(first.id);
                                  setPreviewFinish(first.finish);
                                }
                              }
                              setAssetSourceView('catalog');
                              setGmTab('minis');
                            }}
                            title="Pre-visualizar e trocar o modelo 3D desta miniatura"
                            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-[#181d27] hover:bg-[#242c3d] border border-sky-500/40 rounded-lg text-sky-300 font-medium cursor-pointer"
                          >
                            <Box className="w-3.5 h-3.5" />
                            <span>Trocar Modelo</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onSaveActorToLibrary?.(selectedMini);
                              showToast(`"${selectedMini.name}" salvo na sua Biblioteca!`);
                            }}
                            title="Salvar modelo 3D e ficha deste personagem/monstro na sua biblioteca pessoal"
                            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-amber-600/20 hover:bg-amber-600 hover:text-stone-950 border border-amber-500/50 rounded-lg text-amber-300 font-medium cursor-pointer transition-colors"
                          >
                            <Bookmark className="w-3.5 h-3.5" />
                            <span>Salvar na Biblioteca</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onDeleteMini(selectedMini.id)}
                            title="Remover miniatura"
                            className="p-1.5 text-rose-400 hover:text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-stone-400 py-1">
                        Clique em qualquer miniatura ou modelo 3D no tabuleiro para trocar sua base esculpida, tamanho na grade (1x1, 2x2, 3x3), escala e quem pode controla-la.
                      </p>
                    )}
                  </div>
                )}

                {/* GM Tab: Character & Monster Sheets + 1-Click Monster Sheet Creator */}
                {gmTab === 'sheets' && (() => {
                  const actors = allMinis.filter((m) => !m.isPropOnly);
                  const heroMinis = actors.filter(
                    (m) => !m.sheet?.isMonster && m.ownerName !== '__GM__'
                  );
                  const monsterMinis = actors.filter(
                    (m) => m.sheet?.isMonster || m.ownerName === '__GM__'
                  );

                  return (
                    <div className="space-y-2.5">
                      {/* Create Monster & Add Extra Hero for Player bars */}
                      <div className="space-y-2 pb-2 border-b border-stone-800">
                        {(() => {
                          const monsterPreviewItem =
                            CATALOG_BY_ID[newMonsterAssetId] ||
                            CATALOG_BY_ID['stl-goblin'] ||
                            CURATED_3D_CATALOG.find((c) => c.category === 'monster')!;
                          const monsterModelOptions = CURATED_3D_CATALOG.filter(
                            (c) => c.category === 'monster' || c.category === 'character'
                          );
                          return (
                            <div className="flex flex-wrap items-center justify-between gap-3 p-2 bg-[#0c0f15] border border-stone-800 rounded-xl">
                              <div className="flex items-center gap-3 flex-1 min-w-[260px]">
                                <ModelPreview3D
                                  format={newMonsterTazoFile ? 'image' : monsterPreviewItem.format}
                                  assetId={`cat:${monsterPreviewItem.id}`}
                                  remoteUrl={monsterPreviewItem.url}
                                  imagePreviewUrl={newMonsterTazoPreview}
                                  footprint={monsterPreviewItem.footprint}
                                  scaleMultiplier={monsterPreviewItem.scaleMultiplier}
                                  fixZUp={monsterPreviewItem.fixZUp}
                                  showBase={!newMonsterTazoFile && monsterPreviewItem.showBase}
                                  baseStyle={monsterPreviewItem.baseStyle}
                                  finish={newMonsterFinish}
                                  color={newMonsterTazoFile ? '#ef4444' : monsterPreviewItem.color}
                                  isPropOnly={false}
                                  label={monsterPreviewItem.name}
                                  sizePx={88}
                                />

                                <div className="flex flex-wrap items-center gap-2 flex-1">
                                  <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-300">
                                    <Skull className="w-3.5 h-3.5 text-rose-400" />
                                    Monstro (Mestre):
                                  </span>
                                  <select
                                    value={newMonsterTplId}
                                    onChange={(e) => {
                                      const id = e.target.value;
                                      setNewMonsterTplId(id);
                                      const tpl = MONSTER_SHEET_TEMPLATES.find((t) => t.id === id);
                                      if (tpl?.catalogAssetId) {
                                        setNewMonsterAssetId(tpl.catalogAssetId);
                                      }
                                    }}
                                    className="px-2.5 py-1 text-xs bg-[#161b24] border border-stone-700 rounded-lg text-stone-200"
                                  >
                                    {MONSTER_SHEET_TEMPLATES.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        Ficha: {t.label} ({t.suggestedHp} PV · CA {t.sheet.ac})
                                      </option>
                                    ))}
                                  </select>

                                  <select
                                    value={newMonsterAssetId}
                                    onChange={(e) => setNewMonsterAssetId(e.target.value)}
                                    className="px-2.5 py-1 text-xs bg-[#161b24] border border-stone-700 rounded-lg text-amber-200"
                                  >
                                    {monsterModelOptions.map((m) => (
                                      <option key={m.id} value={m.id}>
                                        Modelo 3D: {m.name} ({m.footprint}x{m.footprint})
                                      </option>
                                    ))}
                                  </select>

                                  <select
                                    value={newMonsterFinish}
                                    onChange={(e) => setNewMonsterFinish(e.target.value as MiniFinish)}
                                    className="px-2 py-1 text-xs bg-[#161b24] border border-stone-700 rounded-lg text-stone-200"
                                  >
                                    {FINISHES.map((f) => (
                                      <option key={f.id} value={f.id}>
                                        {f.label}
                                      </option>
                                    ))}
                                  </select>

                                  <input
                                    type="text"
                                    value={newMonsterName}
                                    maxLength={32}
                                    onChange={(e) => setNewMonsterName(e.target.value)}
                                    placeholder="Nome do monstro (opcional)"
                                    className="w-40 px-2.5 py-1 text-xs bg-[#161b24] border border-stone-700 rounded-lg text-stone-200 placeholder:text-stone-500 focus:outline-none"
                                  />

                                  <input
                                    ref={monsterTazoInputRef}
                                    type="file"
                                    accept=".png,.jpg,.jpeg,.webp"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) {
                                        if (newMonsterTazoPreview?.startsWith('blob:')) {
                                          URL.revokeObjectURL(newMonsterTazoPreview);
                                        }
                                        setNewMonsterTazoFile(f);
                                        setNewMonsterTazoPreview(URL.createObjectURL(f));
                                      }
                                      e.target.value = '';
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => monsterTazoInputRef.current?.click()}
                                    title="Opcional: usar imagem (Tazo) para este monstro"
                                    className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border cursor-pointer ${
                                      newMonsterTazoFile
                                        ? 'bg-sky-950/60 border-sky-500/60 text-sky-200'
                                        : 'bg-[#161b24] border-stone-700 text-stone-300 hover:border-stone-500'
                                    }`}
                                  >
                                    <Disc className="w-3.5 h-3.5 text-sky-400" />
                                    <span className="max-w-[90px] truncate">
                                      {newMonsterTazoFile ? newMonsterTazoFile.name : 'Img Tazo'}
                                    </span>
                                  </button>
                                  {newMonsterTazoFile && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setNewMonsterTazoFile(null);
                                        if (newMonsterTazoPreview?.startsWith('blob:')) {
                                          URL.revokeObjectURL(newMonsterTazoPreview);
                                        }
                                        setNewMonsterTazoPreview(null);
                                      }}
                                      aria-label="Remover imagem do monstro"
                                      className="p-1 text-stone-400 hover:text-rose-400 cursor-pointer"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {selectedMini && !newMonsterTazoFile && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        applyCatalogAssetToSelected(monsterPreviewItem, newMonsterFinish)
                                      }
                                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-stone-950 rounded-lg cursor-pointer"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Aplicar em "{selectedMini.name}"</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    disabled={creatingMonsterTazo}
                                    onClick={handleCreateMonsterWithSheet}
                                    className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>{creatingMonsterTazo ? 'Enviando...' : 'Criar Monstro'}</span>
                                  </button>
                                </div>
                              </div>

                              <span className="text-[11px] text-stone-400">
                                {actors.length} {actors.length === 1 ? 'ficha ativa' : 'fichas ativas'} na mesa
                              </span>
                            </div>
                          );
                        })()}

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
                            <UserPlus className="w-3.5 h-3.5 text-sky-400" />
                            + Personagem p/ Jogador:
                          </span>
                          <select
                            value={gmHeroTplId}
                            onChange={(e) => setGmHeroTplId(e.target.value)}
                            className="px-2.5 py-1 text-xs bg-[#0c0f15] border border-stone-700 rounded-lg text-stone-200"
                          >
                            {HERO_SHEET_TEMPLATES.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label} ({t.suggestedHp} PV)
                              </option>
                            ))}
                          </select>
                          <select
                            value={gmHeroOwner}
                            onChange={(e) => setGmHeroOwner(e.target.value)}
                            className="px-2.5 py-1 text-xs bg-[#0c0f15] border border-stone-700 rounded-lg text-stone-200"
                          >
                            <option value="">Qualquer Jogador</option>
                            {(roomState?.users || [])
                              .filter((u) => u.role === 'player')
                              .map((u) => (
                                <option key={u.id} value={u.name}>
                                  Jogador: {u.name}
                                </option>
                              ))}
                          </select>
                          <input
                            type="text"
                            value={gmHeroName}
                            maxLength={32}
                            onChange={(e) => setGmHeroName(e.target.value)}
                            placeholder="Nome do personagem (opcional)"
                            className="w-40 px-2.5 py-1 text-xs bg-[#0c0f15] border border-stone-700 rounded-lg text-stone-200 placeholder:text-stone-500 focus:outline-none"
                          />
                          <input
                            ref={gmHeroTazoInputRef}
                            type="file"
                            accept=".png,.jpg,.jpeg,.webp"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) setGmHeroTazoFile(f);
                              e.target.value = '';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => gmHeroTazoInputRef.current?.click()}
                            title="Opcional: usar imagem (Tazo) para este personagem"
                            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border cursor-pointer ${
                              gmHeroTazoFile
                                ? 'bg-sky-950/60 border-sky-500/60 text-sky-200'
                                : 'bg-[#0c0f15] border-stone-700 text-stone-300 hover:border-stone-500'
                            }`}
                          >
                            <Disc className="w-3.5 h-3.5 text-sky-400" />
                            <span className="max-w-[90px] truncate">
                              {gmHeroTazoFile ? gmHeroTazoFile.name : 'Img Tazo'}
                            </span>
                          </button>
                          {gmHeroTazoFile && (
                            <button
                              type="button"
                              onClick={() => setGmHeroTazoFile(null)}
                              aria-label="Remover imagem do personagem"
                              className="p-1 text-stone-400 hover:text-rose-400 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={creatingGmHeroTazo}
                            onClick={handleGmCreateHeroForPlayer}
                            className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-stone-950 rounded-lg cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{creatingGmHeroTazo ? 'Enviando...' : 'Adicionar Heroi Extra'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Roster strips: Heroes & Monsters */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                            Personagens dos Jogadores ({heroMinis.length})
                          </span>
                          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                            {heroMinis.length > 0 ? (
                              heroMinis.map((m) => {
                                const s = resolveMiniSheet(m);
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => {
                                      onSelectMini(m.id);
                                      onOpenSheet(m.id);
                                    }}
                                    className="flex items-center gap-2 px-2.5 py-1.5 text-xs bg-[#181d27] hover:bg-[#232b3b] border border-stone-700/80 rounded-lg text-stone-200 whitespace-nowrap shrink-0 cursor-pointer"
                                  >
                                    <ScrollText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    <span className="font-medium">{m.name}</span>
                                    <span className="font-mono-tabular text-[11px] text-emerald-300">
                                      {m.hp}/{m.maxHp} PV
                                    </span>
                                    <span className="font-mono-tabular text-[11px] text-sky-300">
                                      CA {s.ac}
                                    </span>
                                  </button>
                                );
                              })
                            ) : (
                              <span className="text-xs text-stone-500">
                                Nenhum heroi na mesa ainda.
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-300">
                            Monstros & NPCs do Mestre ({monsterMinis.length})
                          </span>
                          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                            {monsterMinis.length > 0 ? (
                              monsterMinis.map((m) => {
                                const s = resolveMiniSheet(m);
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => {
                                      onSelectMini(m.id);
                                      onOpenSheet(m.id);
                                    }}
                                    className="flex items-center gap-2 px-2.5 py-1.5 text-xs bg-[#181d27] hover:bg-[#271b22] border border-rose-500/30 rounded-lg text-stone-200 whitespace-nowrap shrink-0 cursor-pointer"
                                  >
                                    <Skull className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                    <span className="font-medium">{m.name}</span>
                                    <span className="font-mono-tabular text-[11px] text-rose-300">
                                      {m.hp}/{m.maxHp} PV
                                    </span>
                                    <span className="font-mono-tabular text-[11px] text-sky-300">
                                      CA {s.ac}
                                    </span>
                                    {s.hiddenFromPlayers && (
                                      <EyeOff className="w-3 h-3 text-amber-400 shrink-0" />
                                    )}
                                  </button>
                                );
                              })
                            ) : (
                              <span className="text-xs text-stone-500">
                                Crie um monstro acima ou pelo catalogo 3D.
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 📚 Minha Biblioteca de Monstros & Heróis Salvos */}
                        <div className="pt-2 border-t border-stone-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Bookmark className="w-4 h-4 text-amber-400" />
                              <span className="text-xs font-semibold text-amber-300">
                                Minha Biblioteca de Monstros & Heróis Salvos ({savedActors.length})
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <input
                                ref={actorImportInputRef}
                                type="file"
                                accept=".json"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) {
                                    onImportActor?.(f);
                                    e.target.value = '';
                                  }
                                }}
                                className="hidden"
                              />
                              <button
                                type="button"
                                onClick={() => actorImportInputRef.current?.click()}
                                className="flex items-center gap-1 px-2 py-1 text-xs bg-[#181d27] hover:bg-stone-700 border border-stone-700 rounded-lg text-stone-200 cursor-pointer"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span>Importar Ficha (.JSON)</span>
                              </button>
                            </div>
                          </div>

                          {savedActors.length === 0 ? (
                            <div className="p-3 bg-[#0c0f15] border border-dashed border-stone-800 rounded-xl text-center text-xs text-stone-400">
                              Nenhum monstro ou herói salvo ainda. Use o botão{' '}
                              <strong className="text-amber-300">"⭐ Salvar na Biblioteca"</strong> na ficha ou na miniatura para reutilizá-los em qualquer mapa!
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                              {savedActors.map((actor) => (
                                <div
                                  key={actor.id}
                                  className="flex items-center gap-2 px-2.5 py-1.5 bg-[#141923] border border-amber-500/30 rounded-xl text-xs text-stone-200 shrink-0 shadow"
                                >
                                  {actor.sheet.isMonster ? (
                                    <Skull className="w-4 h-4 text-rose-400 shrink-0" />
                                  ) : (
                                    <Crown className="w-4 h-4 text-sky-400 shrink-0" />
                                  )}
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-stone-100">{actor.name}</span>
                                    <span className="text-[10px] text-stone-400">
                                      {actor.hp}/{actor.maxHp} PV · CA {actor.sheet.ac} · {actor.sheet.isMonster ? 'Monstro' : 'Herói'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 ml-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onSpawnActorFromLibrary?.(actor);
                                        showToast(`"${actor.name}" colocado no tabuleiro!`);
                                      }}
                                      title="Colocar miniatura no centro do tabuleiro"
                                      className="flex items-center gap-1 px-2 py-0.5 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold rounded text-[11px] cursor-pointer"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Colocar</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onExportActor?.(actor)}
                                      title="Exportar arquivo .JSON desta ficha"
                                      className="p-1 hover:bg-stone-700 rounded text-stone-400 hover:text-stone-200 cursor-pointer"
                                    >
                                      <Download className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onDeleteSavedActor?.(actor.id)}
                                      title="Excluir da biblioteca"
                                      className="p-1 hover:bg-rose-950/60 rounded text-rose-400 cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* GM Tab: 3D Markers & Tactical Shapes */}
                {gmTab === 'annotations' && (() => {
                  const activeTarget = selectedAnnotation || annotationBrush;
                  const patchActive = (patch: Partial<AnnotationBrush>) => {
                    if (selectedAnnotation) {
                      onUpdateAnnotation(selectedAnnotation.id, patch);
                    } else {
                      onSetAnnotationBrush({ ...annotationBrush, ...patch });
                      if (toolMode !== 'annotate') onSetToolMode('annotate');
                    }
                  };
                  const annotationsList = Object.values(roomState?.annotations || {});

                  return (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {ANNOTATION_KINDS.map((k) => (
                            <button
                              key={k.id}
                              type="button"
                              onClick={() => patchActive({ kind: k.id })}
                              className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer ${
                                activeTarget.kind === k.id
                                  ? 'border-purple-400 bg-purple-950/60 text-purple-200 font-medium'
                                  : 'border-stone-700/70 bg-[#181d27] text-stone-300 hover:border-stone-500'
                              }`}
                            >
                              {k.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-2">
                          {selectedAnnotation ? (
                            <>
                              <span className="text-xs text-purple-300 font-medium">
                                Editando marcador ({selectedAnnotation.x}, {selectedAnnotation.z})
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectAnnotation(null);
                                  onSetToolMode('annotate');
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-stone-950 font-semibold rounded-lg cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Novo no Mapa</span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onSetToolMode(toolMode === 'annotate' ? 'interact' : 'annotate')}
                              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border cursor-pointer ${
                                toolMode === 'annotate'
                                  ? 'bg-purple-600 border-purple-400 text-stone-950 font-semibold'
                                  : 'bg-[#181d27] border-stone-700 text-stone-300 hover:text-white'
                              }`}
                            >
                              <MapPin className="w-3.5 h-3.5" />
                              <span>
                                {toolMode === 'annotate'
                                  ? 'Clique no mapa 3D para colocar'
                                  : 'Ativar Pincel no Mapa'}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <input
                          type="text"
                          value={activeTarget.label}
                          maxLength={48}
                          onChange={(e) => patchActive({ label: e.target.value })}
                          placeholder="Texto 3D (ex: Tesouro, Armadilha, Perigo...)"
                          className="px-2.5 py-1.5 text-xs bg-[#0c0f15] border border-stone-700 rounded-lg text-stone-100 placeholder:text-stone-500 w-56 focus:outline-none focus:border-purple-400"
                        />

                        <div className="flex items-center gap-1">
                          {QUICK_ANNOTATION_TAGS.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                const isSecret = tag === 'Tesouro' || tag === 'Armadilha' || tag === 'Segredo';
                                patchActive({
                                  label: tag,
                                  ...(isSecret ? { gmOnly: true } : {}),
                                });
                              }}
                              className="px-2 py-1 text-[11px] bg-[#181d27] hover:bg-[#242c3c] border border-stone-700/80 rounded text-stone-300 cursor-pointer"
                            >
                              {tag}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-1">
                          {ANNOTATION_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => patchActive({ color: c })}
                              className={`w-4 h-4 rounded-full border cursor-pointer ${
                                activeTarget.color === c
                                  ? 'border-white scale-110'
                                  : 'border-transparent opacity-75'
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>

                        <label className="flex items-center gap-1.5 text-xs text-stone-300">
                          <span className="font-mono-tabular">
                            Raio: {activeTarget.radius.toFixed(1)}u
                          </span>
                          <input
                            type="range"
                            min="0.5"
                            max="5"
                            step="0.5"
                            value={activeTarget.radius}
                            onChange={(e) =>
                              patchActive({ radius: parseFloat(e.target.value) })
                            }
                            className="w-20 accent-purple-400"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() =>
                            patchActive({ rotationY: activeTarget.rotationY + Math.PI / 4 })
                          }
                          title="Girar forma +45°"
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-[#181d27] border border-stone-700 rounded-lg text-stone-200 hover:text-purple-300 cursor-pointer"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span className="font-mono-tabular">
                            {Math.round(((activeTarget.rotationY * 180) / Math.PI) % 360)}°
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => patchActive({ gmOnly: !activeTarget.gmOnly })}
                          title="Alternar se os jogadores podem ver este marcador"
                          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border cursor-pointer ${
                            activeTarget.gmOnly
                              ? 'bg-amber-950/60 border-amber-500/60 text-amber-200'
                              : 'bg-[#181d27] border-stone-700 text-stone-300 hover:text-white'
                          }`}
                        >
                          {activeTarget.gmOnly ? (
                            <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                          ) : (
                            <Eye className="w-3.5 h-3.5 text-emerald-400" />
                          )}
                          <span>{activeTarget.gmOnly ? 'So Mestre' : 'Visivel p/ Todos'}</span>
                        </button>

                        {selectedAnnotation && (
                          <button
                            type="button"
                            onClick={() => onDeleteAnnotation(selectedAnnotation.id)}
                            title="Remover marcador selecionado"
                            className="p-1.5 text-rose-400 hover:text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* 🚪 Configurações de Área de Transferência / Portal */}
                      {activeTarget.kind === 'portal' && (
                        <div className="flex flex-wrap items-center gap-3 p-2 bg-[#0d141e] border border-cyan-500/50 rounded-xl text-xs text-stone-200">
                          <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
                            <DoorOpen className="w-4 h-4 text-cyan-400" />
                            <span>Destino da Transferência:</span>
                          </div>

                          <select
                            value={activeTarget.targetMap || 'blank'}
                            onChange={(e) => {
                              const val = e.target.value;
                              const targetName = e.target.selectedOptions[0]?.text || val;
                              patchActive({ targetMap: val, targetMapName: targetName });
                            }}
                            className="px-2.5 py-1 bg-[#16202e] border border-cyan-500/50 rounded-lg text-cyan-200 focus:outline-none"
                          >
                            {scenes && Object.keys(scenes).length > 0 && (
                              <optgroup label="── Mapas Ativos na Mesa ──">
                                {Object.values(scenes).map((sc) => (
                                  <option key={sc.id} value={sc.id}>
                                    📍 {sc.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label="── Mapas Padrão ──">
                              <option value="blank">Mapa Limpo (Padrão)</option>
                              <option value="crypt">Cripta Nórdica</option>
                              <option value="tavern">Taverna de Whiterun</option>
                              <option value="arena">Pico dos Dragões</option>
                            </optgroup>
                            {savedScenarios.length > 0 && (
                              <optgroup label="── Cenários Salvos ──">
                                {savedScenarios.map((sc) => (
                                  <option key={sc.id} value={sc.id}>
                                    🗺️ {sc.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>

                          <div className="flex items-center gap-1.5 bg-[#16202e] border border-stone-700 rounded-lg px-2 py-1">
                            <span className="text-stone-400">Chegada X:</span>
                            <input
                              type="number"
                              value={activeTarget.targetX ?? 0}
                              onChange={(e) => patchActive({ targetX: parseInt(e.target.value) || 0 })}
                              className="w-12 bg-transparent text-cyan-300 text-center focus:outline-none"
                            />
                            <span className="text-stone-400">Z:</span>
                            <input
                              type="number"
                              value={activeTarget.targetZ ?? 0}
                              onChange={(e) => patchActive({ targetZ: parseInt(e.target.value) || 0 })}
                              className="w-12 bg-transparent text-cyan-300 text-center focus:outline-none"
                            />
                          </div>

                          <label className="flex items-center gap-1.5 cursor-pointer text-stone-300 hover:text-white">
                            <input
                              type="checkbox"
                              checked={activeTarget.autoTeleport ?? true}
                              onChange={(e) => patchActive({ autoTeleport: e.target.checked })}
                              className="rounded border-stone-700 accent-cyan-500"
                            />
                            <span>Teleporte imediato ao pisar (sem janela de confirmação)</span>
                          </label>
                        </div>
                      )}

                      {annotationsList.length > 0 && (
                        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-stone-800/80">
                          <span className="text-[11px] text-stone-400 shrink-0 mr-1">
                            No mapa ({annotationsList.length}):
                          </span>
                          {annotationsList.map((ann) => (
                            <div
                              key={ann.id}
                              className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg border shrink-0 ${
                                selectedAnnotationId === ann.id
                                  ? 'bg-purple-950/60 border-purple-400 text-purple-100'
                                  : 'bg-[#181d27] border-stone-700/70 text-stone-300'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  onSelectAnnotation(selectedAnnotationId === ann.id ? null : ann.id)
                                }
                                className="flex items-center gap-1.5 cursor-pointer"
                              >
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: ann.color }}
                                />
                                <span className="max-w-[120px] truncate">
                                  {ann.label || ann.kind}
                                </span>
                                {ann.gmOnly && (
                                  <EyeOff className="w-3 h-3 text-amber-400 shrink-0" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteAnnotation(ann.id)}
                                aria-label={`Excluir ${ann.label || ann.kind}`}
                                className="text-stone-500 hover:text-rose-400 ml-0.5 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* GM Tab: YouTube Music DJ for Everyone */}
                {gmTab === 'music' && (() => {
                  const activeMusic = roomState?.music || null;
                  const allTracks = [...customTracks, ...RPG_MUSIC_PRESETS];
                  return (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex-1 min-w-[230px] flex items-center gap-2 px-2.5 py-1.5 bg-[#0c0f15] border border-stone-700/80 rounded-lg">
                          <Music className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <input
                            type="text"
                            value={ytUrlInput}
                            onChange={(e) => setYtUrlInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handlePlayCustomYouTube();
                            }}
                            placeholder="Cole link do YouTube (ex: https://youtu.be/...) ou ID"
                            className="w-full text-xs bg-transparent text-stone-100 placeholder:text-stone-500 focus:outline-none"
                          />
                        </div>

                        <input
                          type="text"
                          value={ytTitleInput}
                          maxLength={60}
                          onChange={(e) => setYtTitleInput(e.target.value)}
                          placeholder="Nome da musica (opcional)"
                          className="w-44 px-2.5 py-1.5 text-xs bg-[#0c0f15] border border-stone-700/80 rounded-lg text-stone-200 placeholder:text-stone-500 focus:outline-none"
                        />

                        <button
                          type="button"
                          disabled={loadingYtInfo || !ytUrlInput.trim()}
                          onClick={handlePlayCustomYouTube}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 disabled:opacity-45 text-stone-950 rounded-lg transition-colors cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>{loadingYtInfo ? 'Buscando...' : 'Tocar p/ Todos'}</span>
                        </button>

                        {activeMusic && (
                          <div className="flex items-center gap-1 pl-2 border-l border-stone-800">
                            <button
                              type="button"
                              onClick={() =>
                                onControlMusic({
                                  action: activeMusic.isPlaying ? 'pause' : 'play',
                                })
                              }
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[#181d27] hover:bg-[#232b3b] border border-stone-700 rounded-lg text-amber-300 cursor-pointer"
                            >
                              {activeMusic.isPlaying ? (
                                <>
                                  <Pause className="w-3.5 h-3.5" />
                                  <span>Pausar</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5" />
                                  <span>Retomar</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => onControlMusic({ action: 'seek', positionSec: 0 })}
                              title="Reiniciar musica do inicio"
                              className="p-1.5 bg-[#181d27] hover:bg-[#232b3b] border border-stone-700 rounded-lg text-stone-200 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onControlMusic({ action: 'toggle_loop' })}
                              title="Alternar repeticao automatica (Loop)"
                              className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg border cursor-pointer ${
                                activeMusic.loop
                                  ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200'
                                  : 'bg-[#181d27] border-stone-700 text-stone-400'
                              }`}
                            >
                              <Repeat className="w-3.5 h-3.5" />
                              <span>Loop</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onControlMusic({ action: 'stop' })}
                              title="Encerrar musica na mesa"
                              className="p-1.5 bg-rose-950/40 hover:bg-rose-950/70 border border-rose-500/30 rounded-lg text-rose-300 cursor-pointer"
                            >
                              <Square className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {musicError && (
                        <div className="text-xs text-rose-300 bg-rose-950/60 border border-rose-500/40 rounded-lg px-3 py-1.5">
                          {musicError}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                        {allTracks.map((track) => {
                          const isCurrent = activeMusic?.videoId === track.videoId;
                          return (
                            <button
                              key={track.videoId}
                              type="button"
                              onClick={() =>
                                onControlMusic({
                                  action: 'set_and_play',
                                  videoId: track.videoId,
                                  title: track.title,
                                  positionSec: 0,
                                })
                              }
                              className={`flex flex-col items-start gap-0.5 px-3 py-1.5 text-xs rounded-lg border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                                isCurrent
                                  ? 'bg-amber-950/50 border-amber-500 text-amber-200'
                                  : 'bg-[#1a202c] hover:bg-[#252d3d] border-stone-700/80 text-stone-200'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 font-medium">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: track.color }}
                                />
                                <span>
                                  {isCurrent && activeMusic?.isPlaying
                                    ? `Tocando: ${track.title}`
                                    : track.title}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono-tabular text-stone-400">
                                {track.mood} · YouTube
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* GM Tab: Players & Database Sync */}
                {gmTab === 'players' && (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Users className="w-4 h-4 text-stone-400" />
                        {(roomState?.users || []).map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center gap-2 px-2.5 py-1 bg-[#181d27] border border-stone-700/70 rounded-lg text-xs"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: u.color }}
                            />
                            <span className="text-stone-200 font-medium">{u.name}</span>
                            <span className="text-stone-400">
                              ({u.role === 'gm' ? 'Mestre' : 'Jogador'})
                            </span>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={copyInviteLink}
                        className="px-3 py-1.5 text-xs bg-[#181d27] hover:bg-[#222938] border border-stone-700 rounded-lg text-amber-300 cursor-pointer"
                      >
                        Copiar Link da Sala ({roomState?.roomId})
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-stone-800/80">
                      <div className="flex items-center gap-2 text-xs text-stone-300">
                        <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>
                          Persistencia em disco ativa (.data)
                        </span>
                        <span className="text-stone-600" aria-hidden="true">·</span>
                        {firebaseUser ? (
                          <span className="text-emerald-300">
                            Nuvem Firestore: {firebaseUser.displayName || firebaseUser.email}
                            {cloudSyncing
                              ? ' (Salvando...)'
                              : cloudSavedAt
                              ? ` (Salvo as ${new Date(cloudSavedAt).toLocaleTimeString('pt-BR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })})`
                              : ''}
                          </span>
                        ) : (
                          <span className="text-stone-400">
                            Backup na nuvem indisponivel
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {firebaseUser ? (
                          <>
                            <button
                              type="button"
                              disabled={cloudSyncing}
                              onClick={onSaveCloud}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-stone-950 rounded-lg cursor-pointer"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Salvar na Nuvem</span>
                            </button>
                            <button
                              type="button"
                              disabled={cloudSyncing}
                              onClick={onLoadCloud}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-[#181d27] hover:bg-[#222938] border border-stone-700 text-sky-300 rounded-lg cursor-pointer"
                            >
                              <FolderDown className="w-3.5 h-3.5" />
                              <span>Carregar da Nuvem</span>
                            </button>
                            <button
                              type="button"
                              onClick={onGoogleSignOut}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-[#181d27] hover:bg-stone-800 border border-stone-700 text-stone-400 rounded-lg cursor-pointer"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              <span>Sair</span>
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* PLAYER MODE: Move characters + Add Own Character (max 1) + Distance Ruler */
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 p-0.5 bg-[#0b0e14] rounded-lg border border-stone-800 mr-1">
                      <button
                        type="button"
                        onClick={() => onSetToolMode('interact')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                          toolMode === 'interact'
                            ? 'bg-amber-600 text-stone-950'
                            : 'text-stone-300 hover:text-white'
                        }`}
                      >
                        <MousePointer className="w-3.5 h-3.5" />
                        <span>Mover</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetToolMode(toolMode === 'measure' ? 'interact' : 'measure')}
                        title="Medir distancia na grade (Atalho: M)"
                        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                          toolMode === 'measure'
                            ? 'bg-cyan-500 text-stone-950'
                            : 'text-stone-300 hover:text-white'
                        }`}
                      >
                        <Ruler className="w-3.5 h-3.5" />
                        <span>Regua (M)</span>
                      </button>
                    </div>

                    <span className="text-xs text-stone-400 mr-1">Seus Personagens:</span>
                    {controllableMinis.length > 0 ? (
                      controllableMinis.map((m) => (
                        <div
                          key={m.id}
                          className={`flex items-center rounded-lg border overflow-hidden transition-colors ${
                            selectedMiniId === m.id && toolMode === 'interact'
                              ? 'bg-sky-600/25 border-sky-400 text-sky-200 font-medium'
                              : 'bg-[#181d27] border-stone-700 text-stone-300 hover:border-stone-500'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onSetToolMode('interact');
                              onSelectMini(m.id === selectedMiniId ? null : m.id);
                            }}
                            className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: m.color }}
                            />
                            <span>{m.name}</span>
                            <span className="font-mono-tabular text-[11px] text-emerald-300">
                              {m.hp}/{m.maxHp}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenSheet(m.id)}
                            title={`Abrir ficha de ${m.name}`}
                            className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium bg-[#12161e] hover:bg-amber-600 hover:text-stone-950 border-l border-stone-700/80 text-amber-300 transition-colors cursor-pointer"
                          >
                            <ScrollText className="w-3 h-3" />
                            <span>Ficha</span>
                          </button>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-stone-400">
                        Nenhum personagem ainda — crie o seu ao lado!
                      </span>
                    )}

                    {canPlayerAddOwnChar ? (
                      <button
                        type="button"
                        onClick={() => setShowPlayerCreator((v) => !v)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-stone-950 rounded-lg transition-colors cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Adicionar Meu Personagem (0/1)</span>
                      </button>
                    ) : (
                      <span
                        title="Cada jogador adiciona 1 personagem proprio. Personagens extras sao adicionados pelo Mestre."
                        className="px-2 py-1 text-[11px] bg-[#181d27] border border-stone-700/70 rounded-md text-stone-400"
                      >
                        Seu personagem: 1/1 (extras via Mestre)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {firebaseUser ? (
                      <button
                        type="button"
                        disabled={cloudSyncing}
                        onClick={onSaveCloud}
                        title="Salvar sua ficha na nuvem Firestore"
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-[#181d27] hover:bg-[#222938] border border-stone-700 text-emerald-300 rounded-lg cursor-pointer"
                      >
                        <Cloud className="w-3.5 h-3.5" />
                        <span>{cloudSyncing ? 'Salvando...' : 'Nuvem'}</span>
                      </button>
                    ) : null}

                    {toolMode === 'measure' ? (
                      <span className="text-xs text-cyan-300">
                        Clique e arraste no tabuleiro 3D
                      </span>
                    ) : selectedMini ? (
                      <>
                        {!selectedMini.isPropOnly && (
                          <button
                            type="button"
                            onClick={() => onOpenSheet(selectedMini.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-lg cursor-pointer"
                          >
                            <ScrollText className="w-3.5 h-3.5" />
                            <span>Abrir Ficha</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            onMoveMini(
                              selectedMini.id,
                              selectedMini.x,
                              selectedMini.z,
                              selectedMini.rotationY + Math.PI / 4
                            )
                          }
                          className="px-2.5 py-1.5 text-xs bg-[#181d27] border border-stone-700 rounded-lg text-stone-200 hover:text-sky-300 cursor-pointer"
                        >
                          Girar (Q/E)
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {/* Player Self-Creation Drawer (1 own character max: 3D Mini OR Tazo Image) */}
                {canPlayerAddOwnChar && showPlayerCreator && (
                  <div className="p-2.5 bg-[#0c0f15] border border-emerald-500/40 rounded-lg space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-emerald-300">
                          Criar Seu Personagem (1 por jogador)
                        </span>
                        <div className="flex items-center gap-1 p-0.5 bg-[#161b24] border border-stone-700/80 rounded-lg">
                          <button
                            type="button"
                            onClick={() => setPlayerTokenMode('3d')}
                            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md cursor-pointer ${
                              playerTokenMode === '3d'
                                ? 'bg-amber-600 text-stone-950 font-semibold'
                                : 'text-stone-300 hover:text-white'
                            }`}
                          >
                            <Box className="w-3 h-3" />
                            <span>Miniatura 3D</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPlayerTokenMode('tazo')}
                            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md cursor-pointer ${
                              playerTokenMode === 'tazo'
                                ? 'bg-sky-500 text-stone-950 font-semibold'
                                : 'text-stone-300 hover:text-white'
                            }`}
                          >
                            <Disc className="w-3 h-3" />
                            <span>Apenas Imagem (Tazo)</span>
                          </button>
                        </div>
                      </div>
                      <span className="text-[11px] text-stone-400">
                        Apos criar na mesa, sua ficha abrira para preenchimento.
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={playerCharName}
                        maxLength={32}
                        onChange={(e) => setPlayerCharName(e.target.value)}
                        placeholder={`Nome (ex: ${userName})`}
                        className="w-36 px-2.5 py-1.5 text-xs bg-[#161b24] border border-stone-700 rounded-lg text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-emerald-500"
                      />

                      <select
                        value={playerHeroTplId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setPlayerHeroTplId(id);
                          const tpl = HERO_SHEET_TEMPLATES.find((t) => t.id === id);
                          if (tpl?.catalogAssetId) setPlayerHeroAssetId(tpl.catalogAssetId);
                        }}
                        className="px-2.5 py-1.5 text-xs bg-[#161b24] border border-stone-700 rounded-lg text-stone-200"
                      >
                        {HERO_SHEET_TEMPLATES.map((t) => (
                          <option key={t.id} value={t.id}>
                            Classe: {t.label} ({t.suggestedHp} PV)
                          </option>
                        ))}
                      </select>

                      {playerTokenMode === 'tazo' ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            ref={playerImageInputRef}
                            type="file"
                            accept=".png,.jpg,.jpeg,.webp"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                if (playerTazoPreview?.startsWith('blob:')) {
                                  URL.revokeObjectURL(playerTazoPreview);
                                }
                                setPlayerTazoFile(f);
                                setPlayerTazoUrl('');
                                setPlayerTazoPreview(URL.createObjectURL(f));
                              }
                              e.target.value = '';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => playerImageInputRef.current?.click()}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-sky-600/20 hover:bg-sky-600/35 border border-sky-500/50 rounded-lg text-sky-200 font-medium cursor-pointer"
                          >
                            <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                            <span>
                              {playerTazoFile ? playerTazoFile.name.slice(0, 18) : 'Escolher Imagem'}
                            </span>
                          </button>

                          <input
                            type="url"
                            value={playerTazoUrl}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPlayerTazoUrl(val);
                              if (val.trim()) {
                                setPlayerTazoFile(null);
                                if (playerTazoPreview?.startsWith('blob:')) {
                                  URL.revokeObjectURL(playerTazoPreview);
                                }
                                setPlayerTazoPreview(val.trim());
                              } else {
                                setPlayerTazoPreview(null);
                              }
                            }}
                            placeholder="...ou cole link da imagem (.png/.jpg)"
                            className="w-48 px-2.5 py-1.5 text-xs bg-[#161b24] border border-stone-700 rounded-lg text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-sky-500"
                          />

                          {playerTazoPreview && (
                            <img
                              src={playerTazoPreview}
                              alt="Previa do Tazo"
                              className="w-8 h-8 rounded-full object-cover border-2 bg-[#141923] shrink-0"
                              style={{ borderColor: playerHeroColor }}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          )}
                        </div>
                      ) : (
                        <>
                          {(() => {
                            const heroPreview =
                              CATALOG_BY_ID[playerHeroAssetId] || CATALOG_BY_ID['stl-hero-barbarian']!;
                            return !playerCustomFile ? (
                              <ModelPreview3D
                                format={heroPreview.format}
                                assetId={`cat:${heroPreview.id}`}
                                remoteUrl={heroPreview.url}
                                footprint={heroPreview.footprint}
                                scaleMultiplier={heroPreview.scaleMultiplier}
                                fixZUp={heroPreview.fixZUp}
                                showBase
                                baseStyle={heroPreview.baseStyle}
                                finish={heroPreview.finish}
                                color={playerHeroColor || heroPreview.color}
                                isPropOnly={false}
                                label={heroPreview.name}
                                sizePx={72}
                              />
                            ) : null;
                          })()}
                          <select
                            value={playerHeroAssetId}
                            onChange={(e) => {
                              setPlayerHeroAssetId(e.target.value);
                              setPlayerCustomFile(null);
                            }}
                            className="px-2.5 py-1.5 text-xs bg-[#161b24] border border-stone-700 rounded-lg text-stone-200"
                          >
                            {CURATED_3D_CATALOG.filter((c) => c.category === 'character').map((c) => (
                              <option key={c.id} value={c.id}>
                                Xadrez .STL: {c.name}
                              </option>
                            ))}
                          </select>

                          <input
                            ref={playerFileInputRef}
                            type="file"
                            accept=".stl,.obj,.glb,.gltf"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) setPlayerCustomFile(f);
                              e.target.value = '';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => playerFileInputRef.current?.click()}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[#181d27] hover:bg-[#222938] border border-stone-700 rounded-lg text-stone-200 cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5 text-amber-400" />
                            <span>
                              {playerCustomFile ? playerCustomFile.name.slice(0, 16) : 'Ou .STL/.GLB'}
                            </span>
                          </button>
                        </>
                      )}

                      <div className="flex items-center gap-1">
                        {MINI_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setPlayerHeroColor(c)}
                            aria-label={`Cor ${c}`}
                            className={`w-4 h-4 rounded-full border cursor-pointer ${
                              playerHeroColor === c
                                ? 'border-white scale-110'
                                : 'border-transparent opacity-70'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5 ml-auto">
                        <button
                          type="button"
                          onClick={() => setShowPlayerCreator(false)}
                          className="px-2.5 py-1.5 text-xs text-stone-400 hover:text-stone-200 cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={playerCreating}
                          onClick={handlePlayerCreateOwnCharacter}
                          className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-stone-950 rounded-lg cursor-pointer"
                        >
                          {playerCreating
                            ? 'Criando...'
                            : playerTokenMode === 'tazo'
                            ? 'Criar Tazo & Abrir Ficha'
                            : 'Colocar na Mesa & Abrir Ficha'}
                        </button>
                      </div>
                    </div>

                    {playerCreateError && (
                      <div className="text-xs text-rose-300 bg-rose-950/60 border border-rose-500/40 rounded px-2.5 py-1">
                        {playerCreateError}
                      </div>
                    )}
                  </div>
                )}

                {toolMode === 'measure' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-cyan-500/30">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-cyan-300 mr-1">Regra:</span>
                      {MEASURE_RULES.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          title={r.shortDesc}
                          onClick={() => onSetMeasureRule(r.id)}
                          className={`px-2.5 py-1 text-xs rounded-lg border transition-colors cursor-pointer ${
                            measureRule === r.id
                              ? 'bg-cyan-950/70 border-cyan-400 text-cyan-200 font-medium'
                              : 'bg-[#181d27] border-stone-700 text-stone-300 hover:border-stone-500'
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSetMeasureSnap(!measureSnap)}
                        className={`px-2.5 py-1 text-xs rounded-lg border cursor-pointer ${
                          measureSnap
                            ? 'bg-cyan-950/60 border-cyan-500/60 text-cyan-200'
                            : 'bg-[#181d27] border-stone-700 text-stone-300'
                        }`}
                      >
                        {measureSnap ? 'Encaixe: Grade 1x1' : 'Encaixe: Livre'}
                      </button>

                      <button
                        type="button"
                        onClick={() => onSetMeasureShare(!measureShare)}
                        className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border cursor-pointer ${
                          measureShare
                            ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
                            : 'bg-[#181d27] border-stone-700 text-stone-400'
                        }`}
                      >
                        {measureShare ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        <span>{measureShare ? 'Visivel na Mesa' : 'Apenas Voce'}</span>
                      </button>

                      {localRuler && (
                        <button
                          type="button"
                          onClick={onClearRuler}
                          className="px-2.5 py-1 text-xs bg-[#181d27] hover:bg-stone-700 border border-stone-600 rounded-lg text-stone-200 cursor-pointer"
                        >
                          Limpar (Esc)
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

      {/* 🌀 Modal de Confirmação de Área de Transferência / Portal */}
      {activePortalPrompt && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md p-6 bg-[#10141d] border border-cyan-500/60 rounded-2xl shadow-2xl text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 mx-auto rounded-full bg-cyan-950/80 border border-cyan-400 flex items-center justify-center text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.4)]">
              <DoorOpen className="w-7 h-7 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-cyan-200">Área de Transferência / Portal</h3>
              <p className="text-sm text-stone-300 mt-1">
                <span className="font-semibold text-white">{activePortalPrompt.miniName}</span> pisou no portal{' '}
                <span className="font-semibold text-cyan-300">"{activePortalPrompt.portal.label || 'Portal'}"</span>!
              </p>
              <div className="mt-3 p-3 bg-[#182030] rounded-xl border border-cyan-900/60 text-xs text-stone-300">
                <span>Destino: </span>
                <span className="font-semibold text-cyan-300">
                  {activePortalPrompt.portal.targetMapName || activePortalPrompt.portal.targetMap || 'Cenário de Destino'}
                </span>
                <span className="text-stone-400 ml-2">
                  (Chegada em X: {activePortalPrompt.portal.targetX ?? 0}, Z: {activePortalPrompt.portal.targetZ ?? 0})
                </span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onCancelPortalTeleport}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
              >
                Ficar Aqui
              </button>
              <button
                type="button"
                onClick={onConfirmPortalTeleport}
                className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-stone-950 text-xs font-bold rounded-xl shadow-lg shadow-cyan-600/30 cursor-pointer transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>Entrar no Portal</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 💾 Modal Salvar Cenário Atual */}
      {showSaveScenarioModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md p-6 bg-[#10141d] border border-emerald-500/50 rounded-2xl shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
                <Save className="w-5 h-5" />
                <span>Salvar Cenário Atual</span>
              </div>
              <button
                type="button"
                onClick={() => setShowSaveScenarioModal(false)}
                className="p-1 text-stone-400 hover:text-stone-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-stone-300 mb-1 font-medium">Nome do Cenário:</label>
                <input
                  type="text"
                  value={newScenarioName}
                  onChange={(e) => setNewScenarioName(e.target.value)}
                  placeholder="Ex: Tumba do Faraó Negro, Andar 2"
                  className="w-full px-3 py-2 bg-[#181d27] border border-stone-700 rounded-lg text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="block text-stone-300 mb-1 font-medium">Descrição (opcional):</label>
                <textarea
                  value={newScenarioDesc}
                  onChange={(e) => setNewScenarioDesc(e.target.value)}
                  placeholder="Ex: Sala com armadilhas de fogo e portais de saída..."
                  rows={2}
                  className="w-full px-3 py-2 bg-[#181d27] border border-stone-700 rounded-lg text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-emerald-400 resize-none"
                />
              </div>
              <p className="text-[11px] text-stone-400">
                Serão salvos: relevo de elevação, tipos de piso, props 3D, música ambiente e marcadores táticos. Os heróis dos jogadores permanecerão protegidos na transição!
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-800">
              <button
                type="button"
                onClick={() => setShowSaveScenarioModal(false)}
                className="px-3.5 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newScenarioName.trim()) return;
                  onSaveCurrentScenario?.(newScenarioName.trim(), newScenarioDesc.trim());
                  setShowSaveScenarioModal(false);
                  showToast(`Cenário "${newScenarioName}" salvo com sucesso!`);
                }}
                disabled={!newScenarioName.trim()}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-stone-950 text-xs font-bold rounded-lg shadow cursor-pointer transition-colors flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Agora</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📁 Modal Gerenciador de Cenários */}
      {showScenarioManagerModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl p-6 bg-[#10141d] border border-stone-700/80 rounded-2xl shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3 shrink-0">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
                <FolderPlus className="w-5 h-5" />
                <span>Gerenciador de Cenários & Mapas ({savedScenarios.length})</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={scenarioImportInputRef}
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      onImportScenario?.(f);
                      e.target.value = '';
                      showToast('Cenário importado com sucesso!');
                    }
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => scenarioImportInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#181d27] hover:bg-stone-700 border border-stone-700 rounded-lg text-xs text-stone-200 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Importar Cenário (.JSON)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowScenarioManagerModal(false)}
                  className="p-1 text-stone-400 hover:text-stone-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {savedScenarios.length === 0 ? (
                <div className="p-8 text-center bg-[#0c0f15] border border-dashed border-stone-800 rounded-xl space-y-2">
                  <p className="text-sm text-stone-400">Você ainda não tem cenários salvos no navegador.</p>
                  <p className="text-xs text-stone-500">
                    Crie seu mapa (esculpindo relevo, adicionando pinheiros, muros e tochas) e clique em "Salvar Cenário" na aba Terreno.
                  </p>
                </div>
              ) : (
                savedScenarios.map((sc) => (
                  <div
                    key={sc.id}
                    className="p-3.5 bg-[#141923] border border-stone-800 hover:border-amber-500/40 rounded-xl flex items-center justify-between gap-4 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-stone-100 text-sm">{sc.name}</span>
                        <span className="text-[10px] px-2 py-0.5 bg-stone-800 rounded text-stone-400">
                          {Object.keys(sc.tiles || {}).length} blocos · {Object.keys(sc.miniatures || {}).length} props 3D
                        </span>
                      </div>
                      {sc.description && (
                        <p className="text-xs text-stone-400 line-clamp-1">{sc.description}</p>
                      )}
                      <p className="text-[10px] text-stone-500">
                        Salvo em {new Date(sc.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onLoadScenario?.(sc.id);
                          setShowScenarioManagerModal(false);
                          showToast(`Cenário "${sc.name}" carregado na mesa!`);
                        }}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs rounded-lg cursor-pointer transition-colors shadow"
                      >
                        Carregar na Mesa
                      </button>
                      <button
                        type="button"
                        onClick={() => onExportScenario?.(sc)}
                        title="Baixar arquivo .JSON deste cenário"
                        className="p-1.5 bg-[#181d27] hover:bg-stone-700 border border-stone-700 rounded-lg text-stone-300 hover:text-white cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Deseja realmente excluir o cenário "${sc.name}"?`)) {
                            onDeleteScenario?.(sc.id);
                            showToast(`Cenário "${sc.name}" excluído.`);
                          }
                        }}
                        title="Excluir cenário"
                        className="p-1.5 bg-rose-950/40 hover:bg-rose-900 border border-rose-500/30 rounded-lg text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🗺️ Modal para Criar Novo Mapa na Mesa */}
      {showAddMapModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md p-6 bg-[#10141d] border border-amber-500/60 rounded-2xl shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <Map className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-amber-200">Adicionar Novo Mapa à Mesa</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddMapModal(false)}
                className="text-stone-400 hover:text-stone-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-stone-200">
              <div>
                <label className="block text-stone-400 mb-1 font-medium">Nome do Mapa / Cenário:</label>
                <input
                  type="text"
                  placeholder="Ex: Cripta Subterrânea, Taverna do Pônei..."
                  value={newMapName}
                  onChange={(e) => setNewMapName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#161c28] border border-stone-700 rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-stone-400 mb-1 font-medium">Modelo / Origem do Mapa:</label>
                <select
                  value={newMapTemplate}
                  onChange={(e) => setNewMapTemplate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#161c28] border border-stone-700 rounded-xl text-stone-100 focus:outline-none focus:border-amber-400"
                >
                  <optgroup label="── Modelos Prontos ──">
                    <option value="tavern">Taverna de Whiterun</option>
                    <option value="crypt">Cripta Nórdica</option>
                    <option value="arena">Pico dos Dragões</option>
                    <option value="dungeon-gate">Portão da Masmorra</option>
                    <option value="blank">Tabuleiro Limpo (Vazio)</option>
                  </optgroup>
                  {savedScenarios.length > 0 && (
                    <optgroup label="── Seus Cenários Salvos na Biblioteca ──">
                      {savedScenarios.map((sc) => (
                        <option key={sc.id} value={`saved:${sc.id}`}>
                          🗺️ {sc.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <p className="text-[11px] text-stone-400">
                O novo mapa será adicionado à lista da mesa. Você e os jogadores poderão alternar entre mapas ou transferir personagens entre eles.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-800">
              <button
                type="button"
                onClick={() => setShowAddMapModal(false)}
                className="px-3 py-1.5 text-xs text-stone-400 hover:text-stone-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const title = newMapName.trim() || 'Novo Mapa';
                  const sceneId = `scene-${Date.now()}`;
                  let tiles = {};
                  let annotations = {};
                  let presetName: MapPresetId = 'tavern';

                  if (newMapTemplate.startsWith('saved:')) {
                    const savedId = newMapTemplate.replace('saved:', '');
                    const sc = savedScenarios.find((s) => s.id === savedId);
                    if (sc) {
                      tiles = JSON.parse(JSON.stringify(sc.tiles || {}));
                      annotations = JSON.parse(JSON.stringify(sc.annotations || {}));
                    }
                  } else {
                    presetName = (newMapTemplate || 'tavern') as MapPresetId;
                    const built = buildMapPreset(presetName);
                    tiles = built.tiles;
                    annotations = built.annotations;
                  }

                  const newScene: RoomScene = {
                    id: sceneId,
                    name: title,
                    presetName,
                    cols: 20,
                    rows: 20,
                    tiles,
                    annotations,
                  };

                  onCreateScene?.(newScene);
                  setShowAddMapModal(false);
                  showToast(`Mapa "${title}" criado com sucesso!`);
                }}
                className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl shadow cursor-pointer transition-colors"
              >
                Criar e Ir para o Mapa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🍞 Toast Informativo Flutuante */}
      {libraryToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[130] px-4 py-2 bg-emerald-600 text-stone-950 font-bold text-xs rounded-full shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          {libraryToast}
        </div>
      )}
    </>
  );
};
