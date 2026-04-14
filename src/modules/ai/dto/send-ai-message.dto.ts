import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AiHistoryMessageDto {
  @ApiProperty({
    enum: ['user', 'assistant'],
    description: 'Origem da mensagem no histórico.',
    example: 'user',
  })
  @IsString()
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty({
    description: 'Texto da mensagem no histórico.',
    example: 'Oi, quero saber sobre os planos.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  text!: string;
}

export class SendAiMessageDto {
  @ApiProperty({
    description: 'Pergunta atual do usuário para o chatbot.',
    example: 'Quais documentos preciso para solicitar o reembolso?',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  message!: string;

  @ApiPropertyOptional({
    type: [AiHistoryMessageDto],
    description:
      'Histórico opcional da conversa para manter contexto entre turnos.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiHistoryMessageDto)
  history?: AiHistoryMessageDto[];
}
