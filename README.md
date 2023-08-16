<h1 align="center">create-nestjs-middleware-module</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/create-nestjs-middleware-module">
    <img alt="npm" src="https://img.shields.io/npm/v/create-nestjs-middleware-module" />
  </a>
  <a href="https://www.npmjs.com/package/create-nestjs-middleware-module">
    <img alt="npm" src="https://img.shields.io/npm/dm/create-nestjs-middleware-module" />
  </a>
  <a href="https://github.com/iamolegga/create-nestjs-middleware-module/actions">
    <img alt="GitHub branch checks state" src="https://badgen.net/github/checks/iamolegga/create-nestjs-middleware-module">
  </a>
  <a href="https://codeclimate.com/github/iamolegga/create-nestjs-middleware-module/test_coverage">
    <img src="https://api.codeclimate.com/v1/badges/88d8895855b09e2b6600/test_coverage" />
  </a>
  <a href="https://snyk.io/test/github/iamolegga/create-nestjs-middleware-module">
    <img alt="Known Vulnerabilities" src="https://snyk.io/test/github/iamolegga/create-nestjs-middleware-module/badge.svg" />
  </a>
  <a href="https://libraries.io/npm/create-nestjs-middleware-module">
    <img alt="Libraries.io" src="https://img.shields.io/librariesio/release/npm/create-nestjs-middleware-module">
  </a>
  <img alt="Dependabot" src="https://badgen.net/github/dependabot/iamolegga/create-nestjs-middleware-module">
  <img alt="Supported platforms: Express & Fastify" src="https://img.shields.io/badge/platforms-Express%20%26%20Fastify-green" />
</p>

<p align="center">NestJS configured middleware module made simple</p>

## What is it?

It is a tiny helper library that helps you create simple _idiomatic_ **NestJS** module based on `Express`/`Fastify` middleware in just a few lines of code with routing out of the box.

## Install

```sh
npm i create-nestjs-middleware-module
```

or

```sh
yarn add create-nestjs-middleware-module
```

## Usage

Let's imaging you have some middleware factory, for example, simple logger:

```ts
export interface Options {
  maxDuration: number
}

export function createResponseDurationLoggerMiddleware(opts: Options) {
  return (request, response, next) => {
    const start = Date.now();

    response.on('finish', () => {
      const message = `${request.method} ${request.path} - ${duration}ms`;

      const duration = Date.now() - start;

      if (duration > maxDuration) {
        console.warn(message);
      } else {
        console.log(message);
      }
    });

    next();
  };
}
```

And you want to create an idiomatic NestJS module based on that middleware. Just pass this middleware factory to `createModule` function:

```ts
import { createModule } from 'create-nestjs-middleware-module';
import { Options, createResponseDurationLoggerMiddleware } from './middleware';

export const TimingModule = createModule<Options>(createResponseDurationLoggerMiddleware);
```

That's it, your module is ready. Let's see what API it has:

```ts
import { TimingModule } from './timing-module';
import { MyController } from './my.controller';

@Module({
  imports: [

    // 1. `.forRoot()` method accept params satisfying `Options` interface
    TimingModule.forRoot({ maxDuration: 1000 }),

    // 2. `.forRoot()` method accept additional optional routing params
    TimingModule.forRoot({
      maxDuration: 1000,

      // both `forRoutes` and `exclude` properties are optional
      // and has the same API as NestJS buil-in `MiddlewareConfigProxy`
      // @see https://docs.nestjs.com/middleware#applying-middleware
      forRoutes: [MyController],
      exclude: [{ method: RequestMethod.ALL, path: 'always-fast' }],
    }),

    // 3. `.forRootAsync()` method with only factory
    TimingModule.forRootAsync({
      useFactory: async () => {
        return { maxDuration: 1000 }
      }
    }),

    // 4. `.forRootAsync()` method with dependencies
    TimingModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        return { maxDuration: config.maxDurationForAPIHandler }
      }
    }),

    // 5. `.forRootAsync()` method with routing
    TimingModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        return {
          maxDuration: config.maxDurationForAPIHandler

          // both `forRoutes` and `exclude` properties are optional
          // and has the same API as NestJS buil-in `MiddlewareConfigProxy`
          // @see https://docs.nestjs.com/middleware#applying-middleware
          forRoutes: [MyController],
          exclude: [{ method: RequestMethod.ALL, path: 'always-fast' }],
        };
      }
    }),
  ]
  controllers: [MyController /*, ... */]
})
class App {}
```

## More examples

See examples of usage in `__tests__` folder or [nestjs-session](https://github.com/iamolegga/nestjs-session/blob/master/src/index.ts) and [nestjs-cookie-session](https://github.com/iamolegga/nestjs-cookie-session/blob/master/src/index.ts) packages

## Notes

1. `createModule` callback function can return not only one middleware, but array of it.

```ts
import { createModule } from 'create-nestjs-middleware-module';


interface Options {
  // ...
}

createModule<Options>((options) => {
  function firstMidlleware() { /* ... */ }
  function secondMidlleware() { /* ... */ }
  return [firstMidlleware, secondMidlleware]
});
```

2. If your `Options` interface has not __required__ properties it can be frustrating to force end-users of your module to call `forRoot({})`, and for better developer expirience you can cast `createModule(...)` result to `FacadeModuleStaticOptional<Options>`, then `forRoot()` could be called without arguments and without TS error. In such case `createModule` callback function will be called with empty object `{}`.

```ts
import { createModule, FacadeModuleStaticOptional } from 'create-nestjs-middleware-module';

interface Options {
  maxDuration?: number;
}

createModule<Options>((options) => {
  typeof options // always "object" even if not passed to `forRoot()`

  return (request, response, next) => {
    // ...
    next();
  };
}) as FacadeModuleStaticOptional<Options>;
```

3. For better developer experience of end-users of your module you can also export interfaces of `forRoot` and `forRootAsync` argument:

```ts
import {
  AsyncOptions,
  SyncOptions,
} from 'create-nestjs-middleware-module';

interface Options {
  // ...
}

export type MyModuleOptions = SyncOptions<Options>;

export type MyModuleAsyncOptions = AsyncOptions<Options>;
```

4. This library is tested against `express` and `fastify`. But you should be aware that middlewares of `express` are not always work with `fastify` and vise versa. Sometimes you can check platforms internally. Sometimes maybe it's better to create 2 separate modules for each platform. It's up to you.

<h2 align="center">Do you use this library?<br/>Don't be shy to give it a star! ★</h2>

<h3 align="center">Also if you are into NestJS you might be interested in one of my <a href="https://github.com/iamolegga#nestjs">other NestJS libs</a>.</h3>
