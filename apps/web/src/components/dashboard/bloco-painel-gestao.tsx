import { EstadoErro } from '@/components/estado-erro';
import type { Consulta } from '@/features/solicitacoes/consultas';
import type { PainelGestao } from '@/features/solicitacoes/tipos';
import { AtualizacaoAutomatica } from './atualizacao-automatica';
import { EntradaSaida } from './entrada-saida';
import { IntegracoesComFalha } from './integracoes-com-falha';
import { PorAnalista } from './por-analista';
import { PorArea } from './por-area';

/**
 * Blocos do painel de gestão (GET /dashboard/gestao), num só <Suspense>: Entrada e saída, Por
 * área e Por analista, Integrações com falha. Devolve um fragmento para os blocos serem filhos
 * diretos da coluna do dashboard e poderem trocar de ordem no celular (as falhas sobem para
 * logo depois dos status) só com `order-*`, sem mudar a ordem do DOM.
 */
export async function BlocoPainelGestao({ gestao }: { gestao: Promise<Consulta<PainelGestao>> }) {
  const consulta = await gestao;
  if (!consulta.ok) {
    return (
      <section className="bg-card rounded-card order-3">
        <EstadoErro
          titulo="Não foi possível carregar o painel de gestão"
          requestId={consulta.requestId}
        />
      </section>
    );
  }

  const painel = consulta.dados;
  return (
    <>
      <div className="order-3">
        <EntradaSaida
          dados={painel.entradaSaida}
          periodo={painel.periodo}
          canto={
            // Só o rótulo: o polling é o da Visão geral, para não chamar router.refresh() duas vezes.
            <AtualizacaoAutomatica
              geradoEm={painel.geradoEm}
              atualizar={false}
              className="max-[760px]:hidden"
            />
          }
        />
      </div>
      <div className="order-4 flex flex-wrap items-start gap-4 max-[760px]:gap-3 [&>*]:min-w-0">
        <div className="flex-[7_1_480px]">
          <PorArea areas={painel.porArea} />
        </div>
        <div className="flex-[5_1_320px]">
          <PorAnalista analistas={painel.porAnalista} />
        </div>
      </div>
      <div className="order-5 max-[760px]:order-2">
        <IntegracoesComFalha integracoes={painel.integracoesComFalha} />
      </div>
    </>
  );
}
