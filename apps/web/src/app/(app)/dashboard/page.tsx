import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ConteudoDashboard } from '@/components/dashboard/conteudo-dashboard';
import { EstadoErro } from '@/components/estado-erro';
import { listarSolicitacoes, obterResumo } from '@/features/solicitacoes/consultas';
import { obterUsuarioAtual } from '@/lib/api/autenticado';

export const metadata: Metadata = { title: 'Dashboard' };

const VAZIA = {
  ok: true as const,
  dados: { data: [], meta: { page: 1, pageSize: 5, total: 0, totalPages: 0 } },
};

/** Dashboard: dados do usuário, sempre atuais (ADR-012). */
export default async function PaginaDashboard() {
  const sessao = await obterUsuarioAtual();
  if (!sessao.autenticado) redirect('/api/sessao/encerrar');
  const { usuario } = sessao;
  const analisa = usuario.cargo !== 'SOLICITANTE';

  const [resumo, fila, minhasAnalises, ultimas] = await Promise.all([
    obterResumo(),
    analisa
      ? listarSolicitacoes({ status: ['ABERTA'], ordenarPor: 'prioridade' }, 5)
      : Promise.resolve(VAZIA),
    analisa
      ? listarSolicitacoes({ status: ['EM_ANALISE'], analista: 'eu' }, 5)
      : Promise.resolve(VAZIA),
    analisa ? Promise.resolve(VAZIA) : listarSolicitacoes({}, 5),
  ]);

  const falha = [resumo, fila, minhasAnalises, ultimas].find((consulta) => !consulta.ok);
  if (falha && !falha.ok) {
    return (
      <section className="bg-card rounded-card">
        <EstadoErro titulo="Não foi possível carregar o dashboard" requestId={falha.requestId} />
      </section>
    );
  }
  if (!resumo.ok || !fila.ok || !minhasAnalises.ok || !ultimas.ok) return null;

  return (
    <ConteudoDashboard
      usuario={usuario}
      resumo={resumo.dados}
      fila={fila.dados.data}
      minhasAnalises={minhasAnalises.dados.data}
      ultimas={ultimas.dados.data}
    />
  );
}
