import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'node:crypto';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly settingsService: SettingsService,
  ) {}

  async validateCredentials(username: string, password: string): Promise<boolean> {
    const expectedUser = process.env.AUTH_USERNAME?.trim();
    if (!expectedUser) {
      return false;
    }
    if (username !== expectedUser) {
      return false;
    }
    const storedHash = await this.settingsService.getPasswordHash();
    if (storedHash) {
      return this.settingsService.verifyStoredPassword(password);
    }
    const expectedPass = process.env.AUTH_PASSWORD ?? '';
    try {
      const a = Buffer.from(password, 'utf8');
      const b = Buffer.from(expectedPass, 'utf8');
      if (a.length !== b.length) {
        return false;
      }
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  signAccessToken(username: string): string {
    return this.jwtService.sign({ sub: username, username });
  }

  verifyAccessToken(token: string): { username: string } | null {
    try {
      const payload = this.jwtService.verify<{ username: string }>(token);
      return { username: payload.username };
    } catch {
      return null;
    }
  }
}
