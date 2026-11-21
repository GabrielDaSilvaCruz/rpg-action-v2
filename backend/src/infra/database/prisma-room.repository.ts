import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { IRoomRepository, RoomEntity } from '../../core/contracts/room.repository.interface';

@Injectable()
export class PrismaRoomRepository implements IRoomRepository {
  private inMemoryRooms = new Map<string, RoomEntity>();

  constructor(private readonly prisma: PrismaService) {}

  async createOrUpdate(data: Partial<RoomEntity> & { roomId: string }): Promise<RoomEntity> {
    const id = (data.roomId || 'MESA-01').trim().toUpperCase();

    try {
      const room = await this.prisma.room.upsert({
        where: { roomId: id },
        create: {
          roomId: id,
          title: data.title || `Mesa ${id}`,
          presetName: data.presetName || 'dungeon-gate',
          cols: data.cols || 20,
          rows: data.rows || 20,
          tiles: data.tiles || {},
          miniatures: data.miniatures || {},
          annotations: data.annotations || {},
          rulers: data.rulers || {},
          music: data.music || null,
          recentRolls: data.recentRolls || [],
          combat: data.combat || null,
          masterId: data.masterId || null,
        },
        update: {
          title: data.title,
          presetName: data.presetName,
          cols: data.cols,
          rows: data.rows,
          tiles: data.tiles,
          miniatures: data.miniatures,
          annotations: data.annotations,
          rulers: data.rulers,
          music: data.music,
          recentRolls: data.recentRolls,
          combat: data.combat,
        },
      });
      return room as unknown as RoomEntity;
    } catch (err) {
      console.warn('PostgreSQL upsert fallback to in-memory:', err);
      const existing = this.inMemoryRooms.get(id) || {
        id: 'room-' + id,
        roomId: id,
        title: data.title || `Mesa ${id}`,
        presetName: data.presetName || 'dungeon-gate',
        cols: data.cols || 20,
        rows: data.rows || 20,
        tiles: data.tiles || {},
        miniatures: data.miniatures || {},
        annotations: data.annotations || {},
        rulers: data.rulers || {},
        music: data.music || null,
        recentRolls: data.recentRolls || [],
        masterId: data.masterId || 'demo-master',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updated = { ...existing, ...data, roomId: id, updatedAt: new Date() };
      this.inMemoryRooms.set(id, updated);
      return updated;
    }
  }

  async findByRoomId(roomId: string): Promise<RoomEntity | null> {
    const id = (roomId || 'MESA-01').trim().toUpperCase();

    try {
      const room = await this.prisma.room.findUnique({
        where: { roomId: id },
      });
      if (room) return room as unknown as RoomEntity;
    } catch {
      // fallback
    }

    return this.inMemoryRooms.get(id) || null;
  }

  async findAll(): Promise<RoomEntity[]> {
    try {
      const rooms = await this.prisma.room.findMany({
        orderBy: { updatedAt: 'desc' },
      });
      if (rooms && rooms.length > 0) {
        return rooms as unknown as RoomEntity[];
      }
    } catch {
      // fallback
    }

    return Array.from(this.inMemoryRooms.values());
  }

  async updateState(roomId: string, state: Partial<RoomEntity>): Promise<RoomEntity> {
    const id = (roomId || 'MESA-01').trim().toUpperCase();

    try {
      const room = await this.prisma.room.update({
        where: { roomId: id },
        data: {
          tiles: state.tiles,
          miniatures: state.miniatures,
          annotations: state.annotations,
          rulers: state.rulers,
          music: state.music,
          recentRolls: state.recentRolls,
          presetName: state.presetName,
          cols: state.cols,
          rows: state.rows,
        },
      });
      return room as unknown as RoomEntity;
    } catch {
      return this.createOrUpdate({ ...state, roomId: id });
    }
  }

  async delete(roomId: string): Promise<void> {
    const id = (roomId || 'MESA-01').trim().toUpperCase();
    try {
      await this.prisma.room.delete({ where: { roomId: id } });
    } catch {
      this.inMemoryRooms.delete(id);
    }
  }
}
