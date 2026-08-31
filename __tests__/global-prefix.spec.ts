import {
  Controller,
  Get,
  INestApplication,
  Module,
  Type,
} from '@nestjs/common';
import { AbstractHttpAdapter, NestFactory } from '@nestjs/core';
import supertest from 'supertest';

import { createModule } from '../src';

import { fastifyExtraWait } from './utils/fastifyExtraWait';
import { platforms } from './utils/platforms';

let app: INestApplication;

afterEach(async () => {
  await app.close();
});

function build(hits: string[]) {
  const fooModule = createModule<Record<string, never>>(
    () => (_req: unknown, _res: unknown, next: () => void) => {
      hits.push('hit');
      next();
    },
  );

  @Controller('/')
  class RootController {
    @Get()
    root() {
      return 'root';
    }
  }

  @Controller('nested')
  class NestedController {
    @Get()
    nested() {
      return 'nested';
    }
  }

  @Controller('health')
  class HealthController {
    @Get()
    health() {
      return 'health';
    }
  }

  @Module({
    imports: [fooModule.forRoot({})],
    controllers: [RootController, NestedController, HealthController],
  })
  class TestModule {}

  return TestModule;
}

async function start(
  testModule: Parameters<typeof NestFactory.create>[0],
  Adapter: Type<AbstractHttpAdapter<unknown, unknown, unknown>>,
  configure?: (app: INestApplication) => void,
) {
  app = await NestFactory.create(testModule, new Adapter(), { logger: false });
  configure?.(app);
  const server = app.getHttpServer();
  await app.init();
  await fastifyExtraWait(Adapter, app);
  return server;
}

for (const PlatformAdapter of platforms) {
  describe(PlatformAdapter.name, () => {
    it('applies the default route to every path when no global prefix is set', async () => {
      const hits: string[] = [];
      const server = await start(build(hits), PlatformAdapter);

      await supertest(server).get('/').expect(200);
      expect(hits).toHaveLength(1);

      await supertest(server).get('/nested').expect(200);
      expect(hits).toHaveLength(2);
    });

    // The express@4 `*` wildcard NestJS auto-converts to `/v1/{*path}`, which
    // does not match `/v1` itself — the reason the default is `{/*splat}`.
    it('applies the default route to the global prefix root itself', async () => {
      const hits: string[] = [];
      const server = await start(build(hits), PlatformAdapter, (a) =>
        a.setGlobalPrefix('v1'),
      );

      await supertest(server).get('/v1').expect(200);
      expect(hits).toHaveLength(1);

      await supertest(server).get('/v1/nested').expect(200);
      expect(hits).toHaveLength(2);
    });

    it('applies the default route to paths excluded from the global prefix', async () => {
      const hits: string[] = [];
      const server = await start(build(hits), PlatformAdapter, (a) =>
        a.setGlobalPrefix('v1', { exclude: ['health'] }),
      );

      await supertest(server).get('/health').expect(200);
      expect(hits).toHaveLength(1);

      await supertest(server).get('/v1/nested').expect(200);
      expect(hits).toHaveLength(2);
    });
  });
}
