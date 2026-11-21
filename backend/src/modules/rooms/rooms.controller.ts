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
import * as fs from 'fs';
import * as path from 'path';
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
   * Serve os assets e modelos 3D armazenados localmente
   */
  @Get('assets/:key')
  async getAsset(@Param('key') rawKey: string, @Res() res: any) {
    if (!rawKey) {
      throw new BadRequestException('Chave do asset é obrigatória');
    }
    const cleanKey = path.basename(decodeURIComponent(rawKey));
    const uploadDir = path.resolve(process.cwd(), 'uploads');
    const filePath = path.join(uploadDir, cleanKey);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Asset não encontrado: ${cleanKey}`);
    }

    const ext = cleanKey.split('.').pop()?.toLowerCase() || '';
    const isModel = ['stl', 'obj', 'glb', 'gltf'].includes(ext);
    const contentType = isModel
      ? (ext === 'glb' ? 'model/gltf-binary' : ext === 'gltf' ? 'model/gltf+json' : `model/${ext}`)
      : ext === 'png'
      ? 'image/png'
      : ext === 'webp'
      ? 'image/webp'
      : ext === 'jpg' || ext === 'jpeg'
      ? 'image/jpeg'
      : 'application/octet-stream';

    const fileBuffer = await fs.promises.readFile(filePath);
    res.header('Content-Type', contentType);
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(fileBuffer);
  }

  /**
   * Importa asset diretamente de uma URL e armazena localmente
   */
  @Post('assets/from-url')
  async importAssetFromUrl(@Body() body: { url: string }) {
    if (!body?.url || typeof body.url !== 'string') {
      throw new BadRequestException('URL é obrigatória');
    }
    const targetUrl = body.url.trim();
    try {
      const response = await fetch(targetUrl);
      if (!response.ok) {
        throw new NotFoundException(`Falha ao baixar asset da URL informada (${response.status})`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());

      let filename = 'asset';
      try {
        const parsed = new URL(targetUrl);
        const lastPart = path.basename(parsed.pathname);
        if (lastPart && lastPart.includes('.')) {
          filename = decodeURIComponent(lastPart);
        }
      } catch {
        // fallback
      }

      let ext = filename.split('.').pop()?.toLowerCase() || '';
      const cType = response.headers.get('content-type') || '';
      if (!ext || !['stl', 'obj', 'glb', 'gltf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        if (cType.includes('stl')) ext = 'stl';
        else if (cType.includes('gltf-binary') || cType.includes('glb')) ext = 'glb';
        else if (cType.includes('gltf')) ext = 'gltf';
        else if (cType.includes('png')) ext = 'png';
        else if (cType.includes('webp')) ext = 'webp';
        else if (cType.includes('jpeg') || cType.includes('jpg')) ext = 'jpeg';
        else ext = 'stl';
        filename = `${filename}.${ext}`;
      }

      const isModel = ['stl', 'obj', 'glb', 'gltf'].includes(ext);
      const isImage = ['png', 'webp', 'jpg', 'jpeg'].includes(ext);
      const contentType = isModel
        ? (ext === 'glb' ? 'model/gltf-binary' : ext === 'gltf' ? 'model/gltf+json' : `model/${ext}`)
        : isImage
        ? (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg')
        : 'application/octet-stream';

      const result = await this.storageService.upload(buffer, filename, contentType);
      return {
        assetId: result.key,
        name: filename,
        format: isImage ? 'image' : ext,
        url: result.url,
        size: result.size,
      };
    } catch (err: any) {
      throw new BadRequestException('Erro ao importar da URL: ' + err.message);
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
