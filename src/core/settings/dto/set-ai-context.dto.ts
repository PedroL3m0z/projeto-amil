import { IsString, MaxLength } from 'class-validator';

export class SetAiContextDto {
  @IsString()
  @MaxLength(8000)
  instructions!: string;
}
