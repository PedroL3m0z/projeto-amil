import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/**
 * Habilita `req.cookies`. Se `COOKIE_SECRET` existir, cookies assinados pelo parser são validados.
 * O JWT continua sendo o próprio valor do cookie (não é “signed cookie” do cookie-parser).
 */
export function useCookieParser(app: INestApplication): void {
  app.use(cookieParser(process.env.COOKIE_SECRET || undefined));
}
