import { IsBoolean, IsIn, IsString, MaxLength } from 'class-validator';

export class SetAiContextDto {
  @IsString()
  @MaxLength(120)
  assistantName!: string;

  @IsString()
  @MaxLength(8000)
  instructions!: string;

  @IsString()
  @MaxLength(8000)
  knowledge!: string;

  @IsIn(['formal', 'neutro', 'informal'])
  tone!: 'formal' | 'neutro' | 'informal';

  @IsBoolean()
  avoidPromises!: boolean;

  @IsBoolean()
  escalateMedical!: boolean;
}
