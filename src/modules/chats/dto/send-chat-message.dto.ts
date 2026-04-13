import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendChatMessageDto {
  @ApiProperty({
    example: 'Olá! Tudo bem?',
    description: 'Texto da mensagem a ser enviada para o chat.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  text!: string;
}
