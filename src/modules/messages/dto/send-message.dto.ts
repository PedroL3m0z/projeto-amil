import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    example: '5585999999999',
    description:
      'Número destino (com DDI) ou JID completo. Se for número, será convertido para @s.whatsapp.net.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  to!: string;

  @ApiProperty({
    example: 'Olá! Mensagem de teste.',
    description: 'Texto a ser enviado para o destinatário.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  text!: string;
}
