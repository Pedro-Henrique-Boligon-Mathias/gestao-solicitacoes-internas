import { Module } from '@nestjs/common';
import { RepositorioSolicitacoes } from './application/repositorio-solicitacoes';
import { SolicitacoesService } from './application/solicitacoes.service';
import { SolicitacoesController } from './http/solicitacoes.controller';
import { RepositorioSolicitacoesPrisma } from './infra/repositorio-solicitacoes.prisma';

@Module({
  controllers: [SolicitacoesController],
  providers: [
    SolicitacoesService,
    { provide: RepositorioSolicitacoes, useClass: RepositorioSolicitacoesPrisma },
  ],
})
export class SolicitacoesModule {}
