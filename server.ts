import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  CharacterSheet,
  ClientMessage,
  DiceRollEvent,
  MapAnnotation,
  MiniatureData,
  MusicState,
  RoomState,
  RoomUser,
  RulerMeasurement,
  ServerMessage,
  TileCell,
  tileKey,
} from './src/types/vtt';
import { BOARD_COLS, BOARD_ROWS, buildMapPreset } from './src/utils/mapPresets';
import { extractYouTubeVideoId } from './src/utils/youtubeMusic';

interface UploadedAsset {
  id: string;
  name: string;
  format: string;
  buffer: Buffer;
  contentType: string;
  createdAt: number;
}

interface ClientSession {
  ws: WebSocket;
  roomId: string;
  user: RoomUser;
}

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), '.data');
const ASSETS_DIR = path.join(DATA_DIR, 'assets');
const ROOMS_DB_FILE = path.join(DATA_DIR, 'rooms.json');

const rooms = new Map<string, RoomState>();
const roomClients = new Map<string, Set<ClientSession>>();
const uploadedAssets = new Map<string, UploadedAsset>();
const remoteUrlCache = new Map<string, string>();
const inFlightRemoteFetches = new Map<string, Promise<UploadedAsset>>();

function ensureDataDirs() {
  try {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersistRooms() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      ensureDataDirs();
      const snapshot: Record<string, Omit<RoomState, 'users' | 'rulers'>> = {};
      for (const [id, r] of rooms.entries()) {
        snapshot[id] = {
          roomId: r.roomId,
          presetName: r.presetName,
          cols: r.cols,
          rows: r.rows,
          tiles: r.tiles,
          miniatures: r.miniatures,
          annotations: r.annotations,
          music: r.music || null,
          recentRolls: r.recentRolls || [],
        };
      }
      fs.writeFileSync(ROOMS_DB_FILE, JSON.stringify(snapshot), 'utf8');
    } catch (err) {
      console.error('Failed to persist rooms DB:', err);
    }
  }, 250);
}

function loadPersistedData() {
  ensureDataDirs();
  try {
    if (fs.existsSync(ROOMS_DB_FILE)) {
      const raw = fs.readFileSync(ROOMS_DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, RoomState>;
      for (const [id, r] of Object.entries(parsed)) {
        rooms.set(id, {
          ...r,
          rulers: {},
          users: [],
          recentRolls: Array.isArray(r.recentRolls) ? r.recentRolls : [],
        });
      }
    }
  } catch (err) {
    console.error('Failed to load persisted rooms DB:', err);
  }

  try {
    const files = fs.readdirSync(ASSETS_DIR);
    for (const file of files) {
      if (!file.endsWith('.meta.json')) continue;
      const id = file.replace(/\.meta\.json$/, '');
      const binPath = path.join(ASSETS_DIR, `${id}.bin`);
      if (!fs.existsSync(binPath)) continue;
      const meta = JSON.parse(fs.readFileSync(path.join(ASSETS_DIR, file), 'utf8')) as {
        name: string;
        format: string;
        contentType: string;
        createdAt: number;
      };
      const buffer = fs.readFileSync(binPath);
      uploadedAssets.set(id, {
        id,
        name: meta.name,
        format: meta.format,
        contentType: meta.contentType,
        createdAt: meta.createdAt || Date.now(),
        buffer,
      });
    }
  } catch (err) {
    console.error('Failed to load persisted assets:', err);
  }
}

function persistUploadedAsset(entry: UploadedAsset) {
  try {
    ensureDataDirs();
    fs.writeFileSync(path.join(ASSETS_DIR, `${entry.id}.bin`), entry.buffer);
    fs.writeFileSync(
      path.join(ASSETS_DIR, `${entry.id}.meta.json`),
      JSON.stringify({
        name: entry.name,
        format: entry.format,
        contentType: entry.contentType,
        createdAt: entry.createdAt,
      }),
      'utf8'
    );
  } catch (err) {
    console.error('Failed to persist asset:', err);
  }
}

loadPersistedData();

function pruneAssetCacheIfNeeded() {
  if (uploadedAssets.size > 160) {
    const oldest = Array.from(uploadedAssets.values()).sort(
      (a, b) => a.createdAt - b.createdAt
    )[0];
    if (oldest) uploadedAssets.delete(oldest.id);
  }
}

function normalizeRemoteUrl(rawUrl: string): string {
  let fetchUrl = rawUrl.trim();
  const ghBlob = fetchUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
  if (ghBlob) {
    fetchUrl = `https://raw.githubusercontent.com/${ghBlob[1]}/${ghBlob[2]}/${ghBlob[3]}`;
  }
  return fetchUrl;
}

function detectRasterImageContentType(buffer: Buffer, extHint?: string): string | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (extHint === 'png') return 'image/png';
  if (extHint === 'jpg' || extHint === 'jpeg') return 'image/jpeg';
  if (extHint === 'webp') return 'image/webp';
  return null;
}

async function fetchAndCacheRemoteAsset(rawUrl: string): Promise<UploadedAsset> {
  const fetchUrl = normalizeRemoteUrl(rawUrl);
  const cachedId = remoteUrlCache.get(fetchUrl);
  if (cachedId && uploadedAssets.has(cachedId)) {
    return uploadedAssets.get(cachedId)!;
  }

  const existingFlight = inFlightRemoteFetches.get(fetchUrl);
  if (existingFlight) {
    return existingFlight;
  }

  const parsed = new URL(fetchUrl);
  const ext = path.extname(parsed.pathname).replace('.', '').toLowerCase();
  const isModelExt = ['stl', 'obj', 'glb', 'gltf'].includes(ext);
  const isImageExt = ['png', 'jpg', 'jpeg', 'webp'].includes(ext);

  const promise = (async (): Promise<UploadedAsset> => {
    const response = await fetch(fetchUrl, { signal: AbortSignal.timeout(25000) });
    if (!response.ok) {
      throw Object.assign(
        new Error(`Nao foi possivel baixar o arquivo (HTTP ${response.status}).`),
        { status: 400 }
      );
    }

    const headerCt = (response.headers.get('content-type') || '').toLowerCase();
    const arrBuf = await response.arrayBuffer();
    if (arrBuf.byteLength > 20 * 1024 * 1024) {
      throw Object.assign(
        new Error('Arquivo remoto excede o limite de 20 MB.'),
        { status: 413 }
      );
    }

    const buffer = Buffer.from(arrBuf);
    const detectedImageCt = detectRasterImageContentType(buffer, isImageExt ? ext : undefined);
    const looksLikeRasterImage =
      Boolean(detectedImageCt) &&
      (isImageExt ||
        headerCt.startsWith('image/png') ||
        headerCt.startsWith('image/jpeg') ||
        headerCt.startsWith('image/webp') ||
        !isModelExt);

    if (!isModelExt && !looksLikeRasterImage) {
      throw Object.assign(
        new Error(
          'A URL precisa apontar para um modelo (.STL, .OBJ, .GLB, .GLTF) ou imagem (.PNG, .JPG, .WEBP).'
        ),
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    const rawBaseName = decodeURIComponent(path.basename(parsed.pathname)) || '';
    const format = isModelExt ? ext : 'image';
    const fileName = rawBaseName || (format === 'image' ? 'tazo.png' : `modelo.${ext}`);
    const contentType = isModelExt
      ? ext === 'glb'
        ? 'model/gltf-binary'
        : ext === 'gltf'
        ? 'model/gltf+json'
        : 'application/octet-stream'
      : detectedImageCt || 'image/png';

    const entry: UploadedAsset = {
      id,
      name: fileName,
      format,
      buffer,
      contentType,
      createdAt: Date.now(),
    };
    uploadedAssets.set(id, entry);
    persistUploadedAsset(entry);
    remoteUrlCache.set(fetchUrl, id);
    pruneAssetCacheIfNeeded();
    return entry;
  })();

  inFlightRemoteFetches.set(fetchUrl, promise);
  try {
    return await promise;
  } finally {
    inFlightRemoteFetches.delete(fetchUrl);
  }
}

function getOrCreateRoom(roomId: string): RoomState {
  const cleanId = roomId.trim().toUpperCase() || 'MESA-01';
  let room = rooms.get(cleanId);
  if (!room) {
    const initial = buildMapPreset('blank');
    room = {
      roomId: cleanId,
      presetName: 'blank',
      cols: BOARD_COLS,
      rows: BOARD_ROWS,
      tiles: initial.tiles,
      miniatures: initial.miniatures,
      annotations: initial.annotations,
      rulers: {},
      music: null,
      users: [],
      recentRolls: [],
    };
    rooms.set(cleanId, room);
    schedulePersistRooms();
  }
  return room;
}

function getRoomUsers(roomId: string): RoomUser[] {
  const clients = roomClients.get(roomId);
  if (!clients) return [];
  return Array.from(clients).map((c) => c.user);
}

function broadcast(roomId: string, msg: ServerMessage, exclude?: ClientSession) {
  const clients = roomClients.get(roomId);
  if (!clients) return;
  const serialized = JSON.stringify(msg);
  for (const client of clients) {
    if (client !== exclude && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(serialized);
    }
  }
}

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, assets: uploadedAssets.size });
  });

  app.get('/api/music/info', async (req, res) => {
    const raw = typeof req.query.url === 'string' ? req.query.url : '';
    const videoId = extractYouTubeVideoId(raw);
    if (!videoId) {
      res.status(400).json({ error: 'Link ou ID do YouTube invalido.' });
      return;
    }
    try {
      const oeUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`;
      const r = await fetch(oeUrl, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) {
        res.json({ videoId, title: `YouTube (${videoId})`, author: '' });
        return;
      }
      const data = (await r.json()) as { title?: string; author_name?: string };
      res.json({
        videoId,
        title: (data.title || `YouTube (${videoId})`).slice(0, 80),
        author: data.author_name || '',
      });
    } catch {
      res.json({ videoId, title: `YouTube (${videoId})`, author: '' });
    }
  });

  // Upload .stl/.obj/.glb/.gltf 3D models or .png/.jpg/.jpeg/.webp Tazo images (base64 payload)
  app.post('/api/assets', (req, res) => {
    try {
      const { name, format, dataBase64 } = req.body as {
        name?: string;
        format?: string;
        dataBase64?: string;
      };

      if (!name || !format || !dataBase64) {
        res.status(400).json({ error: 'Campos obrigatorios ausentes.' });
        return;
      }

      const rawFormat = format.toLowerCase();
      const allowedModels = ['stl', 'obj', 'glb', 'gltf'];
      const allowedImages = ['png', 'jpg', 'jpeg', 'webp', 'image'];
      if (!allowedModels.includes(rawFormat) && !allowedImages.includes(rawFormat)) {
        res.status(400).json({
          error: 'Formato nao suportado. Use STL, OBJ, GLB, GLTF ou imagem PNG, JPG ou WEBP.',
        });
        return;
      }

      const buffer = Buffer.from(dataBase64, 'base64');
      if (buffer.byteLength === 0) {
        res.status(400).json({ error: 'Arquivo vazio.' });
        return;
      }
      if (buffer.byteLength > 20 * 1024 * 1024) {
        res.status(413).json({ error: 'Arquivo excede o limite de 20 MB.' });
        return;
      }

      const isImage = allowedImages.includes(rawFormat);
      const extFromName = path.extname(name).replace('.', '').toLowerCase();
      const detectedImageCt = isImage
        ? detectRasterImageContentType(buffer, rawFormat !== 'image' ? rawFormat : extFromName)
        : null;
      if (isImage && !detectedImageCt) {
        res.status(400).json({
          error: 'Imagem invalida. Envie um arquivo .PNG, .JPG ou .WEBP valido.',
        });
        return;
      }

      const cleanFormat = isImage ? 'image' : rawFormat;
      const id = crypto.randomUUID();
      const contentType = isImage
        ? detectedImageCt!
        : cleanFormat === 'glb'
        ? 'model/gltf-binary'
        : cleanFormat === 'gltf'
        ? 'model/gltf+json'
        : 'application/octet-stream';

      const assetEntry: UploadedAsset = {
        id,
        name: path.basename(name),
        format: cleanFormat,
        buffer,
        contentType,
        createdAt: Date.now(),
      };
      uploadedAssets.set(id, assetEntry);
      persistUploadedAsset(assetEntry);

      pruneAssetCacheIfNeeded();

      res.json({ assetId: id, name: path.basename(name), format: cleanFormat, size: buffer.byteLength });
    } catch (err) {
      console.error('Asset upload failed:', err);
      res.status(500).json({ error: 'Falha ao processar arquivo enviado.' });
    }
  });

  // Fetch & cache a remote .stl / .obj / .glb / .gltf URL (e.g. GitHub raw D&D / KayKit repos)
  app.post('/api/assets/from-url', async (req, res) => {
    try {
      const { url } = req.body as { url?: string };
      if (!url || !/^https?:\/\//i.test(url)) {
        res.status(400).json({ error: 'Informe uma URL HTTP/HTTPS valida.' });
        return;
      }
      const asset = await fetchAndCacheRemoteAsset(url);
      res.json({
        assetId: asset.id,
        name: asset.name,
        format: asset.format,
        size: asset.buffer.byteLength,
      });
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status || 500;
      const message = err instanceof Error ? err.message : 'Falha ao importar modelo 3D da URL.';
      console.error('URL asset import failed:', err);
      res.status(status).json({ error: message });
    }
  });

  // Direct binary proxy with in-memory server caching for curated external 3D models
  app.get('/api/assets/proxy', async (req, res) => {
    try {
      const url = typeof req.query.url === 'string' ? req.query.url : '';
      if (!url || !/^https:\/\/raw\.githubusercontent\.com\//i.test(url)) {
        res.status(400).json({ error: 'URL de proxy invalida.' });
        return;
      }
      const asset = await fetchAndCacheRemoteAsset(url);
      res.setHeader('Content-Type', asset.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(asset.buffer);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status || 500;
      const message = err instanceof Error ? err.message : 'Falha no proxy de modelo 3D.';
      console.error('Proxy asset failed:', err);
      res.status(status).json({ error: message });
    }
  });

  app.get('/api/assets/:id', (req, res) => {
    const asset = uploadedAssets.get(req.params.id);
    if (!asset) {
      res.status(404).json({ error: 'Modelo 3D nao encontrado.' });
      return;
    }
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(asset.buffer);
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/ws', `http://${req.headers.host || 'localhost'}`);
    const roomId = (url.searchParams.get('room') || 'MESA-01').trim().toUpperCase() || 'MESA-01';
    const room = getOrCreateRoom(roomId);

    const session: ClientSession = {
      ws,
      roomId: room.roomId,
      user: {
        id: crypto.randomUUID(),
        name: 'Aventureiro',
        role: 'player',
        color: '#d97706',
      },
    };

    if (!roomClients.has(room.roomId)) {
      roomClients.set(room.roomId, new Set());
    }
    roomClients.get(room.roomId)!.add(session);
    room.users = getRoomUsers(room.roomId);

    send(ws, { type: 'room:state', payload: room });

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }

      const currentRoom = getOrCreateRoom(session.roomId);

      switch (msg.type) {
        case 'user:join': {
          session.user = {
            id: session.user.id,
            name: (msg.payload.name || 'Aventureiro').slice(0, 28),
            role: msg.payload.role === 'gm' ? 'gm' : 'player',
            color: msg.payload.color || '#d97706',
          };
          currentRoom.users = getRoomUsers(currentRoom.roomId);
          send(ws, { type: 'room:state', payload: currentRoom });
          broadcast(currentRoom.roomId, {
            type: 'user:list',
            payload: { users: currentRoom.users },
          });
          break;
        }

        case 'tile:set': {
          if (session.user.role !== 'gm') {
            send(ws, { type: 'error', payload: { message: 'Apenas o Mestre pode editar o mapa.' } });
            return;
          }
          const cell = msg.payload.cell;
          if (
            cell.x < 0 ||
            cell.x >= currentRoom.cols ||
            cell.z < 0 ||
            cell.z >= currentRoom.rows
          ) {
            return;
          }
          const normalizedCell: TileCell = {
            x: Math.round(cell.x),
            z: Math.round(cell.z),
            terrain: cell.terrain,
            elevation: Math.max(0, Math.min(4, Math.round(cell.elevation))),
            prop: cell.prop || 'none',
            propRotation: ((cell.propRotation || 0) % 4 + 4) % 4,
          };
          currentRoom.tiles[tileKey(normalizedCell.x, normalizedCell.z)] = normalizedCell;
          broadcast(currentRoom.roomId, {
            type: 'tile:updated',
            payload: { cells: [normalizedCell] },
          });
          break;
        }

        case 'tile:batch': {
          if (session.user.role !== 'gm') {
            send(ws, { type: 'error', payload: { message: 'Apenas o Mestre pode editar o mapa.' } });
            return;
          }
          const updated: TileCell[] = [];
          for (const cell of msg.payload.cells) {
            if (
              cell.x < 0 ||
              cell.x >= currentRoom.cols ||
              cell.z < 0 ||
              cell.z >= currentRoom.rows
            ) {
              continue;
            }
            const normalizedCell: TileCell = {
              x: Math.round(cell.x),
              z: Math.round(cell.z),
              terrain: cell.terrain,
              elevation: Math.max(0, Math.min(4, Math.round(cell.elevation))),
              prop: cell.prop || 'none',
              propRotation: ((cell.propRotation || 0) % 4 + 4) % 4,
            };
            currentRoom.tiles[tileKey(normalizedCell.x, normalizedCell.z)] = normalizedCell;
            updated.push(normalizedCell);
          }
          if (updated.length > 0) {
            broadcast(currentRoom.roomId, {
              type: 'tile:updated',
              payload: { cells: updated },
            });
          }
          break;
        }

        case 'map:preset': {
          if (session.user.role !== 'gm') {
            send(ws, { type: 'error', payload: { message: 'Apenas o Mestre pode trocar o mapa.' } });
            return;
          }
          const next = buildMapPreset(msg.payload.preset);
          currentRoom.presetName = msg.payload.preset;
          currentRoom.tiles = next.tiles;
          currentRoom.miniatures = next.miniatures;
          currentRoom.annotations = next.annotations;
          currentRoom.rulers = {};
          currentRoom.users = getRoomUsers(currentRoom.roomId);
          broadcast(currentRoom.roomId, { type: 'room:state', payload: currentRoom });
          break;
        }

        case 'map:restore': {
          if (session.user.role !== 'gm') {
            send(ws, { type: 'error', payload: { message: 'Apenas o Mestre pode restaurar o mapa.' } });
            return;
          }
          const nextTiles: Record<string, TileCell> = {};
          for (const cell of Object.values(msg.payload.tiles || {})) {
            if (
              cell.x < 0 ||
              cell.x >= currentRoom.cols ||
              cell.z < 0 ||
              cell.z >= currentRoom.rows
            ) {
              continue;
            }
            const normalizedCell: TileCell = {
              x: Math.round(cell.x),
              z: Math.round(cell.z),
              terrain: cell.terrain,
              elevation: Math.max(0, Math.min(4, Math.round(cell.elevation))),
              prop: cell.prop || 'none',
              propRotation: ((cell.propRotation || 0) % 4 + 4) % 4,
            };
            nextTiles[tileKey(normalizedCell.x, normalizedCell.z)] = normalizedCell;
          }
          currentRoom.presetName = msg.payload.presetName || currentRoom.presetName;
          currentRoom.tiles = nextTiles;
          currentRoom.miniatures = msg.payload.miniatures || {};
          currentRoom.annotations = msg.payload.annotations || {};
          currentRoom.rulers = {};
          currentRoom.users = getRoomUsers(currentRoom.roomId);
          broadcast(currentRoom.roomId, { type: 'room:state', payload: currentRoom });
          break;
        }

        case 'mini:create': {
          const incomingMini = msg.payload.mini;
          if (!incomingMini?.id || currentRoom.miniatures[incomingMini.id]) return;

          if (session.user.role === 'player') {
            if (incomingMini.isPropOnly || incomingMini.sheet?.isMonster) {
              send(ws, {
                type: 'error',
                payload: { message: 'Jogadores podem adicionar apenas 1 personagem proprio (nao monstros ou cenario).' },
              });
              return;
            }
            const existingOwnCount = Object.values(currentRoom.miniatures).filter(
              (m) =>
                !m.isPropOnly &&
                !m.sheet?.isMonster &&
                m.ownerName &&
                m.ownerName.toLowerCase() === session.user.name.toLowerCase()
            ).length;
            if (existingOwnCount >= 1) {
              send(ws, {
                type: 'error',
                payload: {
                  message:
                    'Voce ja possui 1 personagem na mesa. Se precisar controlar mais personagens, peca ao Mestre para adicionar.',
                },
              });
              return;
            }
            const playerChar: MiniatureData = {
              ...incomingMini,
              name: (incomingMini.name || session.user.name || 'Heroi').trim().slice(0, 32),
              ownerName: session.user.name,
              isPropOnly: false,
              sheet: incomingMini.sheet
                ? { ...incomingMini.sheet, isMonster: false, hiddenFromPlayers: false }
                : undefined,
            };
            currentRoom.miniatures[playerChar.id] = playerChar;
            broadcast(currentRoom.roomId, { type: 'mini:created', payload: { mini: playerChar } });
            schedulePersistRooms();
            break;
          }

          currentRoom.miniatures[incomingMini.id] = incomingMini;
          broadcast(currentRoom.roomId, { type: 'mini:created', payload: { mini: incomingMini } });
          schedulePersistRooms();
          break;
        }

        case 'mini:update': {
          if (session.user.role !== 'gm') {
            send(ws, {
              type: 'error',
              payload: { message: 'Apenas o Mestre pode dimensionar ou editar personagens.' },
            });
            return;
          }
          const existing = currentRoom.miniatures[msg.payload.id];
          if (!existing) return;
          const updated: MiniatureData = { ...existing, ...msg.payload.patch, id: existing.id };
          currentRoom.miniatures[existing.id] = updated;
          broadcast(currentRoom.roomId, { type: 'mini:updated', payload: { mini: updated } });
          break;
        }

        case 'mini:sheet': {
          const existing = currentRoom.miniatures[msg.payload.id];
          if (!existing || existing.isPropOnly) return;

          if (session.user.role === 'player') {
            if (existing.ownerName === '__GM__' || existing.sheet?.isMonster) {
              send(ws, {
                type: 'error',
                payload: { message: 'Apenas o Mestre pode editar fichas de monstros ou NPCs.' },
              });
              return;
            }
            if (
              existing.ownerName &&
              existing.ownerName.toLowerCase() !== session.user.name.toLowerCase()
            ) {
              send(ws, {
                type: 'error',
                payload: {
                  message: `Esta ficha pertence ao jogador ${existing.ownerName}.`,
                },
              });
              return;
            }
          }

          const rawSheet = msg.payload.sheet;
          const clampInt = (val: unknown, min: number, max: number, fallback: number) => {
            const n = Math.round(Number(val));
            return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
          };

          const safeMaxHp = clampInt(msg.payload.maxHp, 1, 9999, existing.maxHp || 30);
          const safeHp = clampInt(msg.payload.hp, 0, safeMaxHp, Math.min(existing.hp, safeMaxHp));
          const isGm = session.user.role === 'gm';

          const cleanSheet: CharacterSheet = {
            isMonster: isGm ? Boolean(rawSheet?.isMonster) : false,
            hiddenFromPlayers: isGm ? Boolean(rawSheet?.hiddenFromPlayers) : false,
            raceOrType: String(rawSheet?.raceOrType || '').slice(0, 48),
            classOrRole: String(rawSheet?.classOrRole || '').slice(0, 48),
            levelOrCr: String(rawSheet?.levelOrCr || '').slice(0, 24),
            ac: clampInt(rawSheet?.ac, 1, 50, 12),
            speed: String(rawSheet?.speed || '30 ft').slice(0, 32),
            initiativeBonus: clampInt(rawSheet?.initiativeBonus, -10, 30, 0),
            stats: {
              str: clampInt(rawSheet?.stats?.str, 1, 30, 10),
              dex: clampInt(rawSheet?.stats?.dex, 1, 30, 10),
              con: clampInt(rawSheet?.stats?.con, 1, 30, 10),
              int: clampInt(rawSheet?.stats?.int, 1, 30, 10),
              wis: clampInt(rawSheet?.stats?.wis, 1, 30, 10),
              cha: clampInt(rawSheet?.stats?.cha, 1, 30, 10),
            },
            attacks: Array.isArray(rawSheet?.attacks)
              ? rawSheet.attacks.slice(0, 10).map((atk) => ({
                  name: String(atk?.name || 'Ataque').slice(0, 48),
                  bonus: String(atk?.bonus || '+0').slice(0, 12),
                  damage: String(atk?.damage || '1d6').slice(0, 48),
                }))
              : [],
            abilities: String(rawSheet?.abilities || '').slice(0, 1500),
            equipment: String(rawSheet?.equipment || '').slice(0, 1500),
            notes: String(rawSheet?.notes || '').slice(0, 1500),
          };

          const cleanName =
            typeof msg.payload.name === 'string' && msg.payload.name.trim()
              ? msg.payload.name.trim().slice(0, 32)
              : existing.name;

          const nextOwner =
            isGm && typeof msg.payload.ownerName === 'string'
              ? msg.payload.ownerName.slice(0, 32)
              : existing.ownerName;

          const updated: MiniatureData = {
            ...existing,
            name: cleanName,
            hp: safeHp,
            maxHp: safeMaxHp,
            ownerName: nextOwner,
            sheet: cleanSheet,
          };

          currentRoom.miniatures[existing.id] = updated;
          broadcast(currentRoom.roomId, { type: 'mini:updated', payload: { mini: updated } });
          break;
        }

        case 'mini:move': {
          const existing = currentRoom.miniatures[msg.payload.id];
          if (!existing) return;

          // Players can move miniatures unless locked to GM or owned by someone else
          if (session.user.role === 'player') {
            if (existing.isPropOnly || existing.ownerName === '__GM__') {
              send(ws, {
                type: 'error',
                payload: { message: 'Esta miniatura e controlada apenas pelo Mestre.' },
              });
              return;
            }
            if (
              existing.ownerName &&
              existing.ownerName.toLowerCase() !== session.user.name.toLowerCase()
            ) {
              send(ws, {
                type: 'error',
                payload: { message: `Pertence ao jogador ${existing.ownerName}.` },
              });
              return;
            }
          }

          const clampedX = Math.max(0, Math.min(currentRoom.cols - 0.5, msg.payload.x));
          const clampedZ = Math.max(0, Math.min(currentRoom.rows - 0.5, msg.payload.z));
          const nextRot =
            typeof msg.payload.rotationY === 'number'
              ? msg.payload.rotationY
              : existing.rotationY;

          existing.x = clampedX;
          existing.z = clampedZ;
          existing.rotationY = nextRot;

          broadcast(currentRoom.roomId, {
            type: 'mini:moved',
            payload: {
              id: existing.id,
              x: existing.x,
              z: existing.z,
              rotationY: existing.rotationY,
            },
          });
          break;
        }

        case 'mini:delete': {
          if (session.user.role !== 'gm') {
            send(ws, {
              type: 'error',
              payload: { message: 'Apenas o Mestre pode remover miniaturas.' },
            });
            return;
          }
          if (!currentRoom.miniatures[msg.payload.id]) return;
          delete currentRoom.miniatures[msg.payload.id];
          broadcast(currentRoom.roomId, {
            type: 'mini:deleted',
            payload: { id: msg.payload.id },
          });
          break;
        }

        case 'annotation:create': {
          if (session.user.role !== 'gm') {
            send(ws, {
              type: 'error',
              payload: { message: 'Apenas o Mestre pode criar marcadores ou formas 3D.' },
            });
            return;
          }
          const ann = msg.payload.annotation;
          if (!ann.id || currentRoom.annotations[ann.id]) return;
          const sanitized: MapAnnotation = {
            ...ann,
            label: (ann.label || '').slice(0, 48),
            radius: Math.max(0.5, Math.min(6, Number(ann.radius) || 1)),
            createdBy: session.user.name,
          };
          currentRoom.annotations[sanitized.id] = sanitized;
          broadcast(currentRoom.roomId, {
            type: 'annotation:created',
            payload: { annotation: sanitized },
          });
          break;
        }

        case 'annotation:update': {
          if (session.user.role !== 'gm') {
            send(ws, {
              type: 'error',
              payload: { message: 'Apenas o Mestre pode editar marcadores.' },
            });
            return;
          }
          const existing = currentRoom.annotations[msg.payload.id];
          if (!existing) return;
          const updated: MapAnnotation = {
            ...existing,
            ...msg.payload.patch,
            id: existing.id,
            label:
              typeof msg.payload.patch.label === 'string'
                ? msg.payload.patch.label.slice(0, 48)
                : existing.label,
          };
          currentRoom.annotations[existing.id] = updated;
          broadcast(currentRoom.roomId, {
            type: 'annotation:updated',
            payload: { annotation: updated },
          });
          break;
        }

        case 'annotation:delete': {
          if (session.user.role !== 'gm') {
            send(ws, {
              type: 'error',
              payload: { message: 'Apenas o Mestre pode remover marcadores.' },
            });
            return;
          }
          if (!currentRoom.annotations[msg.payload.id]) return;
          delete currentRoom.annotations[msg.payload.id];
          broadcast(currentRoom.roomId, {
            type: 'annotation:deleted',
            payload: { id: msg.payload.id },
          });
          break;
        }

        case 'ruler:update': {
          const clampCoord = (v: number, max: number) =>
            Math.max(0, Math.min(max, Number.isFinite(v) ? v : 0));
          const rule =
            msg.payload.rule === 'dnd5e_alt' || msg.payload.rule === 'euclidean'
              ? msg.payload.rule
              : 'dnd5e';
          const ruler: RulerMeasurement = {
            userId: session.user.id,
            userName: session.user.name,
            color: session.user.color || '#22d3ee',
            startX: clampCoord(msg.payload.startX, currentRoom.cols - 0.5),
            startZ: clampCoord(msg.payload.startZ, currentRoom.rows - 0.5),
            endX: clampCoord(msg.payload.endX, currentRoom.cols - 0.5),
            endZ: clampCoord(msg.payload.endZ, currentRoom.rows - 0.5),
            rule,
            active: Boolean(msg.payload.active),
          };
          if (!currentRoom.rulers) currentRoom.rulers = {};
          if (ruler.active) {
            currentRoom.rulers[session.user.id] = ruler;
          } else {
            delete currentRoom.rulers[session.user.id];
          }
          broadcast(
            currentRoom.roomId,
            { type: 'ruler:updated', payload: { ruler } },
            session
          );
          break;
        }

        case 'music:control': {
          if (session.user.role !== 'gm') {
            send(ws, {
              type: 'error',
              payload: { message: 'Apenas o Mestre pode escolher ou controlar a musica da mesa.' },
            });
            return;
          }

          const now = Date.now();
          const prev = currentRoom.music || null;
          const livePos = (m: MusicState | null): number => {
            if (!m) return 0;
            if (!m.isPlaying) return m.positionSec;
            return Math.max(0, m.positionSec + (now - m.updatedAt) / 1000);
          };

          const { action } = msg.payload;
          if (action === 'stop') {
            currentRoom.music = null;
          } else if (action === 'set_and_play') {
            const vid = extractYouTubeVideoId(msg.payload.videoId || '');
            if (!vid) {
              send(ws, { type: 'error', payload: { message: 'Video do YouTube invalido.' } });
              return;
            }
            const cleanTitle = (msg.payload.title || `YouTube (${vid})`).trim().slice(0, 80);
            currentRoom.music = {
              videoId: vid,
              title: cleanTitle || `YouTube (${vid})`,
              isPlaying: true,
              loop: prev ? prev.loop : true,
              positionSec: Math.max(0, Number(msg.payload.positionSec) || 0),
              updatedAt: now,
              updatedBy: session.user.name,
            };
          } else if (prev) {
            if (action === 'play') {
              currentRoom.music = {
                ...prev,
                isPlaying: true,
                positionSec: prev.isPlaying ? livePos(prev) : prev.positionSec,
                updatedAt: now,
                updatedBy: session.user.name,
              };
            } else if (action === 'pause') {
              currentRoom.music = {
                ...prev,
                isPlaying: false,
                positionSec: livePos(prev),
                updatedAt: now,
                updatedBy: session.user.name,
              };
            } else if (action === 'seek') {
              currentRoom.music = {
                ...prev,
                positionSec: Math.max(0, Number(msg.payload.positionSec) || 0),
                updatedAt: now,
                updatedBy: session.user.name,
              };
            } else if (action === 'toggle_loop') {
              currentRoom.music = {
                ...prev,
                positionSec: livePos(prev),
                loop: !prev.loop,
                updatedAt: now,
                updatedBy: session.user.name,
              };
            }
          }

          broadcast(currentRoom.roomId, {
            type: 'music:updated',
            payload: { music: currentRoom.music || null },
          });
          break;
        }

        case 'dice:roll': {
          const die = Math.max(2, Math.min(100, Math.round(msg.payload.die || 20)));
          const modifier = Math.round(msg.payload.modifier || 0);
          const result = 1 + Math.floor(Math.random() * die);
          const roll: DiceRollEvent = {
            id: crypto.randomUUID(),
            userName: session.user.name,
            color: session.user.color || '#f59e0b',
            die,
            result,
            modifier,
            total: result + modifier,
            timestamp: Date.now(),
          };
          currentRoom.recentRolls = [roll, ...currentRoom.recentRolls].slice(0, 12);
          broadcast(currentRoom.roomId, { type: 'dice:rolled', payload: { roll } });
          schedulePersistRooms();
          break;
        }
      }
      if (
        msg.type === 'tile:set' ||
        msg.type === 'tile:batch' ||
        msg.type === 'map:preset' ||
        msg.type === 'map:restore' ||
        msg.type === 'mini:update' ||
        msg.type === 'mini:sheet' ||
        msg.type === 'mini:move' ||
        msg.type === 'mini:delete' ||
        msg.type === 'annotation:create' ||
        msg.type === 'annotation:update' ||
        msg.type === 'annotation:delete' ||
        msg.type === 'music:control'
      ) {
        schedulePersistRooms();
      }
    });

    ws.on('close', () => {
      const clients = roomClients.get(session.roomId);
      if (clients) {
        clients.delete(session);
        const currentRoom = getOrCreateRoom(session.roomId);
        if (currentRoom.rulers?.[session.user.id]) {
          const prev = currentRoom.rulers[session.user.id];
          delete currentRoom.rulers[session.user.id];
          broadcast(session.roomId, {
            type: 'ruler:updated',
            payload: { ruler: { ...prev, active: false } },
          });
        }
        currentRoom.users = getRoomUsers(session.roomId);
        broadcast(session.roomId, {
          type: 'user:list',
          payload: { users: currentRoom.users },
        });
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SpireTable 3D server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
