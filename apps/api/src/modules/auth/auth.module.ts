import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { CargosGuard } from '../../common/guards/cargos.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { Env } from '../../config/env';
import { AutenticacaoService } from './application/autenticacao.service';
import { RepositorioAuth } from './application/repositorio-auth';
import { AuthController } from './http/auth.controller';
import { LimiteDeTentativasGuard } from './http/limite-de-tentativas.guard';
import { RepositorioAuthPrisma } from './infra/repositorio-auth.prisma';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    // 5 requisições por minuto; o LimiteDeTentativasGuard define a chave (e-mail no login, hash do token no refresh)
    ThrottlerModule.forRoot({ throttlers: [{ name: 'auth', ttl: 60_000, limit: 5 }] }),
  ],
  controllers: [AuthController],
  providers: [
    AutenticacaoService,
    LimiteDeTentativasGuard,
    { provide: RepositorioAuth, useClass: RepositorioAuthPrisma },
    // Guards globais, nesta ordem: quem é você (JwtAuthGuard) → seu cargo pode (CargosGuard)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CargosGuard },
  ],
})
export class AuthModule {}
