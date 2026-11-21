import { Injectable, Inject } from '@nestjs/common';
import { IRoomRepository, ROOM_REPOSITORY_TOKEN } from '../../../core/contracts/room.repository.interface';
import { CreateRoomDto } from '../dto/create-room.dto';

@Injectable()
export class CreateRoomUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_TOKEN)
    private readonly roomRepository: IRoomRepository,
  ) {}

  async execute(dto: CreateRoomDto) {
    const roomId = dto.title ? dto.title.replace(/\s+/g, '-').toUpperCase() : `MESA-${Date.now().toString(36).toUpperCase()}`;

    return this.roomRepository.createOrUpdate({
      roomId,
      title: dto.title || roomId,
      presetName: dto.presetName || 'dungeon-gate',
      cols: dto.cols || 20,
      rows: dto.rows || 20,
      masterId: dto.masterId,
      tiles: {},
      miniatures: {},
      annotations: {},
      rulers: {},
      music: null,
      recentRolls: [],
    });
  }
}
