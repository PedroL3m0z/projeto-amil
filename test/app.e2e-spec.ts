import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { useCookieParser } from './../src/http-bootstrap';

/** Evita login 401 quando o Redis local tem hash de senha de outro ambiente. */
const E2E_REDIS_KEYS = [
  'app:settings:auth_password_hash',
  'app:settings:gemini_api_key',
] as const;

describe('Auth JWT + cookie (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'e2e-jwt-secret-test';
    process.env.AUTH_USERNAME = 'e2e_user';
    process.env.AUTH_PASSWORD = 'e2e_pass';

    const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
    try {
      await redis.connect();
      for (const k of E2E_REDIS_KEYS) {
        await redis.del(k);
      }
    } finally {
      await redis.quit().catch(() => undefined);
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    useCookieParser(app);
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    delete process.env.JWT_SECRET;
    delete process.env.AUTH_USERNAME;
    delete process.env.AUTH_PASSWORD;
    await app.close();
  });

  it('GET /api/chats sem cookie retorna 401', () => {
    return request(app.getHttpServer()).get('/api/chats').expect(401);
  });

  it('GET /api/auth/me sem cookie retorna user null', () => {
    return request(app.getHttpServer())
      .get('/api/auth/me')
      .expect(200)
      .expect({ user: null });
  });

  it('após login, cookie permite GET /api/chats', async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/api/auth/login')
      .send({ username: 'e2e_user', password: 'e2e_pass' })
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({ user: { username: 'e2e_user' } });
      });

    const res = await agent.get('/api/chats').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
