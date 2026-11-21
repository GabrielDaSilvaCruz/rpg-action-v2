import { IsNotEmpty, IsOptional, IsInt, Min, Max, IsString } from 'class-validator';

export class CreateRoomDto {
  @IsNotEmpty({ message: 'O título da sala é obrigatório' })
  title: string;

  @IsOptional()
  presetName?: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(50)
  cols?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(50)
  rows?: number;

  @IsOptional()
  @IsString()
  masterId?: string;

  @IsOptional()
  @IsString()
  mapAssetUrl?: string;
}

