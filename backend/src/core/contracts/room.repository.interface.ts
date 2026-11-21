export interface RoomEntity {
  id: string;
  roomId: string;
  title: string;
  presetName: string;
  cols: number;
  rows: number;
  tiles: Record<string, any>;
  miniatures: Record<string, any>;
  annotations: Record<string, any>;
  rulers?: Record<string, any>;
  music?: any;
  recentRolls?: any[];
  combat?: any;
  masterId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const ROOM_REPOSITORY_TOKEN = 'IRoomRepository';

export interface IRoomRepository {
  createOrUpdate(data: Partial<RoomEntity> & { roomId: string }): Promise<RoomEntity>;
  findByRoomId(roomId: string): Promise<RoomEntity | null>;
  findAll(): Promise<RoomEntity[]>;
  updateState(roomId: string, state: Partial<RoomEntity>): Promise<RoomEntity>;
  delete(roomId: string): Promise<void>;
}
