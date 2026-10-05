import { Suspense } from 'react';
import {
  EsqueletoDataResumo,
  EsqueletoPainelGestao,
  EsqueletoResumo,
} from '@/components/esqueletos';
import type { Periodo } from '@/features/dashboard/periodo';
import type { UsuarioAtual } from '@/features/auth/usuario';
import { obterPainelGestao, obterResumo } from '@/features/solicitacoes/consultas';
import { BlocoPainelGestao } from './bloco-painel-gestao';
import { BlocoResumo, DataResumo } from './bloco-resumo';
import { IntegridadeHistorico } from './integridade-historico';
import { BarraTopo } from './partes';

/**
 * Dashboard do admin = painel de gestão (RF-04, Fase 3.5 · PR 4C), na ordem do mock: Visão geral
 * e os 4 status (resumo do período), Entrada e saída, Por área e Por analista, Integrações com
 * falha (GET /dashboard/gestao) e, por último, Integridade do histórico (RN-10, fora dos
 * <Suspense>: só chama a API no clique). As duas consultas saem juntas daqui e cada uma tem o
 * próprio <Suspense>, com esqueleto e erro próprios. A Visão geral também lê o painel (o fato e o botão
 * das falhas) num <Suspense> interno, sem esperar por ele para mostrar os números.
 * No celular as falhas sobem para logo depois dos status (`order-*`).
 */
export async function DashboardAdmin({
  usuario,
  periodo,
}: {
  usuario: UsuarioAtual;
  periodo: Periodo;
}) {
  // Em Tudo, o mesmo resumo sem argumento do contador do menu (cache() deduplica a chamada)
  const resumo = periodo === 'tudo' ? obterResumo() : obterResumo(periodo);
  const gestao = obterPainelGestao(periodo);

  return (
    <>
      <BarraTopo
        usuario={usuario}
        periodo={periodo}
        dados={
          <Suspense fallback={<EsqueletoDataResumo />}>
            <DataResumo resumo={resumo} />
          </Suspense>
        }
      />

      <div className="flex flex-col gap-4 max-[760px]:gap-3">
        <div className="order-1">
          <Suspense fallback={<EsqueletoResumo />}>
            <BlocoResumo usuario={usuario} resumo={resumo} gestao={gestao} />
          </Suspense>
        </div>
        <Suspense fallback={<EsqueletoPainelGestao className="order-3" />}>
          <BlocoPainelGestao gestao={gestao} />
        </Suspense>
        {/* Fora do Suspense do painel: aparece mesmo se ele falhar; só chama a API no clique */}
        <div className="order-6">
          <IntegridadeHistorico />
        </div>
      </div>
    </>
  );
}
