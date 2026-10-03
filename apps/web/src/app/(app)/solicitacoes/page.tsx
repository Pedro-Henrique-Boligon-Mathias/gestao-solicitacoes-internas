import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { EstadoErro } from '@/components/estado-erro';
import { BarraFiltros } from '@/components/solicitacoes/barra-filtros';
import { BotaoNovaSolicitacao } from '@/components/solicitacoes/botao-nova-solicitacao';
import { ListaSolicitacoes } from '@/components/solicitacoes/lista-solicitacoes';
import { listarAreas, listarSolicitacoes, obterResumo } from '@/features/solicitacoes/consultas';
import { lerFiltros, temFiltroAtivo } from '@/features/solicitacoes/filtros';
import { obterUsuarioAtual } from '@/lib/api/autenticado';

export const metadata: Metadata = { title: 'Solicitações' };

/** Lista com filtros na URL, renderizada no servidor a cada mudança (ADR-012). */
export default async function PaginaSolicitacoes({ searchParams }: PageProps<'/solicitacoes'>) {
  const sessao = await obterUsuarioAtual();
  if (!sessao.autenticado) redirect('/api/sessao/encerrar');
  const { usuario } = sessao;
  // RF-02: o filtro por área é de quem analisa; para o solicitante, ?area= na URL é ignorado
  const filtraPorArea = usuario.cargo !== 'SOLICITANTE';
  const lidos = lerFiltros(await searchParams);
  const filtros = filtraPorArea ? lidos : { ...lidos, area: [] };

  const [pagina, resumo, areas] = await Promise.all([
    listarSolicitacoes(filtros),
    obterResumo(),
    filtraPorArea ? listarAreas() : undefined,
  ]);
  const total = pagina.ok ? pagina.dados.meta.total : undefined;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] max-[760px]:text-2xl">
            Solicitações
          </h1>
          {total !== undefined && (
            <p className="text-muted-foreground text-sm">
              {total} {total === 1 ? 'resultado' : 'resultados'}
              {temFiltroAtivo(filtros) ? ' com os filtros atuais' : ''}
            </p>
          )}
        </div>
        <div className="max-[760px]:w-full max-[760px]:[&>button]:h-11 max-[760px]:[&>button]:w-full">
          <BotaoNovaSolicitacao usuario={usuario} />
        </div>
      </div>

      {resumo.ok && (
        <BarraFiltros
          filtros={filtros}
          resumo={resumo.dados}
          // Se as áreas não carregarem, só a linha de área some
          areas={areas?.ok ? areas.dados : undefined}
        />
      )}

      {pagina.ok ? (
        <ListaSolicitacoes pagina={pagina.dados} filtros={filtros} usuario={usuario} />
      ) : (
        <section className="bg-card rounded-card">
          <EstadoErro
            titulo="Não foi possível carregar as solicitações"
            requestId={pagina.requestId}
          />
        </section>
      )}
    </>
  );
}
