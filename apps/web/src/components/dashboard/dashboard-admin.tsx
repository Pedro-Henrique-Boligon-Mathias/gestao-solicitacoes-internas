import { Suspense } from 'react';
import {
  EsqueletoDataResumo,
  EsqueletoGrafico,
  EsqueletoListas,
  EsqueletoResumo,
} from '@/components/esqueletos';
import type { UsuarioAtual } from '@/features/auth/usuario';
import { listarSolicitacoes, obterResumo } from '@/features/solicitacoes/consultas';
import { BlocoListas, type ListasDashboard } from './bloco-listas';
import { BlocoResumo, DataResumo, GraficoResumo } from './bloco-resumo';
import { BarraTopo } from './partes';

/**
 * Dashboard do admin no 4B: a "Visão geral" de antes (destaque, blocos de status, listas e o
 * gráfico por prioridade), agora com a atualização automática no destaque. Vira o painel de
 * gestão no 4C. As consultas saem juntas daqui e cada bloco tem o próprio <Suspense>.
 */
export async function DashboardAdmin({ usuario }: { usuario: UsuarioAtual }) {
  const resumo = obterResumo();
  const listas: ListasDashboard = {
    tipo: 'analise',
    fila: listarSolicitacoes({ status: ['ABERTA'], ordenarPor: 'prioridade' }, 5),
    minhasAnalises: listarSolicitacoes({ status: ['EM_ANALISE'], analista: 'eu' }, 5),
  };

  return (
    <>
      <BarraTopo
        usuario={usuario}
        dados={
          <Suspense fallback={<EsqueletoDataResumo />}>
            <DataResumo resumo={resumo} />
          </Suspense>
        }
      />

      <Suspense fallback={<EsqueletoResumo />}>
        <BlocoResumo usuario={usuario} resumo={resumo} fila={listas.fila} />
      </Suspense>

      <div className="flex flex-wrap items-start gap-4 max-[760px]:gap-3">
        <div className="flex min-w-0 flex-[7_1_480px] flex-col gap-4 empty:hidden max-[760px]:gap-3">
          <Suspense fallback={<EsqueletoListas quantidade={2} />}>
            <BlocoListas usuario={usuario} resumo={resumo} listas={listas} />
          </Suspense>
        </div>
        <Suspense fallback={<EsqueletoGrafico />}>
          <GraficoResumo resumo={resumo} />
        </Suspense>
      </div>
    </>
  );
}
