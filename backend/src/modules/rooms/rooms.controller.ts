import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  BadRequestException,
  NotFoundException,
  Inject,
  Query,
  Res,
} from '@nestjs/common';
import { CreateRoomUseCase } from './use-cases/create-room.use-case';
import { ListRoomsUseCase } from './use-cases/list-rooms.use-case';
import { GetRoomByIdUseCase } from './use-cases/get-room-by-id.use-case';
import { CreateRoomDto } from './dto/create-room.dto';
import { IStorageService, STORAGE_SERVICE_TOKEN } from '../../core/contracts/storage.service.interface';

@Controller()
export class RoomsController {
  constructor(
    private readonly createRoomUseCase: CreateRoomUseCase,
    private readonly listRoomsUseCase: ListRoomsUseCase,
    private readonly getRoomByIdUseCase: GetRoomByIdUseCase,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storageService: IStorageService,
  ) {}

  @Post('rooms')
  async createRoom(@Body() dto: CreateRoomDto) {
    return this.createRoomUseCase.execute(dto);
  }

  @Get('rooms')
  async listRooms() {
    return this.listRoomsUseCase.execute();
  }

  @Get('rooms/:id')
  async getRoomById(@Param('id') id: string) {
    return this.getRoomByIdUseCase.execute(id);
  }

  /**
   * Proxy para assets remotos (evita bloqueios de CORS em modelos 3D)
   */
  @Get('assets/proxy')
  async proxyAsset(@Query('url') urlStr: string, @Res() res: any) {
    if (!urlStr) {
      throw new BadRequestException('Parâmetro url é obrigatório');
    }
    try {
      const response = await fetch(decodeURIComponent(urlStr));
      if (!response.ok) {
        throw new NotFoundException(`Asset não encontrado no servidor de origem (${response.status})`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      res.header('Content-Type', contentType);
      res.header('Access-Control-Allow-Origin', '*');
      res.send(buffer);
    } catch (err: any) {
      throw new BadRequestException('Falha ao obter asset remoto: ' + err.message);
    }
  }

  /**
   * Upload de Modelos 3D (STL, OBJ, GLB) e Imagens para PostgreSQL / Storage
   */
  @Post('assets')
  async uploadAsset(@Body() body: { name: string; format?: string; dataBase64: string }) {
    if (!body.name || !body.dataBase64) {
      throw new BadRequestException('Nome e dataBase64 são obrigatórios');
    }

    const cleanBase64 = body.dataBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const ext = body.name.split('.').pop()?.toLowerCase() || body.format || 'png';
    const isModel = ['stl', 'obj', 'glb', 'gltf'].includes(ext);
    const contentType = isModel ? `model/${ext}` : ext === 'webp' ? 'image/webp' : 'image/png';

    const result = await this.storageService.upload(buffer, body.name, contentType);
    return {
      assetId: result.key,
      name: body.name,
      format: ext,
      url: result.url,
      size: result.size,
    };
  }
}
