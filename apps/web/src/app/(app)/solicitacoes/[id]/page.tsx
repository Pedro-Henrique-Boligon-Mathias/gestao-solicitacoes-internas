import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { EstadoErro } from '@/components/estado-erro';
import { DetalheSolicitacao } from '@/components/solicitacoes/detalhe-solicitacao';
import { detalharSolicitacao, historicoSolicitacao } from '@/features/solicitacoes/consultas';
import { ehIdDeSolicitacao } from '@/features/solicitacoes/id';
import { obterUsuarioAtual } from '@/lib/api/autenticado';

export const metadata: Metadata = { title: 'Solicitação' };

/** Detalhe: inexistente ou invisível para o usuário vira 404 (a API responde 404 nos dois). */
export default async function PaginaDetalhe({ params }: PageProps<'/solicitacoes/[id]'>) {
  const { id } = await params;
  if (!ehIdDeSolicitacao(id)) notFound();

  const sessao = await obterUsuarioAtual();
  if (!sessao.autenticado) redirect('/api/sessao/encerrar');

  const [detalhe, historico] = await Promise.all([
    detalharSolicitacao(id),
    historicoSolicitacao(id),
  ]);
  if (!detalhe.ok && (detalhe.status === 404 || detalhe.status === 400)) notFound();
  if (!detalhe.ok || !historico.ok) {
    const falha = !detalhe.ok ? detalhe : !historico.ok ? historico : undefined;
    return (
      <section className="bg-card rounded-card">
        <EstadoErro titulo="Não foi possível carregar a solicitação" requestId={falha?.requestId} />
      </section>
    );
  }

  return (
    <DetalheSolicitacao
      solicitacao={detalhe.dados}
      historico={historico.dados}
      usuario={sessao.usuario}
    />
  );
}
