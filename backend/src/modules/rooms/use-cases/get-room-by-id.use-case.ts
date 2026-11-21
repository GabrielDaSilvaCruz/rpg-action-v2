import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { IRoomRepository, ROOM_REPOSITORY_TOKEN } from '../../../core/contracts/room.repository.interface';

@Injectable()
export class GetRoomByIdUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_TOKEN)
    private readonly roomRepository: IRoomRepository,
  ) {}

  async execute(id: string) {
    const room = await this.roomRepository.findByRoomId(id);
    if (!room) {
      throw new NotFoundException(`Sala '${id}' não encontrada no PostgreSQL`);
    }
    return room;
  }
}
