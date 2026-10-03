import './config/zod';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { ContextoModule } from './common/context/contexto.module';
import { LoggingModule } from './common/logging/logging.module';
import { validarEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEnv,
      // Em produção (containers) as variáveis vêm do ambiente; localmente, do .env da raiz.
      envFilePath: ['.env', '../../.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
    LoggingModule,
    ContextoModule,
    DatabaseModule,
    HealthModule,
  ],
  providers: [
    // DTOs zod validam body, params e query, e as respostas marcadas com @ZodSerializerDto
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  ],
})
export class AppModule {}
