/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { DynamicModule, Inject, Module, RequestMethod } from '@nestjs/common';
import {
  FactoryProvider,
  MiddlewareConfigProxy,
  MiddlewareConsumer,
  ModuleMetadata,
  Provider,
  Type,
} from '@nestjs/common/interfaces';

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

// for support of nestjs@8 we don't use
//   extends Pick<FactoryProvider, 'provide' | 'useFactory'>
// as it's `useFactory` return type in v8 is `T` instead of `T | Promise<T>` as
// in feature versions, so it's not compatible
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

const DEFAULT_ROUTES = [{ path: '*', method: RequestMethod.ALL }];
const DEFAULT_OPTIONS: SyncOptions<{}> = {};

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
    ) {}

    configure(consumer: MiddlewareConsumer) {
      const {
        exclude,
        forRoutes = DEFAULT_ROUTES,
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
  }

  return CreateNestjsMiddlewareModule;
}
