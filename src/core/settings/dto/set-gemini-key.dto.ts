import { IsString } from 'class-validator';

export class SetGeminiKeyDto {
  @IsString()
  apiKey!: string;
}
