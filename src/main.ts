import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { useCookieParser } from './http-bootstrap';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !process.env.JWT_SECRET) {
    throw new Error('Defina JWT_SECRET no ambiente para produção.');
  }
  if (!isProd && !process.env.JWT_SECRET) {
    new Logger('Bootstrap').warn(
      'JWT_SECRET não definido — usando segredo só para desenvolvimento.',
    );
  }

  const app = await NestFactory.create(AppModule);
  useCookieParser(app);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Projeto Amil API')
    .setDescription('Documentação da API do Projeto Amil')
    .setVersion('1.0.0')
    .addCookieAuth('access_token')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  new Logger('Bootstrap').log('Swagger disponível em /api/docs');
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
