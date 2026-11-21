import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsGateway } from './rooms.gateway';
import { CreateRoomUseCase } from './use-cases/create-room.use-case';
import { ListRoomsUseCase } from './use-cases/list-rooms.use-case';
import { GetRoomByIdUseCase } from './use-cases/get-room-by-id.use-case';
import { ROOM_REPOSITORY_TOKEN } from '../../core/contracts/room.repository.interface';
import { STORAGE_SERVICE_TOKEN } from '../../core/contracts/storage.service.interface';
import { PrismaRoomRepository } from '../../infra/database/prisma-room.repository';
import { LocalStorageService } from '../../infra/storage/local-storage.service';
import { PrismaService } from '../../infra/database/prisma.service';

@Module({
  controllers: [RoomsController],
  providers: [
    CreateRoomUseCase,
    ListRoomsUseCase,
    GetRoomByIdUseCase,
    RoomsGateway,
    PrismaService,
    {
      provide: ROOM_REPOSITORY_TOKEN,
      useClass: PrismaRoomRepository,
    },
    {
      provide: STORAGE_SERVICE_TOKEN,
      useClass: LocalStorageService,
    },
  ],
  exports: [CreateRoomUseCase, ListRoomsUseCase, GetRoomByIdUseCase, RoomsGateway],
})
export class RoomsModule {}

