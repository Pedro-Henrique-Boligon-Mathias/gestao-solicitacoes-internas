import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CONFIGURACAO_INTEGRACAO, lerConfiguracaoIntegracao } from '../../config/integracao';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { GestaoService } from './gestao.service';
import { ConsultasGestao } from './infra/consultas-gestao';

@Module({
  controllers: [DashboardController],
  providers: [
    DashboardService,
    GestaoService,
    ConsultasGestao,
    {
      // Mesmo OUTBOX_MAX_TENTATIVAS do worker, para as integrações com falha mostrarem "N de M"
      provide: CONFIGURACAO_INTEGRACAO,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        lerConfiguracaoIntegracao(config.get<string>('OUTBOX_MAX_TENTATIVAS')),
    },
  ],
})
export class DashboardModule {}
