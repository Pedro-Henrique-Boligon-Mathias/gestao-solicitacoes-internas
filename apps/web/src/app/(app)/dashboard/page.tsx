import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { BlocoListas, type ListasDashboard } from '@/components/dashboard/bloco-listas';
import { BlocoResumo, DataResumo, GraficoResumo } from '@/components/dashboard/bloco-resumo';
import { BarraTopo } from '@/components/dashboard/partes';
import {
  EsqueletoDataResumo,
  EsqueletoGrafico,
  EsqueletoListas,
  EsqueletoResumo,
} from '@/components/esqueletos';
import { listarSolicitacoes, obterResumo } from '@/features/solicitacoes/consultas';
import { obterUsuarioAtual } from '@/lib/api/autenticado';

export const metadata: Metadata = { title: 'Dashboard' };

/**
 * Dashboard: dados do usuário, sempre atuais (ADR-012). Só a sessão é esperada aqui; o cabeçalho
 * aparece na hora e o resumo e as listas chegam cada um no seu <Suspense>, com esqueleto e erro
 * próprios (RF-04, RNF-05). As consultas saem juntas daqui e nenhum bloco espera outro.
 */
export default async function PaginaDashboard() {
  const sessao = await obterUsuarioAtual();
  if (!sessao.autenticado) redirect('/api/sessao/encerrar');
  const { usuario } = sessao;

  const resumo = obterResumo();
  const listas: ListasDashboard =
    usuario.cargo === 'SOLICITANTE'
      ? { tipo: 'solicitante', ultimas: listarSolicitacoes({}, 5) }
      : {
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
        <BlocoResumo
          usuario={usuario}
          resumo={resumo}
          {...(listas.tipo === 'analise' ? { fila: listas.fila } : { ultimas: listas.ultimas })}
        />
      </Suspense>

      <div className="flex flex-wrap items-start gap-4 max-[760px]:gap-3">
        <div className="flex min-w-0 flex-[7_1_480px] flex-col gap-4 empty:hidden max-[760px]:gap-3">
          <Suspense fallback={<EsqueletoListas quantidade={listas.tipo === 'analise' ? 2 : 1} />}>
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
