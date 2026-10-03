import { Global, Module } from '@nestjs/common';
import { ContextoBanco } from './contexto-banco';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, ContextoBanco],
  exports: [PrismaService, ContextoBanco],
})
export class DatabaseModule {}
