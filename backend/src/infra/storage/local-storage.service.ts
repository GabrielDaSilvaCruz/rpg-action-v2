import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { IStorageService, UploadResult } from '../../core/contracts/storage.service.interface';

@Injectable()
export class LocalStorageService implements IStorageService {
  private readonly uploadDir = path.resolve(process.cwd(), 'uploads');

  constructor() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async upload(file: Buffer, filename: string, contentType: string): Promise<UploadResult> {
    const key = `${Date.now()}-${filename}`;
    const filePath = path.join(this.uploadDir, key);
    await fs.promises.writeFile(filePath, file);

    return {
      url: `/uploads/${key}`,
      key,
      size: file.length,
      contentType,
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.uploadDir, key);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  getUrl(key: string): string {
    return `/uploads/${key}`;
  }
}

