import {
  DynamicModule,
  FactoryProvider,
  Inject,
  MiddlewareConsumer,
  Module,
  ModuleMetadata,
  Provider,
  RequestMethod,
  Type,
} from '@nestjs/common';
import { ApplicationConfig } from '@nestjs/core';

// NestJS 12 ships an exports map, under which the `@nestjs/common/interfaces`
// deep import no longer resolves, and the package root re-exports every name
// used here but `MiddlewareConfigProxy`. `MiddlewareConsumer.apply` returns it,
// so it is recovered from there and the option types stay exactly as before.
type MiddlewareConfigProxy = ReturnType<MiddlewareConsumer['apply']>;

export type SyncOptions<T> = T & {
  /**
   * Same as NestJS buil-in `MiddlewareConfigProxy.forRoutes`
   * @see https://docs.nestjs.com/middleware#applying-middleware.
   * Use `forRoutes` and `exclude` to control which path should exec passed middleware.
   */
  forRoutes?: Parameters<MiddlewareConfigProxy['forRoutes']>;
  /**
   * Same as NestJS buil-in `MiddlewareConfigProxy.exclude`
   * @see https://docs.nestjs.com/middleware#applying-middleware.
   * Use `forRoutes` and `exclude` to control which path should exec passed middleware.
   */
  exclude?: Parameters<MiddlewareConfigProxy['exclude']>;
};

// `useFactory` is spelled out instead of
//   extends Pick<FactoryProvider, 'provide' | 'useFactory'>
// so that the published option type stays independent of how NestJS types its
// own factory provider
export interface AsyncOptions<T> extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: any[]) => SyncOptions<T> | Promise<SyncOptions<T>>;
  inject?: any[];
}

export interface FacadeModuleStatic<T> {
  forRoot(options: SyncOptions<T>): DynamicModule;
  forRootAsync(options: AsyncOptions<T>): DynamicModule;
}

export interface FacadeModuleStaticOptional<T> {
  forRoot(options?: SyncOptions<T>): DynamicModule;
  forRootAsync(options: AsyncOptions<T>): DynamicModule;
}

/**
 * path-to-regexp v8, used by express@5 and @fastify/middie@9, no longer accepts
 * the unnamed `*` wildcard. NestJS auto-converts it, but warns while doing so
 * as soon as a global prefix is set — and the conversion it picks, `/v1/{*path}`,
 * does not match the prefix root itself, so a request to `/v1` reached no
 * middleware at all.
 *
 * The missing leading slash is deliberate, and is supported upstream: since
 * @nestjs/common@11.0.8 `addLeadingSlash` leaves a path starting with `{/`
 * alone. A global prefix is then applied as `/v1{/*splat}`, which matches both
 * `/v1` and everything under it.
 */
const DEFAULT_ROUTES = [{ path: '{/*splat}', method: RequestMethod.ALL }];
const DEFAULT_OPTIONS: SyncOptions<Record<string, unknown>> = {};

export function createModule<T>(
  createMiddlewares: (
    options: T,
  ) => Function | Type<unknown> | Array<Type<unknown> | Function>,
): FacadeModuleStatic<T> {
  const optionsToken = Symbol('create-nestjs-middleware-module:options');

  @Module({})
  class CreateNestjsMiddlewareModule {
    static forRoot(options: SyncOptions<T>): DynamicModule {
      const optionsProvider: Provider<SyncOptions<T>> = {
        provide: optionsToken,
        useValue: options || null,
      };

      return {
        module: CreateNestjsMiddlewareModule,
        providers: [optionsProvider],
      };
    }

    static forRootAsync(options: AsyncOptions<T>): DynamicModule {
      const optionsProvider: FactoryProvider<
        SyncOptions<T> | Promise<SyncOptions<T>>
      > = {
        provide: optionsToken,
        useFactory: options.useFactory,
        inject: options.inject,
      };

      return {
        module: CreateNestjsMiddlewareModule,
        imports: options.imports,
        providers: [optionsProvider],
      };
    }

    constructor(
      @Inject(optionsToken)
      private readonly options: SyncOptions<T> | null,
      private readonly applicationConfig: ApplicationConfig,
    ) {}

    configure(consumer: MiddlewareConsumer) {
      const {
        exclude,
        forRoutes = this.defaultRoutes(),
        ...createMiddlewaresOpts
      } = this.options || DEFAULT_OPTIONS;
      const result = createMiddlewares(createMiddlewaresOpts as T);

      let middlewares: Array<Function | Type<unknown>>;

      if (Array.isArray(result)) {
        middlewares = result;
      } else {
        middlewares = [result];
      }

      if (exclude) {
        consumer
          .apply(...middlewares)
          .exclude(...exclude)
          .forRoutes(...forRoutes);
      } else {
        consumer.apply(...middlewares).forRoutes(...forRoutes);
      }
    }

    /**
     * A path excluded from the global prefix is served outside of it, while
     * `DEFAULT_ROUTES` is prefixed like any other middleware route, so such a
     * path would be left without middleware. NestJS adds excluded paths back
     * on its own, but only for routes that `RouteInfoPathExtractor.isAWildcard`
     * recognises — which `{/*splat}`, with its leading slash deliberately
     * missing, is not.
     *
     * Only the default applies: an explicit `forRoutes` is the caller's own.
     */
    private defaultRoutes() {
      const { exclude } = this.applicationConfig.getGlobalPrefixOptions();

      return [
        ...DEFAULT_ROUTES,
        ...(exclude ?? []).map(({ path, requestMethod }) => ({
          path,
          method: requestMethod,
        })),
      ];
    }
  }

  return CreateNestjsMiddlewareModule;
}
