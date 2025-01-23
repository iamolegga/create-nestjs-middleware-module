import {
  Controller,
  Get,
  INestApplication,
  Module,
  RequestMethod,
  Type,
} from '@nestjs/common';
import { AbstractHttpAdapter, NestFactory } from '@nestjs/core';
import supertest from 'supertest';

import { createModule, FacadeModuleStaticOptional } from '../src';

import { fastifyExtraWait } from './utils/fastifyExtraWait';
import { platforms } from './utils/platforms';

interface FooModuleParams {
  foo: string;
}

interface FooModuleParamsOptional {
  foo?: string;
}

let app: INestApplication;

async function prepareServer(
  testModule: Parameters<typeof NestFactory.create>[0],
  Adapter: Type<AbstractHttpAdapter<unknown, unknown, unknown>>,
) {
  app = await NestFactory.create(testModule, new Adapter(), {
    logger: false,
  });
  const server = app.getHttpServer();

  await app.init();
  await fastifyExtraWait(Adapter, app);
  return server;
}

const params: FooModuleParams = { foo: 'bar' };

afterEach(async () => {
  await app.close();
});

for (const PlatformAdapter of platforms) {
  describe(PlatformAdapter.name, () => {
    it('empty forRoot() and casting to FacadeModuleStaticOptional<T> calls with empty object', async () => {
      const createMiddleware = jest.fn(
        (_params) => (_req: unknown, _res: unknown, next: () => void) => {
          next();
        },
      );

      const fooModule = createModule<FooModuleParamsOptional>(
        createMiddleware,
      ) as FacadeModuleStaticOptional<FooModuleParamsOptional>;

      @Controller('/')
      class TestController {
        @Get()
        get() {}
      }

      @Module({
        imports: [fooModule.forRoot()],
        controllers: [TestController],
      })
      class TestModule {}

      const server = await prepareServer(TestModule, PlatformAdapter);

      await supertest(server).get('/');

      expect(createMiddleware).toHaveBeenCalledWith({});
    });

    it('forRoot() arguments are correct', async () => {
      const createMiddleware = jest.fn(
        (_params) => (_req: unknown, _res: unknown, next: () => void) => {
          next();
        },
      );

      const fooModule = createModule<FooModuleParams>(createMiddleware);

      @Controller('/')
      class TestController {
        @Get()
        get() {}
      }

      @Module({
        imports: [fooModule.forRoot(params)],
        controllers: [TestController],
      })
      class TestModule {}

      const server = await prepareServer(TestModule, PlatformAdapter);

      await supertest(server).get('/');

      expect(createMiddleware).toHaveBeenCalledWith(params);
    });

    it('forRootAsync() arguments are correct', async () => {
      const createMiddleware = jest.fn(
        (_params) => (_req: unknown, _res: unknown, next: () => void) => {
          next();
        },
      );

      const fooModule = createModule<FooModuleParams>(createMiddleware);

      @Controller('/')
      class TestController {
        @Get()
        get() {}
      }

      @Module({
        imports: [
          fooModule.forRootAsync({
            useFactory: (): FooModuleParams | Promise<FooModuleParams> =>
              params,
          }),
        ],
        controllers: [TestController],
      })
      class TestModule {}

      const server = await prepareServer(TestModule, PlatformAdapter);

      await supertest(server).get('/');

      expect(createMiddleware).toHaveBeenCalledWith(params);
    });

    it('createModule callback returning array works correct', async () => {
      const m1 = jest.fn();
      const m2 = jest.fn();

      const createMiddleware = jest.fn((_params) => [
        (_req: unknown, _res: unknown, next: () => void) => {
          m1();
          next();
        },
        (_req: unknown, _res: unknown, next: () => void) => {
          m2();
          next();
        },
      ]);

      const fooModule = createModule<FooModuleParams>(createMiddleware);

      @Controller('/')
      class TestController {
        @Get()
        get() {}
      }

      @Module({
        imports: [fooModule.forRoot(params)],
        controllers: [TestController],
      })
      class TestModule {}

      const server = await prepareServer(TestModule, PlatformAdapter);

      await supertest(server).get('/');

      expect(m1.mock.calls).toHaveLength(1);
      expect(m2.mock.calls).toHaveLength(1);
      expect(createMiddleware).toHaveBeenCalledWith(params);
    });

    it('routing arguments are correct', async () => {
      const countFn = jest.fn();

      const createMiddleware = jest.fn(
        (_params) => (_req: unknown, _res: unknown, next: () => void) => {
          countFn();
          next();
        },
      );

      const fooModule = createModule<FooModuleParams>(createMiddleware);

      @Controller('/')
      class TestController {
        @Get('allow')
        allowed() {}

        @Get('forbid')
        forbidden() {}
      }

      @Module({
        imports: [
          fooModule.forRoot({
            forRoutes: [TestController],
            exclude: [{ method: RequestMethod.ALL, path: 'forbid' }],
            ...params,
          }),
        ],
        controllers: [TestController],
      })
      class TestModule {}

      const server = await prepareServer(TestModule, PlatformAdapter);

      await supertest(server).get('/allow');
      await supertest(server).get('/forbid');

      expect(createMiddleware).toHaveBeenCalledWith(params);
      expect(countFn).toHaveBeenCalledTimes(1);
    });
  });
}
