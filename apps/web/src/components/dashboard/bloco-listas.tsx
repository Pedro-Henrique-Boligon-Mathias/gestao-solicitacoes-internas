import { EstadoErro } from '@/components/estado-erro';
import { BotaoIniciarAnalise } from '@/components/solicitacoes/botao-iniciar-analise';
import { DataRelativa } from '@/components/solicitacoes/data-relativa';
import { SeloStatus } from '@/components/solicitacoes/selo-status';
import type { UsuarioAtual } from '@/features/auth/usuario';
import type { Consulta } from '@/features/solicitacoes/consultas';
import type { PaginaSolicitacoes, ResumoDashboard } from '@/features/solicitacoes/tipos';
import { CardLista, LinhaItem, URL_FILA } from './partes';

type PromessaLista = Promise<Consulta<PaginaSolicitacoes>>;

/** As listas do dashboard do admin: a fila e as análises com ele. */
export type ListasDashboard = {
  tipo: 'analise';
  fila: PromessaLista;
  minhasAnalises: PromessaLista;
};

/**
 * Bloco das listas do dashboard do admin (RF-04). As requisições já saíram em paralelo na página; aqui
 * só a renderização espera também o resumo: sem solicitações, o bloco do resumo mostra o estado
 * vazio e as listas não aparecem. Se o resumo falhou, as listas aparecem normalmente. Uma falha
 * numa lista mostra o erro só neste bloco.
 */
export async function BlocoListas({
  usuario,
  resumo,
  listas,
}: {
  usuario: UsuarioAtual;
  resumo: Promise<Consulta<ResumoDashboard>>;
  listas: ListasDashboard;
}) {
  const [consultaResumo, ...consultas] = await Promise.all([
    resumo,
    listas.fila,
    listas.minhasAnalises,
  ]);

  if (consultaResumo.ok && consultaResumo.dados.total === 0) return null;

  const falha = consultas.find((consulta) => !consulta.ok);
  if (falha && !falha.ok) {
    return (
      <section className="bg-card rounded-card">
        <EstadoErro titulo="Não foi possível carregar as listas" requestId={falha.requestId} />
      </section>
    );
  }
  const [primeira = [], segunda = []] = consultas.map((consulta) =>
    consulta.ok ? consulta.dados.data : [],
  );

  return (
    <>
      <CardLista
        titulo="Fila de análise"
        subtitulo="As 5 abertas mais urgentes"
        href={URL_FILA}
        vazio="Nenhuma solicitação esperando análise."
      >
        {primeira.map((item) => (
          <LinhaItem
            key={item.id}
            item={item}
            detalhe={
              <>
                {item.area.nome} · aberta <DataRelativa iso={item.dataSolicitacao} />
              </>
            }
            acao={
              // RN-07: ninguém analisa a própria solicitação
              item.solicitante.id !== usuario.id ? (
                <BotaoIniciarAnalise
                  id={item.id}
                  variant="soft"
                  size="sm"
                  className="max-[760px]:h-11 max-[760px]:px-4"
                />
              ) : (
                <span className="text-muted-foreground text-xs">Sua solicitação</span>
              )
            }
          />
        ))}
      </CardLista>
      <CardLista
        titulo="Minhas análises em andamento"
        subtitulo="Em análise com você como responsável"
        href="/solicitacoes?status=EM_ANALISE&analista=eu"
        vazio="Nenhuma análise em andamento com você."
      >
        {segunda.map((item) => (
          <LinhaItem
            key={item.id}
            item={item}
            detalhe={
              <>
                {item.area.nome} · atualizada <DataRelativa iso={item.atualizadoEm} />
              </>
            }
            acao={<SeloStatus status={item.status} />}
          />
        ))}
      </CardLista>
    </>
  );
}
