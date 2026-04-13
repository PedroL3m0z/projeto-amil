import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Rota acessível sem JWT válido no cookie. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
