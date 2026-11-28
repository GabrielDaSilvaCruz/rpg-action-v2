import {
  WebSocketGateway,
  WebSocketServer as WsServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { Inject, Injectable } from '@nestjs/common';
import { IRoomRepository, ROOM_REPOSITORY_TOKEN, RoomEntity } from '../../core/contracts/room.repository.interface';

interface RoomUser {
  id: string;
  name: string;
  role: 'gm' | 'player';
  color: string;
  characterId?: string;
  currentSceneId?: string;
  micMuted?: boolean;
  videoOff?: boolean;
  speaking?: boolean;
}

interface ClientSession {
  ws: WebSocket;
  roomId: string;
  user: RoomUser;
}

@Injectable()
@WebSocketGateway({ path: '/ws' })
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WsServer()
  server: WebSocketServer;

  private liveRooms = new Map<string, RoomEntity & { users: RoomUser[] }>();
  private roomClients = new Map<string, Set<ClientSession>>();
  private saveTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(ROOM_REPOSITORY_TOKEN)
    private readonly roomRepository: IRoomRepository,
  ) {}

  private schedulePersistToPostgres(roomId: string) {
    const existing = this.saveTimers.get(roomId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      this.saveTimers.delete(roomId);
      const room = this.liveRooms.get(roomId);
      if (room) {
        try {
          await this.roomRepository.createOrUpdate({
            roomId: room.roomId,
            title: room.title,
            presetName: room.presetName,
            cols: room.cols,
            rows: room.rows,
            tiles: room.tiles,
            miniatures: room.miniatures,
            annotations: room.annotations,
            scenes: room.scenes,
            activeSceneId: room.activeSceneId,
            rulers: room.rulers,
            music: room.music,
            recentRolls: room.recentRolls,
            combat: room.combat,
          });
        } catch (err) {
          console.error(`Falha ao salvar mesa '${roomId}' no PostgreSQL:`, err);
        }
      }
    }, 500);

    this.saveTimers.set(roomId, timer);
  }

  private async getOrCreateLiveRoom(roomId: string): Promise<RoomEntity & { users: RoomUser[] }> {
    const id = (roomId || 'MESA-01').trim().toUpperCase() || 'MESA-01';
    let room = this.liveRooms.get(id);

    if (!room) {
      // Tentar carregar do banco de dados PostgreSQL
      const persisted = await this.roomRepository.findByRoomId(id);
      if (persisted) {
        room = {
          ...persisted,
          scenes: persisted.scenes || {},
          activeSceneId: persisted.activeSceneId || 'scene-default',
          combat: persisted.combat || null,
          users: [],
        };
      } else {
        const defaultSceneId = 'scene-default';
        room = {
          id: 'room-' + id,
          roomId: id,
          title: `Mesa ${id}`,
          presetName: 'dungeon-gate',
          cols: 20,
          rows: 20,
          tiles: {},
          miniatures: {},
          annotations: {},
          scenes: {
            [defaultSceneId]: {
              id: defaultSceneId,
              name: 'Portão da Masmorra',
              presetName: 'dungeon-gate',
              cols: 20,
              rows: 20,
              tiles: {},
              annotations: {},
            },
          },
          activeSceneId: defaultSceneId,
          rulers: {},
          music: null,
          recentRolls: [],
          combat: null,
          users: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        // Salvar imediatamente no PostgreSQL
        this.schedulePersistToPostgres(id);
      }
      this.liveRooms.set(id, room);
    }

    // Garante que haja ao menos 1 cena padrão se room.scenes for vazio
    if (!room.scenes || Object.keys(room.scenes).length === 0) {
      const defaultSceneId = room.activeSceneId || 'scene-default';
      const sceneName =
        room.presetName === 'tavern'
          ? 'Taverna'
          : room.presetName === 'crypt'
          ? 'Cripta Nórdica'
          : room.presetName === 'arena'
          ? 'Pico dos Dragões'
          : 'Mapa Principal';
      room.scenes = {
        [defaultSceneId]: {
          id: defaultSceneId,
          name: sceneName,
          presetName: room.presetName,
          cols: room.cols || 20,
          rows: room.rows || 20,
          tiles: room.tiles || {},
          annotations: room.annotations || {},
        },
      };
      room.activeSceneId = defaultSceneId;
    }

    return room;
  }

  async handleConnection(client: WebSocket, req: IncomingMessage) {
    const url = new URL(req.url || '/ws', `http://${req.headers.host || 'localhost'}`);
    const roomId = (url.searchParams.get('room') || 'MESA-01').trim().toUpperCase() || 'MESA-01';
    const currentRoom = await this.getOrCreateLiveRoom(roomId);

    const session: ClientSession = {
      ws: client,
      roomId: currentRoom.roomId,
      user: {
        id: Math.random().toString(36).substring(2, 9),
        name: 'Aventureiro',
        role: 'player',
        color: '#d97706',
      },
    };

    if (!this.roomClients.has(currentRoom.roomId)) {
      this.roomClients.set(currentRoom.roomId, new Set());
    }
    this.roomClients.get(currentRoom.roomId)!.add(session);

    client.on('message', (raw: any) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const room = this.liveRooms.get(session.roomId);
      if (!room) return;

      switch (msg.type) {
        case 'user:join': {
          session.user = {
            id: msg.payload?.id || session.user.id,
            name: (msg.payload?.name || 'Aventureiro').slice(0, 28),
            role: msg.payload?.role === 'gm' ? 'gm' : 'player',
            color: msg.payload?.color || '#d97706',
            characterId: msg.payload?.characterId,
            currentSceneId: msg.payload?.currentSceneId || session.user.currentSceneId || room.activeSceneId || 'scene-default',
            micMuted: msg.payload?.micMuted ?? true,
            videoOff: msg.payload?.videoOff ?? true,
            speaking: false,
          };
          room.users = this.getRoomUsers(room.roomId);
          this.send(client, { type: 'user:self', payload: { user: session.user } });
          this.send(client, { type: 'room:state', payload: room });
          this.broadcast(room.roomId, {
            type: 'user:list',
            payload: { users: room.users },
          });
          break;
        }

        case 'webrtc:signal': {
          const { targetUserId, signal } = msg.payload || {};
          if (targetUserId && signal) {
            const clients = this.roomClients.get(room.roomId);
            if (clients) {
              const payload = JSON.stringify({
                type: 'webrtc:signal',
                payload: {
                  senderUserId: session.user.id,
                  senderName: session.user.name,
                  signal,
                },
              });
              for (const targetSession of clients) {
                if (targetSession.user.id === targetUserId && targetSession.ws.readyState === WebSocket.OPEN) {
                  targetSession.ws.send(payload);
                  break;
                }
              }
            }
          }
          break;
        }

        case 'webrtc:state': {
          if (msg.payload) {
            if (msg.payload.micMuted !== undefined) session.user.micMuted = !!msg.payload.micMuted;
            if (msg.payload.videoOff !== undefined) session.user.videoOff = !!msg.payload.videoOff;
            if (msg.payload.speaking !== undefined) session.user.speaking = !!msg.payload.speaking;
            if (msg.payload.characterId !== undefined) session.user.characterId = msg.payload.characterId;
            room.users = this.getRoomUsers(room.roomId);
            this.broadcast(room.roomId, {
              type: 'webrtc:state_updated',
              payload: {
                userId: session.user.id,
                micMuted: session.user.micMuted,
                videoOff: session.user.videoOff,
                speaking: session.user.speaking,
                characterId: session.user.characterId,
              },
            });
          }
          break;
        }

        case 'tile:set': {
          if (msg.payload?.cell) {
            const key = `${msg.payload.cell.x},${msg.payload.cell.z}`;
            const targetSceneId = msg.payload.sceneId || session.user.currentSceneId || room.activeSceneId || 'scene-default';
            if (room.scenes && targetSceneId && room.scenes[targetSceneId]) {
              if (!room.scenes[targetSceneId].tiles) room.scenes[targetSceneId].tiles = {};
              room.scenes[targetSceneId].tiles[key] = msg.payload.cell;
            }
            if (!msg.payload.sceneId || targetSceneId === room.activeSceneId) {
              room.tiles[key] = msg.payload.cell;
            }
            this.broadcast(room.roomId, {
              type: 'tile:updated',
              payload: { cell: msg.payload.cell, cells: [msg.payload.cell], sceneId: targetSceneId },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'tile:batch':
        case 'tile:batch_set': {
          if (Array.isArray(msg.payload?.cells)) {
            const targetSceneId = msg.payload.sceneId || session.user.currentSceneId || room.activeSceneId || 'scene-default';
            if (room.scenes && targetSceneId && room.scenes[targetSceneId]) {
              if (!room.scenes[targetSceneId].tiles) room.scenes[targetSceneId].tiles = {};
              for (const cell of msg.payload.cells) {
                const key = `${cell.x},${cell.z}`;
                room.scenes[targetSceneId].tiles[key] = cell;
              }
            }
            if (!msg.payload.sceneId || targetSceneId === room.activeSceneId) {
              for (const cell of msg.payload.cells) {
                const key = `${cell.x},${cell.z}`;
                room.tiles[key] = cell;
              }
            }
            this.broadcast(room.roomId, {
              type: 'tile:batch_updated',
              payload: { cells: msg.payload.cells, sceneId: targetSceneId },
            });
            this.broadcast(room.roomId, {
              type: 'tile:updated',
              payload: { cells: msg.payload.cells, sceneId: targetSceneId },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'tile:clear_all': {
          const targetSceneId = msg.payload?.sceneId || session.user.currentSceneId || room.activeSceneId || 'scene-default';
          if (room.scenes && targetSceneId && room.scenes[targetSceneId]) {
            room.scenes[targetSceneId].tiles = {};
          }
          if (!msg.payload?.sceneId || targetSceneId === room.activeSceneId) {
            room.tiles = {};
          }
          this.broadcast(room.roomId, { type: 'tile:cleared_all', payload: { sceneId: targetSceneId } });
          this.schedulePersistToPostgres(room.roomId);
          break;
        }

        case 'mini:create':
        case 'mini:add': {
          const mini = msg.payload?.mini || msg.payload?.miniature;
          if (mini && mini.id) {
            if (!mini.sceneId) {
              mini.sceneId = msg.payload?.sceneId || session.user.currentSceneId || room.activeSceneId || 'scene-default';
            }
            room.miniatures[mini.id] = mini;
            this.broadcast(room.roomId, {
              type: 'mini:created',
              payload: { mini, miniature: mini, sceneId: mini.sceneId },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'mini:move': {
          const { id, x, z, rotationY, sceneId } = msg.payload || {};
          if (id) {
            const isGm = session.user.role === 'gm';
            const existing = room.miniatures[id];
            if (existing && !isGm) {
              const isOwner =
                !existing.isPropOnly &&
                !existing.sheet?.isMonster &&
                existing.ownerName !== '__GM__' &&
                ((existing.ownerName && existing.ownerName.toLowerCase() === session.user.name.toLowerCase()) ||
                 (!existing.ownerName && existing.name.toLowerCase() === session.user.name.toLowerCase()) ||
                 !existing.ownerName);
              if (!isOwner) {
                break;
              }
            }
            if (!room.miniatures[id]) {
              room.miniatures[id] = {
                id,
                x,
                z,
                rotationY: rotationY || 0,
                name: 'Miniatura',
                format: 'procedural',
                assetId: 'cat:guard',
                assetName: 'Guarda',
                remoteUrl: '',
                footprint: 1,
                scaleMultiplier: 1,
                fixZUp: false,
                showBase: true,
                baseStyle: 'stone',
                color: '#f59e0b',
                finish: 'stone',
                hp: 35,
                maxHp: 35,
                isPropOnly: false,
                ownerName: '',
                sceneId: sceneId || session.user.currentSceneId || room.activeSceneId || 'scene-default',
              };
            } else {
              room.miniatures[id].x = x;
              room.miniatures[id].z = z;
              if (rotationY !== undefined) {
                room.miniatures[id].rotationY = rotationY;
              }
              if (sceneId) {
                room.miniatures[id].sceneId = sceneId;
              }
            }
            this.broadcast(room.roomId, {
              type: 'mini:moved',
              payload: { id, x, z, rotationY: room.miniatures[id].rotationY, sceneId: room.miniatures[id].sceneId },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'mini:update': {
          const { id, patch } = msg.payload || {};
          if (id && room.miniatures[id]) {
            room.miniatures[id] = { ...room.miniatures[id], ...patch };
            this.broadcast(room.roomId, {
              type: 'mini:updated',
              payload: { id, patch, mini: room.miniatures[id] },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'mini:delete': {
          const { id } = msg.payload || {};
          if (id && room.miniatures[id]) {
            delete room.miniatures[id];
            this.broadcast(room.roomId, {
              type: 'mini:deleted',
              payload: { id },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'mini:sheet': {
          const { id, sheet, name, hp, maxHp, ownerName } = msg.payload || {};
          if (id && room.miniatures[id]) {
            if (sheet) room.miniatures[id].sheet = sheet;
            if (name !== undefined) room.miniatures[id].name = name;
            if (hp !== undefined) room.miniatures[id].hp = hp;
            if (maxHp !== undefined) room.miniatures[id].maxHp = maxHp;
            if (ownerName !== undefined) room.miniatures[id].ownerName = ownerName;
            this.broadcast(room.roomId, {
              type: 'mini:updated',
              payload: {
                id,
                patch: { sheet, name, hp, maxHp, ownerName },
                mini: room.miniatures[id],
              },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'annotation:create': {
          if (msg.payload?.annotation) {
            const ann = msg.payload.annotation;
            const targetSceneId = msg.payload.sceneId || ann.sceneId || session.user.currentSceneId || room.activeSceneId || 'scene-default';
            if (room.scenes && targetSceneId && room.scenes[targetSceneId]) {
              if (!room.scenes[targetSceneId].annotations) room.scenes[targetSceneId].annotations = {};
              room.scenes[targetSceneId].annotations[ann.id] = ann;
            }
            if (!msg.payload.sceneId || targetSceneId === room.activeSceneId) {
              room.annotations[ann.id] = ann;
            }
            this.broadcast(room.roomId, {
              type: 'annotation:created',
              payload: { annotation: ann, sceneId: targetSceneId },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'annotation:update': {
          const ann = msg.payload?.annotation || (msg.payload?.id && room.annotations[msg.payload.id]);
          if (ann) {
            const targetSceneId = msg.payload.sceneId || ann.sceneId || session.user.currentSceneId || room.activeSceneId || 'scene-default';
            const updated = { ...(room.annotations[ann.id] || ann), ...(msg.payload.patch || ann) };
            if (room.scenes && targetSceneId && room.scenes[targetSceneId]) {
              if (!room.scenes[targetSceneId].annotations) room.scenes[targetSceneId].annotations = {};
              room.scenes[targetSceneId].annotations[ann.id] = updated;
            }
            if (!msg.payload.sceneId || targetSceneId === room.activeSceneId) {
              room.annotations[ann.id] = updated;
            }
            this.broadcast(room.roomId, {
              type: 'annotation:updated',
              payload: { id: ann.id, patch: msg.payload.patch, annotation: updated, sceneId: targetSceneId },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'annotation:delete': {
          if (msg.payload?.id) {
            const targetSceneId = msg.payload.sceneId || session.user.currentSceneId || room.activeSceneId || 'scene-default';
            if (room.scenes && targetSceneId && room.scenes[targetSceneId]?.annotations) {
              delete room.scenes[targetSceneId].annotations[msg.payload.id];
            }
            delete room.annotations[msg.payload.id];
            this.broadcast(room.roomId, {
              type: 'annotation:deleted',
              payload: { id: msg.payload.id, sceneId: targetSceneId },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'map:preset':
        case 'map:restore':
        case 'room:preset': {
          if (msg.payload) {
            const targetSceneId = msg.payload.sceneId || room.activeSceneId || 'scene-default';
            if (msg.payload.preset || msg.payload.presetName) {
              room.presetName = msg.payload.preset || msg.payload.presetName;
            }
            if (room.scenes && targetSceneId && room.scenes[targetSceneId]) {
              if (msg.payload.preset || msg.payload.presetName) {
                room.scenes[targetSceneId].presetName = msg.payload.preset || msg.payload.presetName;
              }
              if (msg.payload.tiles) room.scenes[targetSceneId].tiles = msg.payload.tiles;
              if (msg.payload.annotations) room.scenes[targetSceneId].annotations = msg.payload.annotations;
              if (msg.payload.cols) room.scenes[targetSceneId].cols = msg.payload.cols;
              if (msg.payload.rows) room.scenes[targetSceneId].rows = msg.payload.rows;
            }
            if (msg.payload.tiles && (!msg.payload.sceneId || msg.payload.sceneId === room.activeSceneId)) room.tiles = msg.payload.tiles;
            if (msg.payload.miniatures) room.miniatures = msg.payload.miniatures;
            if (msg.payload.annotations && (!msg.payload.sceneId || msg.payload.sceneId === room.activeSceneId)) room.annotations = msg.payload.annotations;
            if (msg.payload.cols) room.cols = msg.payload.cols;
            if (msg.payload.rows) room.rows = msg.payload.rows;

            this.broadcast(room.roomId, {
              type: 'map:restored',
              payload: {
                presetName: room.presetName,
                sceneId: targetSceneId,
                scenes: room.scenes,
                tiles: room.tiles,
                miniatures: room.miniatures,
                annotations: room.annotations,
                cols: room.cols,
                rows: room.rows,
              },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'scene:create':
        case 'scene:add': {
          const scene = msg.payload?.scene;
          if (scene && scene.id) {
            if (!room.scenes) room.scenes = {};
            room.scenes[scene.id] = scene;
            this.broadcast(room.roomId, {
              type: 'scene:created',
              payload: { scene, scenes: room.scenes },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'scene:update': {
          const { sceneId, patch } = msg.payload || {};
          if (sceneId && room.scenes && room.scenes[sceneId]) {
            room.scenes[sceneId] = { ...room.scenes[sceneId], ...patch };
            if (sceneId === room.activeSceneId) {
              if (patch.tiles) room.tiles = patch.tiles;
              if (patch.annotations) room.annotations = patch.annotations;
              if (patch.presetName) room.presetName = patch.presetName;
            }
            this.broadcast(room.roomId, {
              type: 'scene:updated',
              payload: { sceneId, patch, scene: room.scenes[sceneId], scenes: room.scenes },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'scene:delete': {
          const { sceneId } = msg.payload || {};
          if (sceneId && room.scenes && room.scenes[sceneId]) {
            delete room.scenes[sceneId];
            if (room.activeSceneId === sceneId) {
              room.activeSceneId = Object.keys(room.scenes)[0] || 'scene-default';
            }
            // Move any miniatures from deleted scene to activeSceneId
            for (const m of Object.values(room.miniatures || {})) {
              if (m.sceneId === sceneId) {
                m.sceneId = room.activeSceneId;
              }
            }
            // Move any users from deleted scene
            for (const clientSession of (this.roomClients.get(room.roomId) || [])) {
              if (clientSession.user.currentSceneId === sceneId) {
                clientSession.user.currentSceneId = room.activeSceneId;
              }
            }
            room.users = this.getRoomUsers(room.roomId);
            this.broadcast(room.roomId, {
              type: 'scene:deleted',
              payload: { sceneId, scenes: room.scenes, miniatures: room.miniatures, users: room.users },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'scene:switch': {
          const { sceneId, userId } = msg.payload || {};
          if (sceneId) {
            if (userId) {
              const clients = this.roomClients.get(room.roomId);
              if (clients) {
                for (const c of clients) {
                  if (c.user.id === userId) {
                    c.user.currentSceneId = sceneId;
                  }
                }
              }
            } else {
              session.user.currentSceneId = sceneId;
              if (session.user.role === 'gm') {
                room.activeSceneId = sceneId;
              }
            }
            room.users = this.getRoomUsers(room.roomId);
            this.broadcast(room.roomId, {
              type: 'user:list',
              payload: { users: room.users },
            });
          }
          break;
        }

        case 'dice:roll': {
          const die = Math.max(2, Math.min(100, Math.round(msg.payload?.die || 20)));
          const modifier = Math.round(msg.payload?.modifier || 0);
          const result = 1 + Math.floor(Math.random() * die);
          const roll = {
            id: Math.random().toString(36).substring(2, 9),
            userName: session.user.name || 'Aventureiro',
            color: session.user.color || '#f59e0b',
            die,
            result,
            modifier,
            total: result + modifier,
            timestamp: Date.now(),
          };
          room.recentRolls = [roll, ...(room.recentRolls || [])].slice(0, 50);
          this.broadcast(room.roomId, {
            type: 'dice:rolled',
            payload: { roll },
          });
          this.schedulePersistToPostgres(room.roomId);
          break;
        }

        case 'ruler:update': {
          const rulerData = {
            userId: session.user.id,
            userName: session.user.name,
            color: session.user.color,
            startX: msg.payload?.startX ?? msg.payload?.coords?.startX ?? 0,
            startZ: msg.payload?.startZ ?? msg.payload?.coords?.startZ ?? 0,
            endX: msg.payload?.endX ?? msg.payload?.coords?.endX ?? 0,
            endZ: msg.payload?.endZ ?? msg.payload?.coords?.endZ ?? 0,
            rule: msg.payload?.rule || 'dnd5e',
            active: Boolean(msg.payload?.active),
          };
          this.broadcast(room.roomId, {
            type: 'ruler:updated',
            payload: { ruler: rulerData },
          });
          break;
        }

        case 'music:control': {
          const payload = msg.payload || {};
          const action = payload.action;
          const now = Date.now();
          const current = room.music as any;

          // Calcula posição atual se já estava tocando
          let currentPosition = 0;
          if (current && typeof current.positionSec === 'number') {
            currentPosition = current.positionSec;
            if (current.isPlaying && current.updatedAt) {
              currentPosition += Math.max(0, (now - current.updatedAt) / 1000);
            }
          }

          if (action === 'set_and_play') {
            if (payload.videoId) {
              room.music = {
                videoId: payload.videoId,
                title: payload.title || 'Música da Mesa',
                isPlaying: true,
                loop: true,
                positionSec: payload.positionSec || 0,
                updatedAt: now,
                updatedBy: session.user.name,
              };
            }
          } else if (action === 'play') {
            if (current && current.videoId) {
              room.music = {
                ...current,
                isPlaying: true,
                positionSec: currentPosition,
                updatedAt: now,
                updatedBy: session.user.name,
              };
            }
          } else if (action === 'pause') {
            if (current && current.videoId) {
              room.music = {
                ...current,
                isPlaying: false,
                positionSec: currentPosition,
                updatedAt: now,
                updatedBy: session.user.name,
              };
            }
          } else if (action === 'seek') {
            if (current && current.videoId) {
              room.music = {
                ...current,
                positionSec: Math.max(0, payload.positionSec || 0),
                updatedAt: now,
                updatedBy: session.user.name,
              };
            }
          } else if (action === 'toggle_loop') {
            if (current) {
              room.music = {
                ...current,
                loop: !current.loop,
                positionSec: currentPosition,
                updatedAt: now,
                updatedBy: session.user.name,
              };
            }
          } else if (action === 'stop') {
            room.music = null;
          }

          this.broadcast(room.roomId, {
            type: 'music:updated',
            payload: { music: room.music },
          });
          this.broadcast(room.roomId, {
            type: 'music:state',
            payload: { music: room.music },
          });
          this.schedulePersistToPostgres(room.roomId);
          break;
        }

        case 'combat:start': {
          const entries: any[] = [];
          for (const mini of Object.values(room.miniatures || {})) {
            if (mini && mini.id && !mini.isPropOnly) {
              const sheet = (mini as any).sheet;
              const bonus = Number.isFinite(sheet?.initiativeBonus)
                ? Number(sheet.initiativeBonus)
                : 0;
              const isMonster = Boolean(
                sheet?.isMonster ||
                  ['goblin', 'skeleton', 'orc', 'beholder', 'mimic', 'dragon', 'golem'].includes(
                    (mini as any).builtinKind
                  )
              );
              entries.push({
                id: mini.id,
                miniId: mini.id,
                name: mini.name || 'Combatente',
                isMonster,
                initiative: 0,
                bonus,
                roll: 0,
                hasRolled: false,
                color: (mini as any).color || '#f59e0b',
                hp: (mini as any).hp,
                maxHp: (mini as any).maxHp,
                ownerName: (mini as any).ownerName || '',
              });
            }
          }
          room.combat = {
            active: true,
            round: 1,
            turnIndex: 0,
            entries,
            lastUpdated: Date.now(),
          };
          this.broadcast(room.roomId, {
            type: 'combat:updated',
            payload: { combat: room.combat },
          });
          this.schedulePersistToPostgres(room.roomId);
          break;
        }

        case 'combat:roll': {
          if (!room.combat || !room.combat.entries) break;
          const miniId = msg.payload?.miniId;
          const entry = room.combat.entries.find((e: any) => e.miniId === miniId || e.id === miniId);
          if (entry) {
            const isGm = session.user.role === 'gm';
            const mini = room.miniatures?.[entry.miniId || entry.id];
            const isOwner =
              !entry.isMonster &&
              ((entry.ownerName && entry.ownerName.toLowerCase() === session.user.name.toLowerCase()) ||
               (mini?.ownerName && mini.ownerName.toLowerCase() === session.user.name.toLowerCase()) ||
               (!mini?.ownerName && !isGm && mini?.name?.toLowerCase() === session.user.name.toLowerCase()));

            if (!isGm && !isOwner) {
              session.ws.send(JSON.stringify({
                type: 'error',
                payload: { message: 'Você só pode rolar a iniciativa do seu próprio personagem!' }
              }));
              break;
            }

            const d20 = 1 + Math.floor(Math.random() * 20);
            entry.roll = d20;
            entry.initiative = d20 + (entry.bonus || 0);
            entry.hasRolled = true;

            const roll = {
              id: Math.random().toString(36).substring(2, 9),
              userName: `Iniciativa: ${entry.name}`,
              color: entry.color || session.user.color || '#f59e0b',
              die: 20,
              result: d20,
              modifier: entry.bonus || 0,
              total: entry.initiative,
              timestamp: Date.now(),
            };
            room.recentRolls = [roll, ...(room.recentRolls || [])].slice(0, 50);
            this.broadcast(room.roomId, {
              type: 'dice:rolled',
              payload: { roll },
            });

            // Reordenar decrescente: rolados primeiro por iniciativa, não rolados depois
            room.combat.entries.sort((a: any, b: any) => {
              if (a.hasRolled && !b.hasRolled) return -1;
              if (!a.hasRolled && b.hasRolled) return 1;
              if (b.initiative !== a.initiative) return b.initiative - a.initiative;
              return (b.bonus || 0) - (a.bonus || 0);
            });

            this.broadcast(room.roomId, {
              type: 'combat:updated',
              payload: { combat: room.combat },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'combat:roll_monsters': {
          if (!room.combat || !room.combat.entries) break;
          if (session.user.role !== 'gm') break;
          for (const entry of room.combat.entries) {
            if (entry.isMonster && !entry.hasRolled) {
              const d20 = 1 + Math.floor(Math.random() * 20);
              entry.roll = d20;
              entry.initiative = d20 + (entry.bonus || 0);
              entry.hasRolled = true;
            }
          }
          room.combat.entries.sort((a: any, b: any) => {
            if (a.hasRolled && !b.hasRolled) return -1;
            if (!a.hasRolled && b.hasRolled) return 1;
            if (b.initiative !== a.initiative) return b.initiative - a.initiative;
            return (b.bonus || 0) - (a.bonus || 0);
          });
          this.broadcast(room.roomId, {
            type: 'combat:updated',
            payload: { combat: room.combat },
          });
          this.schedulePersistToPostgres(room.roomId);
          break;
        }

        case 'combat:roll_all': {
          if (!room.combat || !room.combat.entries) break;
          for (const entry of room.combat.entries) {
            const d20 = 1 + Math.floor(Math.random() * 20);
            entry.roll = d20;
            entry.initiative = d20 + (entry.bonus || 0);
            entry.hasRolled = true;
          }
          // Reordenar decrescente por iniciativa
          room.combat.entries.sort((a: any, b: any) => {
            if (b.initiative !== a.initiative) return b.initiative - a.initiative;
            return (b.bonus || 0) - (a.bonus || 0);
          });
          room.combat.turnIndex = 0;

          const roll = {
            id: Math.random().toString(36).substring(2, 9),
            userName: `${session.user.name} rolou Iniciativa Geral`,
            color: session.user.color || '#f59e0b',
            die: 20,
            result: room.combat.entries[0]?.roll || 10,
            modifier: room.combat.entries[0]?.bonus || 0,
            total: room.combat.entries[0]?.initiative || 10,
            timestamp: Date.now(),
          };
          room.recentRolls = [roll, ...(room.recentRolls || [])].slice(0, 50);
          this.broadcast(room.roomId, {
            type: 'dice:rolled',
            payload: { roll },
          });

          this.broadcast(room.roomId, {
            type: 'combat:updated',
            payload: { combat: room.combat },
          });
          this.schedulePersistToPostgres(room.roomId);
          break;
        }

        case 'combat:next_turn': {
          if (room.combat && room.combat.entries && room.combat.entries.length > 0) {
            const nextIdx = room.combat.turnIndex + 1;
            if (nextIdx >= room.combat.entries.length) {
              room.combat.turnIndex = 0;
              room.combat.round = (room.combat.round || 1) + 1;
            } else {
              room.combat.turnIndex = nextIdx;
            }
            this.broadcast(room.roomId, {
              type: 'combat:updated',
              payload: { combat: room.combat },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'combat:prev_turn': {
          if (room.combat && room.combat.entries && room.combat.entries.length > 0) {
            if (room.combat.turnIndex > 0) {
              room.combat.turnIndex -= 1;
            } else {
              room.combat.turnIndex = room.combat.entries.length - 1;
              room.combat.round = Math.max(1, (room.combat.round || 1) - 1);
            }
            this.broadcast(room.roomId, {
              type: 'combat:updated',
              payload: { combat: room.combat },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'combat:set_turn': {
          if (room.combat && typeof msg.payload?.turnIndex === 'number') {
            room.combat.turnIndex = Math.max(
              0,
              Math.min(room.combat.entries.length - 1, msg.payload.turnIndex)
            );
            this.broadcast(room.roomId, {
              type: 'combat:updated',
              payload: { combat: room.combat },
            });
            this.schedulePersistToPostgres(room.roomId);
          }
          break;
        }

        case 'combat:end': {
          room.combat = null;
          this.broadcast(room.roomId, {
            type: 'combat:updated',
            payload: { combat: null },
          });
          this.schedulePersistToPostgres(room.roomId);
          break;
        }
      }
    });
  }

  handleDisconnect(client: WebSocket) {
    for (const [roomId, clients] of this.roomClients.entries()) {
      for (const session of clients) {
        if (session.ws === client) {
          clients.delete(session);
          const room = this.liveRooms.get(roomId);
          if (room) {
            room.users = this.getRoomUsers(roomId);
            this.broadcast(roomId, {
              type: 'user:list',
              payload: { users: room.users },
            });
          }
          break;
        }
      }
    }
  }

  private getRoomUsers(roomId: string): RoomUser[] {
    const clients = this.roomClients.get(roomId);
    if (!clients) return [];
    const set = new Map<string, RoomUser>();
    for (const s of clients) {
      set.set(s.user.id, s.user);
    }
    return Array.from(set.values());
  }

  private send(client: WebSocket, message: any) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  private broadcast(roomId: string, message: any) {
    const clients = this.roomClients.get(roomId);
    if (clients) {
      const payload = JSON.stringify(message);
      for (const session of clients) {
        if (session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(payload);
        }
      }
    }
  }
}
