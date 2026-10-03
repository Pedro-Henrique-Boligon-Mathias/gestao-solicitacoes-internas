import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CONFIGURACAO_INTEGRACAO, lerConfiguracaoIntegracao } from '../../config/integracao';
import { RepositorioSolicitacoes } from './application/repositorio-solicitacoes';
import { SolicitacoesService } from './application/solicitacoes.service';
import { SolicitacoesController } from './http/solicitacoes.controller';
import { RepositorioSolicitacoesPrisma } from './infra/repositorio-solicitacoes.prisma';

@Module({
  controllers: [SolicitacoesController],
  providers: [
    SolicitacoesService,
    { provide: RepositorioSolicitacoes, useClass: RepositorioSolicitacoesPrisma },
    {
      // Mesmo OUTBOX_MAX_TENTATIVAS do worker, para o detalhe mostrar "tentativa N de M"
      provide: CONFIGURACAO_INTEGRACAO,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        lerConfiguracaoIntegracao(config.get<string>('OUTBOX_MAX_TENTATIVAS')),
    },
  ],
})
export class SolicitacoesModule {}
