export const STORAGE_SERVICE_TOKEN = 'IStorageService';

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  contentType: string;
}

export interface IStorageService {
  upload(file: Buffer, filename: string, contentType: string): Promise<UploadResult>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}
