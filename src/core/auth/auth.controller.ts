import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ChangePasswordDto } from '../settings/dto/change-password.dto';
import { SettingsService } from '../settings/settings.service';
import { ACCESS_TOKEN_COOKIE } from './auth.constants';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

type AuthedReq = Request & { user: { userId: string; username: string } };

function cookieBase() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProd,
    path: '/',
  };
}

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly settingsService: SettingsService,
  ) {}

  @Public()
  @Get('me')
  @ApiOperation({ summary: 'Retorna o usuário autenticado com base no cookie JWT.' })
  @ApiOkResponse({
    description: 'Sessão atual.',
    schema: { example: { user: { username: 'admin' } } },
  })
  @ApiCookieAuth('access_token')
  me(@Req() req: Request) {
    const cookies = req.cookies as Record<string, string> | undefined;
    const raw = cookies?.[ACCESS_TOKEN_COOKIE];
    if (typeof raw !== 'string') {
      return { user: null };
    }
    const user = this.authService.verifyAccessToken(raw);
    return { user };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Realiza login e grava cookie httpOnly de acesso.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string', example: 'admin' },
        password: { type: 'string', example: 'admin123' },
      },
      required: ['username', 'password'],
    },
  })
  @ApiOkResponse({
    description: 'Usuário autenticado com sucesso.',
    schema: { example: { user: { username: 'admin' } } },
  })
  @ApiUnauthorizedResponse({ description: 'Credenciais inválidas.' })
  async login(
    @Body() body: { username?: string; password?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const username = body.username;
    const password = body.password;
    if (typeof username !== 'string' || typeof password !== 'string') {
      throw new BadRequestException('Informe usuário e senha.');
    }
    if (!(await this.authService.validateCredentials(username, password))) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    const token = this.authService.signAccessToken(username);
    res.cookie(ACCESS_TOKEN_COOKIE, token, {
      ...cookieBase(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { user: { username } };
  }

  @HttpCode(HttpStatus.OK)
  @Post('password')
  @ApiOperation({ summary: 'Altera a senha do utilizador (grava hash no Redis).' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  @ApiCookieAuth('access_token')
  async changePassword(@Req() req: AuthedReq, @Body() body: ChangePasswordDto) {
    const username = req.user?.username;
    if (typeof username !== 'string') {
      throw new UnauthorizedException();
    }
    if (!(await this.authService.validateCredentials(username, body.currentPassword))) {
      throw new ForbiddenException('Senha atual incorreta.');
    }
    await this.settingsService.setPasswordFromPlain(body.newPassword);
    return { ok: true as const };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  @ApiOperation({ summary: 'Efetua logout removendo o cookie de sessão.' })
  @ApiOkResponse({
    description: 'Logout efetuado.',
    schema: { example: { ok: true } },
  })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, cookieBase());
    return { ok: true };
  }
}
