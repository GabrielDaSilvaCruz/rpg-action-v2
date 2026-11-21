import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, testConnection } from './firebase';
import {
  listMyFirestoreRooms,
  loadRoomFromFirestore,
  saveRoomToFirestore,
  signInWithGoogleAccount,
  signOutGoogleAccount,
} from './services/firestoreSync';
import {
  CharacterSheet,
  ClientMessage,
  DiceRollEvent,
  MapAnnotation,
  MapPresetId,
  MeasureRule,
  MiniatureData,
  Role,
  RoomState,
  ServerMessage,
  TileCell,
  tileKey,
} from './types/vtt';
import { BOARD_COLS, BOARD_ROWS, buildMapPreset } from './utils/mapPresets';
import {
  AnnotationBrush,
  CameraPreset,
  RulerLineCoords,
  SculptBrush,
  TabletopViewport,
  ViewportContextMenuTarget,
} from './components/TabletopViewport';
import { EntryLobby } from './components/EntryLobby';
import { TabletopHUD } from './components/TabletopHUD';
import { BoardContextMenu, ClipboardBoardItem } from './components/BoardContextMenu';
import { CharacterSheetModal } from './components/CharacterSheetModal';
import { VoiceVideoDock } from './components/VoiceVideoDock';
import { webrtc } from './engine/webrtcManager';
import { audioSynth } from './engine/audioSynth';
import {
  MAX_MAP_HISTORY,
  MapHistoryEntry,
  MapSnapshot,
  pushHistoryEntry,
} from './utils/mapHistory';
import { wsUrl } from './utils/backendUrl';
import { getSavedPlayerProfile, savePlayerProfile } from './utils/cookieStorage';

function cloneSnapshot(
  presetName: MapPresetId,
  tiles: Record<string, TileCell>,
  miniatures: Record<string, MiniatureData>,
  annotations: Record<string, MapAnnotation>
): MapSnapshot {
  return {
    presetName,
    tiles: structuredClone(tiles),
    miniatures: structuredClone(miniatures),
    annotations: structuredClone(annotations || {}),
  };
}

function getInitialRoomFromUrl(): string {
  if (typeof window === 'undefined') return 'MESA-01';
  const params = new URLSearchParams(window.location.search);
  return (params.get('room') || 'MESA-01').trim().toUpperCase() || 'MESA-01';
}

function createFallbackRoomState(roomId: string): RoomState {
  const initial = buildMapPreset('blank');
  return {
    roomId,
    presetName: 'blank',
    cols: BOARD_COLS,
    rows: BOARD_ROWS,
    tiles: initial.tiles,
    miniatures: initial.miniatures,
    annotations: initial.annotations,
    users: [],
    recentRolls: [],
  };
}

export default function App() {
  const [savedProfile] = useState(() =>
    typeof window !== 'undefined' ? getSavedPlayerProfile() : null
  );
  const [inLobby, setInLobby] = useState(true);
  const [roomId, setRoomId] = useState<string>(
    () => getInitialRoomFromUrl() || savedProfile?.roomId || 'MESA-01'
  );
  const [userName, setUserName] = useState(() => savedProfile?.name || 'Mestre Eldrin');
  const [role, setRole] = useState<Role>(() => savedProfile?.role || 'gm');
  const [userColor, setUserColor] = useState(() => savedProfile?.color || '#d97706');
  const [myUserId, setMyUserId] = useState<string>(() => 'u-' + Math.random().toString(36).substring(2, 9));
  const [gmLayer, setGmLayer] = useState<'all' | 'characters' | 'props'>('all');

  const [roomState, setRoomState] = useState<RoomState>(() =>
    createFallbackRoomState(getInitialRoomFromUrl())
  );
  const [connected, setConnected] = useState(false);

  const [toolMode, setToolMode] = useState<'interact' | 'sculpt' | 'annotate' | 'measure'>('interact');
  const [sculptBrush, setSculptBrush] = useState<SculptBrush>({
    terrain: 'stone',
    elevation: 1,
    prop: 'none',
    propRotation: 0,
    erase: false,
  });
  const [annotationBrush, setAnnotationBrush] = useState<AnnotationBrush>({
    kind: 'marker',
    radius: 1.5,
    rotationY: 0,
    color: '#f59e0b',
    label: 'Tesouro Oculto',
    gmOnly: true,
  });
  const [measureRule, setMeasureRule] = useState<MeasureRule>('dnd5e');
  const [measureSnap, setMeasureSnap] = useState(true);
  const [measureShare, setMeasureShare] = useState(true);
  const [localRuler, setLocalRuler] = useState<RulerLineCoords | null>(null);
  const [selectedMiniId, setSelectedMiniId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    z: number;
    distanceCells: number | null;
  } | null>(null);
  const [cameraCommand, setCameraCommand] = useState<{
    preset: CameraPreset;
    seq: number;
  } | null>(null);
  const [muted, setMuted] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<MapHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<MapHistoryEntry[]>([]);
  const [clipboardItem, setClipboardItem] = useState<ClipboardBoardItem | null>(null);
  const [contextMenu, setContextMenu] = useState<ViewportContextMenuTarget | null>(null);
  const [sheetMiniId, setSheetMiniId] = useState<string | null>(null);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudSavedAt, setCloudSavedAt] = useState<number | null>(null);
  const [savedRooms, setSavedRooms] = useState<
    { roomId: string; presetName: string; gmName: string }[]
  >([]);

  const wsRef = useRef<WebSocket | null>(null);
  const lastRulerBroadcastRef = useRef<number>(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const pendingCloudHydrateRef = useRef<boolean>(false);
  const cloudInitializedRef = useRef<boolean>(false);
  const roomStateRef = useRef<RoomState>(roomState);
  roomStateRef.current = roomState;
  const undoStackRef = useRef<MapHistoryEntry[]>(undoStack);
  undoStackRef.current = undoStack;
  const redoStackRef = useRef<MapHistoryEntry[]>(redoStack);
  redoStackRef.current = redoStack;
  const clipboardRef = useRef<ClipboardBoardItem | null>(clipboardItem);
  clipboardRef.current = clipboardItem;
  const selectedMiniIdRef = useRef<string | null>(selectedMiniId);
  selectedMiniIdRef.current = selectedMiniId;
  const selectedAnnotationIdRef = useRef<string | null>(selectedAnnotationId);
  selectedAnnotationIdRef.current = selectedAnnotationId;
  const hoverInfoRef = useRef(hoverInfo);
  hoverInfoRef.current = hoverInfo;
  const activeStrokeRef = useRef<{
    before: Map<string, TileCell>;
    after: Map<string, TileCell>;
  } | null>(null);
  const userSessionRef = useRef({ name: userName, role, color: userColor, roomId });
  userSessionRef.current = { name: userName, role, color: userColor, roomId };

  const recordHistory = useCallback((entry: MapHistoryEntry) => {
    setUndoStack((prev) => pushHistoryEntry(prev, entry));
    setRedoStack([]);
  }, []);

  const showError = useCallback((msg: string) => {
    setErrorToast(msg);
    window.setTimeout(() => {
      setErrorToast((curr) => (curr === msg ? null : curr));
    }, 3200);
  }, []);

  const sendWs = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    webrtc.setSendWs(sendWs);
  }, [sendWs]);

  const refreshSavedRooms = useCallback(async () => {
    try {
      const list = await listMyFirestoreRooms();
      setSavedRooms(list);
    } catch {
      // ignore list errors before user creates rooms
    }
  }, []);

  useEffect(() => {
    testConnection();
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user && user.emailVerified) {
        refreshSavedRooms();
      } else {
        setSavedRooms([]);
      }
    });
    return () => unsub();
  }, [refreshSavedRooms]);

  const handleGoogleSignIn = useCallback(async () => {
    try {
      const user = await signInWithGoogleAccount();
      setFirebaseUser(user);
      await refreshSavedRooms();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Falha ao conectar conta Google.');
    }
  }, [refreshSavedRooms, showError]);

  const handleGoogleSignOut = useCallback(async () => {
    try {
      await signOutGoogleAccount();
      setFirebaseUser(null);
      setSavedRooms([]);
      setCloudSavedAt(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Falha ao desconectar conta.');
    }
  }, [showError]);

  const handleSaveCloud = useCallback(
    async (silent = false) => {
      const user = auth.currentUser;
      if (!user || !user.emailVerified) {
        if (!silent) showError('Conecte uma conta Google para salvar a mesa na nuvem.');
        return;
      }
      setCloudSyncing(true);
      try {
        const res = await saveRoomToFirestore(
          roomStateRef.current,
          userSessionRef.current.role,
          userSessionRef.current.name
        );
        setCloudSavedAt(res.savedAt);
        if (userSessionRef.current.role === 'gm') {
          refreshSavedRooms();
        }
      } catch (err) {
        if (!silent) {
          showError(err instanceof Error ? err.message : 'Erro ao salvar no banco Firestore.');
        }
      } finally {
        setCloudSyncing(false);
      }
    },
    [refreshSavedRooms, showError]
  );

  const handleLoadCloud = useCallback(
    async (silentIfMissing = false) => {
      const user = auth.currentUser;
      if (!user || !user.emailVerified) {
        if (!silentIfMissing) showError('Conecte uma conta Google para carregar da nuvem.');
        return;
      }
      setCloudSyncing(true);
      try {
        const loaded = await loadRoomFromFirestore(userSessionRef.current.roomId);
        if (!loaded) {
          if (!silentIfMissing) {
            showError('Nenhuma campanha salva na nuvem para esta sala ainda.');
          }
          return;
        }
        setRoomState((prev) => ({
          ...prev,
          presetName: loaded.presetName,
          tiles: loaded.tiles,
          miniatures: loaded.miniatures,
          annotations: loaded.annotations,
          music: loaded.music ?? prev.music,
        }));
        sendWs({
          type: 'map:restore',
          payload: {
            presetName: loaded.presetName,
            tiles: loaded.tiles,
            miniatures: loaded.miniatures,
            annotations: loaded.annotations,
          },
        });
        if (loaded.music && loaded.music.videoId && userSessionRef.current.role === 'gm') {
          sendWs({
            type: 'music:control',
            payload: {
              action: 'set_and_play',
              videoId: loaded.music.videoId,
              title: loaded.music.title,
              positionSec: loaded.music.positionSec || 0,
            },
          });
        }
        setCloudSavedAt(Date.now());
      } catch (err) {
        if (!silentIfMissing) {
          showError(err instanceof Error ? err.message : 'Erro ao carregar mesa da nuvem.');
        }
      } finally {
        setCloudSyncing(false);
      }
    },
    [sendWs, showError]
  );

  const applyHistoryEntry = useCallback(
    (entry: MapHistoryEntry, direction: 'undo' | 'redo') => {
      const isUndo = direction === 'undo';

      switch (entry.kind) {
        case 'tiles': {
          const cells = isUndo ? entry.before : entry.after;
          if (cells.length === 0) return;
          setRoomState((prev) => {
            const nextTiles = { ...prev.tiles };
            for (const c of cells) {
              nextTiles[tileKey(c.x, c.z)] = c;
            }
            return { ...prev, tiles: nextTiles };
          });
          sendWs({ type: 'tile:batch', payload: { cells } });
          break;
        }

        case 'mini-create': {
          if (isUndo) {
            setRoomState((prev) => {
              const nextMinis = { ...prev.miniatures };
              delete nextMinis[entry.mini.id];
              return { ...prev, miniatures: nextMinis };
            });
            setSelectedMiniId((curr) => (curr === entry.mini.id ? null : curr));
            sendWs({ type: 'mini:delete', payload: { id: entry.mini.id } });
          } else {
            setRoomState((prev) => ({
              ...prev,
              miniatures: { ...prev.miniatures, [entry.mini.id]: entry.mini },
            }));
            sendWs({ type: 'mini:create', payload: { mini: entry.mini } });
          }
          break;
        }

        case 'mini-delete': {
          if (isUndo) {
            setRoomState((prev) => ({
              ...prev,
              miniatures: { ...prev.miniatures, [entry.mini.id]: entry.mini },
            }));
            sendWs({ type: 'mini:create', payload: { mini: entry.mini } });
          } else {
            setRoomState((prev) => {
              const nextMinis = { ...prev.miniatures };
              delete nextMinis[entry.mini.id];
              return { ...prev, miniatures: nextMinis };
            });
            setSelectedMiniId((curr) => (curr === entry.mini.id ? null : curr));
            sendWs({ type: 'mini:delete', payload: { id: entry.mini.id } });
          }
          break;
        }

        case 'mini-update': {
          const target = isUndo ? entry.before : entry.after;
          setRoomState((prev) => ({
            ...prev,
            miniatures: { ...prev.miniatures, [entry.id]: target },
          }));
          sendWs({ type: 'mini:update', payload: { id: entry.id, patch: target } });
          break;
        }

        case 'annotation-create': {
          if (isUndo) {
            setRoomState((prev) => {
              const nextAnn = { ...(prev.annotations || {}) };
              delete nextAnn[entry.annotation.id];
              return { ...prev, annotations: nextAnn };
            });
            setSelectedAnnotationId((curr) => (curr === entry.annotation.id ? null : curr));
            sendWs({ type: 'annotation:delete', payload: { id: entry.annotation.id } });
          } else {
            setRoomState((prev) => ({
              ...prev,
              annotations: {
                ...(prev.annotations || {}),
                [entry.annotation.id]: entry.annotation,
              },
            }));
            sendWs({ type: 'annotation:create', payload: { annotation: entry.annotation } });
          }
          break;
        }

        case 'annotation-delete': {
          if (isUndo) {
            setRoomState((prev) => ({
              ...prev,
              annotations: {
                ...(prev.annotations || {}),
                [entry.annotation.id]: entry.annotation,
              },
            }));
            sendWs({ type: 'annotation:create', payload: { annotation: entry.annotation } });
          } else {
            setRoomState((prev) => {
              const nextAnn = { ...(prev.annotations || {}) };
              delete nextAnn[entry.annotation.id];
              return { ...prev, annotations: nextAnn };
            });
            setSelectedAnnotationId((curr) => (curr === entry.annotation.id ? null : curr));
            sendWs({ type: 'annotation:delete', payload: { id: entry.annotation.id } });
          }
          break;
        }

        case 'annotation-update': {
          const target = isUndo ? entry.before : entry.after;
          setRoomState((prev) => ({
            ...prev,
            annotations: { ...(prev.annotations || {}), [entry.id]: target },
          }));
          sendWs({ type: 'annotation:update', payload: { id: entry.id, patch: target } });
          break;
        }

        case 'preset': {
          const snap = isUndo ? entry.before : entry.after;
          const cloned = cloneSnapshot(
            snap.presetName,
            snap.tiles,
            snap.miniatures,
            snap.annotations
          );
          setRoomState((prev) => ({
            ...prev,
            presetName: cloned.presetName,
            tiles: cloned.tiles,
            miniatures: cloned.miniatures,
            annotations: cloned.annotations,
          }));
          setSelectedMiniId(null);
          setSelectedAnnotationId(null);
          sendWs({ type: 'map:restore', payload: cloned });
          break;
        }
      }
    },
    [sendWs]
  );

  const handleUndo = useCallback(() => {
    if (userSessionRef.current.role !== 'gm') return;
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const entry = stack[stack.length - 1];
    setUndoStack(stack.slice(0, -1));
    setRedoStack((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_MAP_HISTORY ? next.slice(next.length - MAX_MAP_HISTORY) : next;
    });
    applyHistoryEntry(entry, 'undo');
    audioSynth.playTilePlace();
  }, [applyHistoryEntry]);

  const handleRedo = useCallback(() => {
    if (userSessionRef.current.role !== 'gm') return;
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const entry = stack[stack.length - 1];
    setRedoStack(stack.slice(0, -1));
    setUndoStack((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_MAP_HISTORY ? next.slice(next.length - MAX_MAP_HISTORY) : next;
    });
    applyHistoryEntry(entry, 'redo');
    audioSynth.playTilePlace();
  }, [applyHistoryEntry]);

  const handleCopyMini = useCallback((mini: MiniatureData) => {
    setClipboardItem({ kind: 'mini', data: structuredClone(mini) });
    audioSynth.playMiniPickup();
  }, []);

  const handleCopyAnnotation = useCallback((annotation: MapAnnotation) => {
    setClipboardItem({ kind: 'annotation', data: structuredClone(annotation) });
    audioSynth.playMiniPickup();
  }, []);

  const handlePasteAt = useCallback(
    (gridX: number, gridZ: number) => {
      if (userSessionRef.current.role !== 'gm') return;
      const item = clipboardRef.current;
      if (!item) return;

      const gx = Math.max(0, Math.min(15, Math.round(gridX)));
      const gz = Math.max(0, Math.min(15, Math.round(gridZ)));

      if (item.kind === 'mini') {
        const offset = item.data.footprint % 2 === 0 ? 0.5 : 0;
        const pasted: MiniatureData = {
          ...structuredClone(item.data),
          id: `mini-${crypto.randomUUID().slice(0, 8)}`,
          x: Math.max(0, Math.min(15.5, gx + offset)),
          z: Math.max(0, Math.min(15.5, gz + offset)),
        };
        recordHistory({
          kind: 'mini-create',
          label: `Colar ${pasted.name}`,
          mini: { ...pasted },
        });
        setRoomState((prev) => ({
          ...prev,
          miniatures: { ...prev.miniatures, [pasted.id]: pasted },
        }));
        setSelectedMiniId(pasted.id);
        setSelectedAnnotationId(null);
        sendWs({ type: 'mini:create', payload: { mini: pasted } });
        audioSynth.playMiniDrop();
      } else {
        const pastedAnn: MapAnnotation = {
          ...structuredClone(item.data),
          id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          x: gx,
          z: gz,
        };
        recordHistory({
          kind: 'annotation-create',
          label: `Colar marcador`,
          annotation: { ...pastedAnn },
        });
        setRoomState((prev) => ({
          ...prev,
          annotations: { ...(prev.annotations || {}), [pastedAnn.id]: pastedAnn },
        }));
        setSelectedAnnotationId(pastedAnn.id);
        setSelectedMiniId(null);
        sendWs({ type: 'annotation:create', payload: { annotation: pastedAnn } });
        audioSynth.playTilePlace();
      }
    },
    [recordHistory, sendWs]
  );

  useEffect(() => {
    if (inLobby || role !== 'gm') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLSelectElement ||
        (document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable)
      ) {
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      } else if (key === 'c') {
        const selMini = selectedMiniIdRef.current
          ? roomStateRef.current.miniatures[selectedMiniIdRef.current]
          : null;
        if (selMini) {
          e.preventDefault();
          handleCopyMini(selMini);
          return;
        }
        const selAnn = selectedAnnotationIdRef.current
          ? roomStateRef.current.annotations?.[selectedAnnotationIdRef.current]
          : null;
        if (selAnn) {
          e.preventDefault();
          handleCopyAnnotation(selAnn);
        }
      } else if (key === 'v') {
        const clip = clipboardRef.current;
        if (!clip) return;
        e.preventDefault();
        const hover = hoverInfoRef.current;
        const targetX = hover ? hover.x : Math.min(15, Math.round(clip.data.x) + 1);
        const targetZ = hover ? hover.z : Math.round(clip.data.z);
        handlePasteAt(targetX, targetZ);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inLobby, role, handleUndo, handleRedo, handleCopyMini, handleCopyAnnotation, handlePasteAt]);

  useEffect(() => {
    let closedByCleanup = false;

    const connect = () => {
      const url = wsUrl(`/ws?room=${encodeURIComponent(userSessionRef.current.roomId)}`);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        webrtc.setMyUserId(myUserId);
        ws.send(
          JSON.stringify({
            type: 'user:join',
            payload: {
              id: myUserId,
              name: userSessionRef.current.name,
              role: userSessionRef.current.role,
              color: userSessionRef.current.color,
            },
          } satisfies ClientMessage)
        );
      };

      ws.onmessage = (evt) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(evt.data) as ServerMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'user:self':
            if (msg.payload?.user?.id) {
              setMyUserId(msg.payload.user.id);
              webrtc.setMyUserId(msg.payload.user.id);
            }
            break;

          case 'webrtc:signal':
            void webrtc.handleSignal(msg.payload.senderUserId, msg.payload.signal);
            break;

          case 'webrtc:state_updated':
            webrtc.updateRemoteUserState(msg.payload.userId, msg.payload);
            setRoomState((prev) => ({
              ...prev,
              users: prev.users.map((u) =>
                u.id === msg.payload.userId ? { ...u, ...msg.payload } : u
              ),
            }));
            break;

          case 'room:state': {
            const hasServerData =
              msg.payload &&
              (Object.keys(msg.payload.tiles || {}).length > 0 ||
                Object.keys(msg.payload.miniatures || {}).length > 0);

            if (hasServerData) {
              setRoomState(msg.payload);
            } else if (userSessionRef.current.role === 'gm') {
              const defaultPreset = buildMapPreset('dungeon-gate');
              const initialSnap = {
                presetName: 'dungeon-gate' as MapPresetId,
                cols: BOARD_COLS,
                rows: BOARD_ROWS,
                tiles: defaultPreset.tiles,
                miniatures: defaultPreset.miniatures,
                annotations: defaultPreset.annotations,
              };
              setRoomState((prev) => ({
                ...prev,
                ...initialSnap,
                users: msg.payload?.users || prev.users,
              }));
              sendWs({
                type: 'map:restore',
                payload: initialSnap,
              });
            } else {
              setRoomState(msg.payload);
            }
            cloudInitializedRef.current = true;
            break;
          }

          case 'map:restored':
          case 'room:preset_applied':
            setRoomState((prev) => ({
              ...prev,
              presetName: msg.payload.presetName || prev.presetName,
              tiles: msg.payload.tiles || prev.tiles,
              miniatures: msg.payload.miniatures || prev.miniatures,
              annotations: msg.payload.annotations || prev.annotations,
              cols: msg.payload.cols || prev.cols,
              rows: msg.payload.rows || prev.rows,
            }));
            break;

          case 'user:list':
            setRoomState((prev) => ({ ...prev, users: msg.payload.users }));
            webrtc.syncRoomUsers(msg.payload.users);
            break;

          case 'tile:updated':
            setRoomState((prev) => {
              const nextTiles = { ...prev.tiles };
              if ((msg.payload as any).cell) {
                const c = (msg.payload as any).cell;
                nextTiles[tileKey(c.x, c.z)] = c;
              }
              if (Array.isArray(msg.payload.cells)) {
                for (const cell of msg.payload.cells) {
                  nextTiles[tileKey(cell.x, cell.z)] = cell;
                }
              }
              return { ...prev, tiles: nextTiles };
            });
            break;

          case 'tile:batch_updated':
            setRoomState((prev) => {
              const nextTiles = { ...prev.tiles };
              if (Array.isArray(msg.payload.cells)) {
                for (const cell of msg.payload.cells) {
                  nextTiles[tileKey(cell.x, cell.z)] = cell;
                }
              }
              return { ...prev, tiles: nextTiles };
            });
            break;

          case 'mini:created':
          case 'mini:added': {
            const m = msg.payload.mini || (msg.payload as any).miniature;
            if (!m) break;
            setRoomState((prev) => {
              if (prev.miniatures[m.id]) return prev;
              return {
                ...prev,
                miniatures: {
                  ...prev.miniatures,
                  [m.id]: m,
                },
              };
            });
            break;
          }

          case 'mini:updated':
            setRoomState((prev) => ({
              ...prev,
              miniatures: {
                ...prev.miniatures,
                [msg.payload.mini.id]: msg.payload.mini,
              },
            }));
            break;

          case 'mini:moved':
            setRoomState((prev) => {
              const existing = prev.miniatures[msg.payload.id];
              if (!existing) return prev;
              return {
                ...prev,
                miniatures: {
                  ...prev.miniatures,
                  [msg.payload.id]: {
                    ...existing,
                    x: msg.payload.x,
                    z: msg.payload.z,
                    rotationY: msg.payload.rotationY,
                  },
                },
              };
            });
            break;

          case 'mini:deleted':
            setRoomState((prev) => {
              if (!prev.miniatures[msg.payload.id]) return prev;
              const nextMinis = { ...prev.miniatures };
              delete nextMinis[msg.payload.id];
              return { ...prev, miniatures: nextMinis };
            });
            setSelectedMiniId((curr) => (curr === msg.payload.id ? null : curr));
            setSheetMiniId((curr) => (curr === msg.payload.id ? null : curr));
            break;

          case 'annotation:created':
            setRoomState((prev) => {
              if (prev.annotations?.[msg.payload.annotation.id]) return prev;
              return {
                ...prev,
                annotations: {
                  ...(prev.annotations || {}),
                  [msg.payload.annotation.id]: msg.payload.annotation,
                },
              };
            });
            break;

          case 'annotation:updated':
            setRoomState((prev) => ({
              ...prev,
              annotations: {
                ...(prev.annotations || {}),
                [msg.payload.annotation.id]: msg.payload.annotation,
              },
            }));
            break;

          case 'annotation:deleted':
            setRoomState((prev) => {
              if (!prev.annotations?.[msg.payload.id]) return prev;
              const nextAnnotations = { ...prev.annotations };
              delete nextAnnotations[msg.payload.id];
              return { ...prev, annotations: nextAnnotations };
            });
            setSelectedAnnotationId((curr) => (curr === msg.payload.id ? null : curr));
            break;

          case 'ruler:updated':
            setRoomState((prev) => {
              const nextRulers = { ...(prev.rulers || {}) };
              const r = msg.payload.ruler;
              if (r.active) {
                nextRulers[r.userId] = r;
              } else {
                delete nextRulers[r.userId];
              }
              return { ...prev, rulers: nextRulers };
            });
            break;

          case 'music:updated':
          case 'music:state': {
            const nextMusic =
              msg.payload && typeof msg.payload === 'object' && 'music' in msg.payload
                ? (msg.payload as any).music
                : msg.payload;
            setRoomState((prev) => ({
              ...prev,
              music: nextMusic,
            }));
            break;
          }

          case 'dice:rolled':
            audioSynth.playDiceRoll();
            setRoomState((prev) => ({
              ...prev,
              recentRolls: [msg.payload.roll, ...(prev.recentRolls || [])].slice(0, 50),
            }));
            break;

          case 'combat:updated':
            setRoomState((prev) => ({
              ...prev,
              combat: msg.payload.combat,
            }));
            break;

          case 'error':
            showError(msg.payload.message);
            break;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!closedByCleanup) {
          reconnectTimerRef.current = window.setTimeout(connect, 1800);
        }
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      webrtc.destroy();
    };
  }, [inLobby, roomId, showError]);

  // Debounced auto-save to Firestore whenever room state mutates (when signed in)
  useEffect(() => {
    if (inLobby || !cloudInitializedRef.current) return;
    if (!firebaseUser || !firebaseUser.emailVerified) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      void handleSaveCloud(true);
    }, 2400);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [
    inLobby,
    firebaseUser,
    roomState.presetName,
    roomState.tiles,
    roomState.miniatures,
    roomState.annotations,
    roomState.music,
    handleSaveCloud,
  ]);

  const handleEnterRoom = (config: {
    name: string;
    roomId: string;
    role: Role;
    color: string;
    loadFromCloud?: boolean;
  }) => {
    savePlayerProfile({
      name: config.name,
      role: config.role,
      color: config.color,
      roomId: config.roomId,
    });
    setUserName(config.name);
    setRoomId(config.roomId);
    setRole(config.role);
    setUserColor(config.color);
    setToolMode('interact');
    setUndoStack([]);
    setRedoStack([]);
    setClipboardItem(null);
    setContextMenu(null);
    setSheetMiniId(null);
    activeStrokeRef.current = null;
    cloudInitializedRef.current = false;
    pendingCloudHydrateRef.current = Boolean(config.loadFromCloud);
    const url = new URL(window.location.href);
    url.searchParams.set('room', config.roomId);
    window.history.replaceState({}, '', url.toString());
    setInLobby(false);
  };

  const handleSwitchRole = (nextRole: Role) => {
    setRole(nextRole);
    if (nextRole === 'player') {
      setContextMenu(null);
      if (toolMode === 'sculpt' || toolMode === 'annotate') {
        setToolMode('interact');
        setSelectedAnnotationId(null);
      }
    }
    sendWs({
      type: 'user:join',
      payload: { name: userName, role: nextRole, color: userColor },
    });
  };

  const handleSculptStrokeStart = useCallback(() => {
    if (userSessionRef.current.role !== 'gm') return;
    activeStrokeRef.current = { before: new Map(), after: new Map() };
  }, []);

  const handleSculptStrokeEnd = useCallback(() => {
    const stroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    if (!stroke || stroke.after.size === 0) return;
    const count = stroke.after.size;
    recordHistory({
      kind: 'tiles',
      label: `Esculpir mapa (${count} ${count === 1 ? 'bloco' : 'blocos'})`,
      before: Array.from(stroke.before.values()),
      after: Array.from(stroke.after.values()),
    });
  }, [recordHistory]);

  const handlePaintTile = useCallback(
    (cell: TileCell) => {
      if (userSessionRef.current.role !== 'gm') return;
      const key = tileKey(cell.x, cell.z);
      const prevCell: TileCell = roomStateRef.current.tiles[key] || {
        x: cell.x,
        z: cell.z,
        terrain: 'void',
        elevation: 0,
        prop: 'none',
        propRotation: 0,
      };

      if (
        prevCell.terrain === cell.terrain &&
        prevCell.elevation === cell.elevation &&
        prevCell.prop === cell.prop &&
        prevCell.propRotation === cell.propRotation
      ) {
        return;
      }

      const stroke = activeStrokeRef.current;
      if (stroke) {
        if (!stroke.before.has(key)) {
          stroke.before.set(key, { ...prevCell });
        }
        stroke.after.set(key, { ...cell });
      } else {
        recordHistory({
          kind: 'tiles',
          label: cell.terrain === 'void' ? 'Apagar bloco' : 'Pintar bloco',
          before: [{ ...prevCell }],
          after: [{ ...cell }],
        });
      }

      setRoomState((prev) => ({
        ...prev,
        tiles: { ...prev.tiles, [key]: cell },
      }));
      sendWs({ type: 'tile:set', payload: { cell } });
    },
    [recordHistory, sendWs]
  );

  const handleMoveMini = useCallback(
    (id: string, x: number, z: number, rotationY?: number) => {
      const existing = roomStateRef.current.miniatures[id];
      if (!existing) return;
      if (role === 'player') {
        if (existing.isPropOnly || existing.ownerName === '__GM__') return;
        if (
          existing.ownerName &&
          existing.ownerName.toLowerCase() !== userName.toLowerCase()
        ) {
          return;
        }
      }

      const nextMini: MiniatureData = {
        ...existing,
        x,
        z,
        rotationY: typeof rotationY === 'number' ? rotationY : existing.rotationY,
      };

      if (
        role === 'gm' &&
        (existing.x !== nextMini.x ||
          existing.z !== nextMini.z ||
          existing.rotationY !== nextMini.rotationY)
      ) {
        recordHistory({
          kind: 'mini-update',
          label: `Mover ${existing.name}`,
          id,
          before: { ...existing },
          after: nextMini,
          timestamp: Date.now(),
        });
      }

      setRoomState((prev) => {
        if (!prev.miniatures[id]) return prev;
        return {
          ...prev,
          miniatures: {
            ...prev.miniatures,
            [id]: nextMini,
          },
        };
      });
      sendWs({ type: 'mini:move', payload: { id, x, z, rotationY } });
    },
    [role, userName, recordHistory, sendWs]
  );

  const handleCreateMini = useCallback(
    (mini: MiniatureData) => {
      const enrichedMini: MiniatureData =
        !mini.ownerUid && firebaseUser?.uid ? { ...mini, ownerUid: firebaseUser.uid } : mini;
      if (role === 'gm') {
        recordHistory({
          kind: 'mini-create',
          label: `Adicionar ${enrichedMini.name}`,
          mini: { ...enrichedMini },
        });
      }
      setRoomState((prev) => ({
        ...prev,
        miniatures: { ...prev.miniatures, [enrichedMini.id]: enrichedMini },
      }));
      sendWs({ type: 'mini:create', payload: { mini: enrichedMini } });
    },
    [role, firebaseUser?.uid, recordHistory, sendWs]
  );

  const handleUpdateMini = useCallback(
    (id: string, patch: Partial<MiniatureData>) => {
      const existing = roomStateRef.current.miniatures[id];
      if (!existing) return;
      const nextMini: MiniatureData = { ...existing, ...patch };
      if (role === 'gm') {
        recordHistory({
          kind: 'mini-update',
          label: `Editar ${existing.name}`,
          id,
          before: { ...existing },
          after: nextMini,
          timestamp: Date.now(),
        });
      }
      setRoomState((prev) => {
        if (!prev.miniatures[id]) return prev;
        return {
          ...prev,
          miniatures: { ...prev.miniatures, [id]: nextMini },
        };
      });
      sendWs({ type: 'mini:update', payload: { id, patch } });
    },
    [role, recordHistory, sendWs]
  );

  const handleDeleteMini = useCallback(
    (id: string) => {
      const existing = roomStateRef.current.miniatures[id];
      if (role === 'gm' && existing) {
        recordHistory({
          kind: 'mini-delete',
          label: `Remover ${existing.name}`,
          mini: { ...existing },
        });
      }
      setRoomState((prev) => {
        const next = { ...prev.miniatures };
        delete next[id];
        return { ...prev, miniatures: next };
      });
      setSelectedMiniId((curr) => (curr === id ? null : curr));
      setSheetMiniId((curr) => (curr === id ? null : curr));
      sendWs({ type: 'mini:delete', payload: { id } });
    },
    [role, recordHistory, sendWs]
  );

  // Auto-foco e seleção imediata no personagem do jogador ao entrar na mesa
  const autoAssignedRef = useRef(false);
  useEffect(() => {
    if (inLobby || autoAssignedRef.current) return;
    const minis = Object.values(roomState.miniatures || {});
    if (minis.length === 0) return;

    // 1. Procura miniatura que já tenha o nome deste jogador como dona
    let myMini = minis.find(
      (m) =>
        !m.isPropOnly &&
        m.ownerName &&
        m.ownerName.trim().toLowerCase() === userName.trim().toLowerCase()
    );

    // 2. Se for jogador e ainda não tiver miniatura vinculada, associa ao primeiro herói desocupado
    if (!myMini && role === 'player') {
      myMini = minis.find(
        (m) =>
          !m.isPropOnly &&
          !m.sheet?.isMonster &&
          m.ownerName !== '__GM__' &&
          (!m.ownerName || m.ownerName.trim() === '')
      );
      if (myMini) {
        handleUpdateMini(myMini.id, { ownerName: userName });
      }
    }

    if (myMini) {
      autoAssignedRef.current = true;
      setSelectedMiniId(myMini.id);
    }
  }, [inLobby, roomState.miniatures, userName, role, handleUpdateMini]);

  const handleSaveSheet = useCallback(
    (
      id: string,
      payload: {
        name: string;
        hp: number;
        maxHp: number;
        sheet: CharacterSheet;
        ownerName?: string;
      }
    ) => {
      const existing = roomStateRef.current.miniatures[id];
      if (!existing || existing.isPropOnly) return;

      const nextMini: MiniatureData = {
        ...existing,
        name: payload.name,
        hp: payload.hp,
        maxHp: payload.maxHp,
        ownerName:
          role === 'gm' && typeof payload.ownerName === 'string'
            ? payload.ownerName
            : existing.ownerName,
        sheet: payload.sheet,
      };

      if (role === 'gm') {
        recordHistory({
          kind: 'mini-update',
          label: `Ficha ${existing.name}`,
          id,
          before: { ...existing },
          after: nextMini,
          timestamp: Date.now(),
        });
      }

      setRoomState((prev) => {
        if (!prev.miniatures[id]) return prev;
        return {
          ...prev,
          miniatures: { ...prev.miniatures, [id]: nextMini },
        };
      });

      sendWs({
        type: 'mini:sheet',
        payload: {
          id,
          name: payload.name,
          hp: payload.hp,
          maxHp: payload.maxHp,
          sheet: payload.sheet,
          ownerName: role === 'gm' ? payload.ownerName : undefined,
        },
      });
    },
    [role, recordHistory, sendWs]
  );

  const handlePlaceAnnotation = useCallback(
    (x: number, z: number) => {
      if (role !== 'gm') return;
      const annotation: MapAnnotation = {
        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: annotationBrush.kind,
        x,
        z,
        radius: annotationBrush.radius,
        rotationY: annotationBrush.rotationY,
        color: annotationBrush.color,
        label: annotationBrush.label.trim(),
        gmOnly: annotationBrush.gmOnly,
        createdBy: userName,
      };
      recordHistory({
        kind: 'annotation-create',
        label: `Marcador ${annotation.label || annotation.kind}`,
        annotation: { ...annotation },
      });
      setRoomState((prev) => ({
        ...prev,
        annotations: { ...(prev.annotations || {}), [annotation.id]: annotation },
      }));
      setSelectedAnnotationId(annotation.id);
      sendWs({ type: 'annotation:create', payload: { annotation } });
    },
    [role, annotationBrush, userName, recordHistory, sendWs]
  );

  const handleUpdateAnnotation = useCallback(
    (id: string, patch: Partial<MapAnnotation>) => {
      if (role !== 'gm') return;
      const existing = roomStateRef.current.annotations?.[id];
      if (!existing) return;
      const nextAnn: MapAnnotation = { ...existing, ...patch };
      recordHistory({
        kind: 'annotation-update',
        label: `Editar marcador`,
        id,
        before: { ...existing },
        after: nextAnn,
        timestamp: Date.now(),
      });
      setRoomState((prev) => {
        if (!prev.annotations?.[id]) return prev;
        return {
          ...prev,
          annotations: {
            ...prev.annotations,
            [id]: nextAnn,
          },
        };
      });
      sendWs({ type: 'annotation:update', payload: { id, patch } });
    },
    [role, recordHistory, sendWs]
  );

  const handleDeleteAnnotation = useCallback(
    (id: string) => {
      if (role !== 'gm') return;
      const existing = roomStateRef.current.annotations?.[id];
      if (!existing) return;
      recordHistory({
        kind: 'annotation-delete',
        label: `Remover marcador`,
        annotation: { ...existing },
      });
      setRoomState((prev) => {
        if (!prev.annotations?.[id]) return prev;
        const next = { ...prev.annotations };
        delete next[id];
        return { ...prev, annotations: next };
      });
      setSelectedAnnotationId((curr) => (curr === id ? null : curr));
      sendWs({ type: 'annotation:delete', payload: { id } });
    },
    [role, recordHistory, sendWs]
  );

  const handleChangePreset = useCallback(
    (preset: MapPresetId) => {
      const curr = roomStateRef.current;
      const before = cloneSnapshot(
        curr.presetName,
        curr.tiles,
        curr.miniatures,
        curr.annotations || {}
      );
      const next = buildMapPreset(preset);
      const after = cloneSnapshot(preset, next.tiles, next.miniatures, next.annotations);
      if (userSessionRef.current.role === 'gm') {
        recordHistory({
          kind: 'preset',
          label: `Trocar mapa (${preset})`,
          before,
          after,
        });
      }
      setRoomState((prev) => ({
        ...prev,
        presetName: preset,
        tiles: next.tiles,
        miniatures: next.miniatures,
        annotations: next.annotations,
      }));
      setSelectedMiniId(null);
      setSelectedAnnotationId(null);
      sendWs({
        type: 'map:restore',
        payload: {
          presetName: preset,
          tiles: next.tiles,
          miniatures: next.miniatures,
          annotations: next.annotations,
        },
      });
    },
    [recordHistory, sendWs]
  );

  const handleRollDice = useCallback(
    (die: number, modifier = 0) => {
      audioSynth.playDiceRoll();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        sendWs({ type: 'dice:roll', payload: { die, modifier } });
      } else {
        const result = 1 + Math.floor(Math.random() * die);
        const roll: DiceRollEvent = {
          id: Math.random().toString(36).substring(2, 9),
          userName: userSessionRef.current.name || 'Aventureiro',
          color: userSessionRef.current.color || '#f59e0b',
          die,
          result,
          modifier,
          total: result + modifier,
          timestamp: Date.now(),
        };
        setRoomState((prev) => ({
          ...prev,
          recentRolls: [roll, ...(prev.recentRolls || [])].slice(0, 50),
        }));
      }
    },
    [sendWs]
  );

  const handleLocalRulerChange = useCallback(
    (coords: RulerLineCoords | null, isDragging: boolean) => {
      setLocalRuler(coords);
      if (!measureShare) return;

      const now = performance.now();
      if (isDragging && now - lastRulerBroadcastRef.current < 65) return;
      lastRulerBroadcastRef.current = now;

      if (!coords) {
        sendWs({
          type: 'ruler:update',
          payload: { startX: 0, startZ: 0, endX: 0, endZ: 0, rule: measureRule, active: false },
        });
      } else {
        sendWs({
          type: 'ruler:update',
          payload: {
            startX: coords.startX,
            startZ: coords.startZ,
            endX: coords.endX,
            endZ: coords.endZ,
            rule: measureRule,
            active: true,
          },
        });
      }
    },
    [measureShare, measureRule, sendWs]
  );

  const handleChangeMeasureRule = useCallback(
    (nextRule: MeasureRule) => {
      setMeasureRule(nextRule);
      if (measureShare && localRuler) {
        sendWs({
          type: 'ruler:update',
          payload: {
            startX: localRuler.startX,
            startZ: localRuler.startZ,
            endX: localRuler.endX,
            endZ: localRuler.endZ,
            rule: nextRule,
            active: true,
          },
        });
      }
    },
    [measureShare, localRuler, sendWs]
  );

  const handleToggleMeasureShare = useCallback(
    (nextShare: boolean) => {
      setMeasureShare(nextShare);
      if (!nextShare) {
        sendWs({
          type: 'ruler:update',
          payload: { startX: 0, startZ: 0, endX: 0, endZ: 0, rule: measureRule, active: false },
        });
      } else if (localRuler) {
        sendWs({
          type: 'ruler:update',
          payload: {
            startX: localRuler.startX,
            startZ: localRuler.startZ,
            endX: localRuler.endX,
            endZ: localRuler.endZ,
            rule: measureRule,
            active: true,
          },
        });
      }
    },
    [localRuler, measureRule, sendWs]
  );

  const handleControlMusic = useCallback(
    (payload: {
      action: 'set_and_play' | 'play' | 'pause' | 'seek' | 'toggle_loop' | 'stop';
      videoId?: string;
      title?: string;
      positionSec?: number;
    }) => {
      if (userSessionRef.current.role !== 'gm') return;
      sendWs({ type: 'music:control', payload });
    },
    [sendWs]
  );

  const handleStartCombat = useCallback(() => {
    sendWs({ type: 'combat:start' });
  }, [sendWs]);

  const handleRollInitiative = useCallback(
    (miniId: string) => {
      sendWs({ type: 'combat:roll', payload: { miniId } });
    },
    [sendWs]
  );

  const handleRollAllInitiative = useCallback(() => {
    sendWs({ type: 'combat:roll_all' });
  }, [sendWs]);

  const handleRollMonstersInitiative = useCallback(() => {
    sendWs({ type: 'combat:roll_monsters' });
  }, [sendWs]);

  const handleNextTurn = useCallback(() => {
    sendWs({ type: 'combat:next_turn' });
  }, [sendWs]);

  const handlePrevTurn = useCallback(() => {
    sendWs({ type: 'combat:prev_turn' });
  }, [sendWs]);

  const handleSetTurn = useCallback(
    (turnIndex: number) => {
      sendWs({ type: 'combat:set_turn', payload: { turnIndex } });
    },
    [sendWs]
  );

  const handleEndCombat = useCallback(() => {
    sendWs({ type: 'combat:end' });
  }, [sendWs]);

  const handleToggleMute = () => {
    const next = !muted;
    audioSynth.muted = next;
    setMuted(next);
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0d1015]">
      <TabletopViewport
        roomState={roomState}
        role={role}
        gmLayer={gmLayer}
        userName={userName}
        userColor={userColor}
        isLobby={inLobby}
        toolMode={toolMode}
        sculptBrush={sculptBrush}
        annotationBrush={annotationBrush}
        measureRule={measureRule}
        measureSnap={measureSnap}
        localRuler={localRuler}
        selectedMiniId={selectedMiniId}
        selectedAnnotationId={selectedAnnotationId}
        cameraCommand={cameraCommand}
        onSelectMini={setSelectedMiniId}
        onSelectAnnotation={setSelectedAnnotationId}
        onMoveMini={handleMoveMini}
        onDeleteMini={handleDeleteMini}
        onPaintTile={handlePaintTile}
        onSculptStrokeStart={handleSculptStrokeStart}
        onSculptStrokeEnd={handleSculptStrokeEnd}
        onPlaceAnnotation={handlePlaceAnnotation}
        onLocalRulerChange={handleLocalRulerChange}
        onHoverInfo={setHoverInfo}
        onOpenContextMenu={(target) => {
          if (role === 'gm') setContextMenu(target);
        }}
        onDismissContextMenu={() => setContextMenu(null)}
      />

      {!inLobby && role === 'gm' && contextMenu && (
        <BoardContextMenu
          target={contextMenu}
          mini={contextMenu.miniId ? roomState.miniatures[contextMenu.miniId] || null : null}
          annotation={
            contextMenu.annotationId
              ? roomState.annotations?.[contextMenu.annotationId] || null
              : null
          }
          selectedMini={selectedMiniId ? roomState.miniatures[selectedMiniId] || null : null}
          clipboard={clipboardItem}
          onCopyMini={handleCopyMini}
          onCopyAnnotation={handleCopyAnnotation}
          onPasteAt={handlePasteAt}
          onRotateMini={(m) => handleMoveMini(m.id, m.x, m.z, m.rotationY + Math.PI / 4)}
          onSelectMini={(id) => {
            setSelectedMiniId(id);
            setSelectedAnnotationId(null);
          }}
          onOpenSheet={(m) => setSheetMiniId(m.id)}
          onDeleteMini={handleDeleteMini}
          onDeleteAnnotation={handleDeleteAnnotation}
          onClose={() => setContextMenu(null)}
        />
      )}

      {!inLobby &&
        sheetMiniId &&
        roomState.miniatures[sheetMiniId] &&
        !roomState.miniatures[sheetMiniId].isPropOnly && (
          <CharacterSheetModal
            mini={roomState.miniatures[sheetMiniId]}
            role={role}
            userName={userName}
            users={roomState.users}
            onSaveSheet={handleSaveSheet}
            onRollDice={handleRollDice}
            onClose={() => setSheetMiniId(null)}
          />
        )}

      {inLobby ? (
        <EntryLobby
          initialRoomId={roomId}
          firebaseUser={firebaseUser}
          savedRooms={savedRooms}
          onGoogleSignIn={handleGoogleSignIn}
          onGoogleSignOut={handleGoogleSignOut}
          onRoleChange={setRole}
          onEnter={handleEnterRoom}
        />
      ) : (
        <TabletopHUD
          roomState={roomState}
          connected={connected}
          role={role}
          gmLayer={gmLayer}
          onSetGmLayer={setGmLayer}
          userName={userName}
          userColor={userColor}
          firebaseUser={firebaseUser}
          cloudSyncing={cloudSyncing}
          cloudSavedAt={cloudSavedAt}
          onGoogleSignIn={handleGoogleSignIn}
          onGoogleSignOut={handleGoogleSignOut}
          onSaveCloud={() => handleSaveCloud(false)}
          onLoadCloud={() => handleLoadCloud(false)}
          toolMode={toolMode}
          sculptBrush={sculptBrush}
          annotationBrush={annotationBrush}
          measureRule={measureRule}
          measureSnap={measureSnap}
          measureShare={measureShare}
          localRuler={localRuler}
          selectedMiniId={selectedMiniId}
          selectedAnnotationId={selectedAnnotationId}
          hoverInfo={hoverInfo}
          muted={muted}
          errorToast={errorToast}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          undoLabel={undoStack[undoStack.length - 1]?.label}
          redoLabel={redoStack[redoStack.length - 1]?.label}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onSetToolMode={setToolMode}
          onSetSculptBrush={setSculptBrush}
          onSetAnnotationBrush={setAnnotationBrush}
          onSetMeasureRule={handleChangeMeasureRule}
          onSetMeasureSnap={setMeasureSnap}
          onSetMeasureShare={handleToggleMeasureShare}
          onClearRuler={() => handleLocalRulerChange(null, false)}
          onSelectMini={setSelectedMiniId}
          onSelectAnnotation={setSelectedAnnotationId}
          onCreateMini={handleCreateMini}
          onUpdateMini={handleUpdateMini}
          onMoveMini={handleMoveMini}
          onDeleteMini={handleDeleteMini}
          onUpdateAnnotation={handleUpdateAnnotation}
          onDeleteAnnotation={handleDeleteAnnotation}
          onChangePreset={handleChangePreset}
          onRollDice={handleRollDice}
          onCameraPreset={(preset) =>
            setCameraCommand((prev) => ({ preset, seq: (prev?.seq || 0) + 1 }))
          }
          onToggleMute={handleToggleMute}
          onSwitchRole={handleSwitchRole}
          onOpenSheet={(id) => setSheetMiniId(id)}
          onControlMusic={handleControlMusic}
          onStartCombat={handleStartCombat}
          onRollInitiative={handleRollInitiative}
          onRollMonstersInitiative={handleRollMonstersInitiative}
          onRollAllInitiative={handleRollAllInitiative}
          onNextTurn={handleNextTurn}
          onPrevTurn={handlePrevTurn}
          onSetTurn={handleSetTurn}
          onEndCombat={handleEndCombat}
        />
      )}

      {/* 🎙️📹 Dock Flutuante de Voz e Vídeo P2P (WebRTC) */}
      {!inLobby && (
        <VoiceVideoDock
          myUserId={myUserId}
          roomState={roomState}
          onFocusMiniature={(miniId) => {
            const m = roomState.miniatures[miniId];
            if (m) {
              setSelectedMiniId(m.id);
            }
          }}
        />
      )}
    </main>
  );
}
