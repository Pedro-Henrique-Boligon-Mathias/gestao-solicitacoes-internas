import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type EstadoComponente = 'up' | 'down';

@Injectable()
export class VerificadorBanco {
  private readonly logger = new Logger(VerificadorBanco.name);

  constructor(private readonly prisma: PrismaService) {}

  async verificar(): Promise<EstadoComponente> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch (erro) {
      this.logger.warn({ err: erro }, 'Banco de dados indisponível');
      return 'down';
    }
  }
}
