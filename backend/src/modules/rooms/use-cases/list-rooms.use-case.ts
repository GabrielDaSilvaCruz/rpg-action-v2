import { Injectable, Inject } from '@nestjs/common';
import { IRoomRepository, ROOM_REPOSITORY_TOKEN } from '../../../core/contracts/room.repository.interface';

@Injectable()
export class ListRoomsUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_TOKEN)
    private readonly roomRepository: IRoomRepository,
  ) {}

  async execute() {
    return this.roomRepository.findAll();
  }
}

