import { ChevronLeft, CircleCheck, CircleX } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { UsuarioAtual } from '@/features/auth/usuario';
import { formatarData } from '@/features/solicitacoes/datas';
import { ROTULO_STATUS } from '@/features/solicitacoes/rotulos';
import type { EventoHistorico, Solicitacao } from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';
import { AcoesSolicitacao } from './acoes-solicitacao';
import { CodigoSolicitacao } from './codigo-solicitacao';
import { LinhaDoTempo } from './linha-do-tempo';
import { SeloPrioridade } from './selo-prioridade';
import { SeloStatus } from './selo-status';

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : ''}`.toUpperCase();
}

/** Data do último início de análise no histórico (a faixa "Com você desde"). */
function inicioDaAnalise(historico: EventoHistorico[]): string | undefined {
  return historico.findLast((evento) => evento.tipo === 'ANALISE_INICIADA')?.criadoEm;
}

/** Detalhe da solicitação: cabeçalho com ações, faixa do responsável, decisão, dados e histórico. */
export function DetalheSolicitacao({
  solicitacao,
  historico,
  usuario,
}: {
  solicitacao: Solicitacao;
  historico: EventoHistorico[];
  usuario: UsuarioAtual;
}) {
  const comVoce = solicitacao.status === 'EM_ANALISE' && solicitacao.analista?.id === usuario.id;
  const desde = comVoce ? (inicioDaAnalise(historico) ?? solicitacao.atualizadoEm) : undefined;
  const { decisao } = solicitacao;
  const temAcoes = solicitacao.acoesPermitidas.length > 0;

  return (
    <div className={cn('flex flex-col gap-4 max-[760px]:gap-3', temAcoes && 'max-[760px]:pb-20')}>
      <Link
        href="/solicitacoes"
        className="text-link rounded-field focus-visible:outline-ring flex w-fit items-center gap-1.5 px-1 text-sm font-semibold outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Voltar para solicitações
      </Link>

      <section className="bg-card rounded-card flex flex-wrap items-end justify-between gap-4 p-6 max-[760px]:p-5">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2">
          <CodigoSolicitacao codigo={solicitacao.codigo} />
          <h1 className="font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] break-words max-[760px]:text-2xl">
            {solicitacao.titulo}
          </h1>
          <div className="flex flex-wrap gap-2 pt-1">
            <SeloStatus status={solicitacao.status} />
            <SeloPrioridade prioridade={solicitacao.prioridade} />
          </div>
        </div>
        <AcoesSolicitacao solicitacao={solicitacao} usuario={usuario} />
      </section>

      <div className="flex flex-wrap items-start gap-4 max-[760px]:gap-3">
        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-4 max-[760px]:gap-3">
          {desde && (
            <div className="bg-hero text-hero-foreground rounded-card flex items-center gap-3.5 px-5 py-4">
              <span
                aria-hidden="true"
                className="bg-brand-orange grid size-8 flex-none place-items-center rounded-full text-xs font-semibold text-[#14213D]"
              >
                {iniciais(usuario.nome)}
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="font-display font-semibold tracking-[-0.01em]">
                  Com você desde {formatarData(desde)}
                </p>
                <p className="text-hero-muted text-[13px]">
                  Aprove ou rejeite com um comentário. A decisão fica no histórico.
                </p>
              </div>
            </div>
          )}

          {decisao && (
            <section
              aria-labelledby="titulo-decisao"
              className={cn(
                'bg-card rounded-card flex gap-3.5 p-5',
                decisao.resultado === 'APROVADA'
                  ? 'shadow-[inset_0_0_0_1px_var(--status-aprovada-bg)]'
                  : 'shadow-[inset_0_0_0_1px_var(--status-rejeitada-bg)]',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'rounded-field grid size-9 flex-none place-items-center',
                  decisao.resultado === 'APROVADA'
                    ? 'bg-status-aprovada-bg text-status-aprovada-fg'
                    : 'bg-status-rejeitada-bg text-status-rejeitada-fg',
                )}
              >
                {decisao.resultado === 'APROVADA' ? (
                  <CircleCheck className="size-4" strokeWidth={1.8} />
                ) : (
                  <CircleX className="size-4" strokeWidth={1.8} />
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <h2 id="titulo-decisao" className="text-muted-foreground text-xs font-medium">
                  Decisão
                </h2>
                <p className="font-semibold">
                  {ROTULO_STATUS[decisao.resultado]} por {decisao.decididoPor.nome}
                </p>
                <time
                  dateTime={decisao.decididoEm}
                  className="text-muted-foreground font-mono text-[12.5px] tabular-nums"
                >
                  {formatarData(decisao.decididoEm)}
                </time>
                <p className="bg-muted rounded-field mt-1 px-3 py-2.5 text-[13px] leading-normal whitespace-pre-wrap">
                  {decisao.comentario}
                </p>
              </div>
            </section>
          )}

          <section
            aria-labelledby="titulo-descricao"
            className="bg-card rounded-card flex flex-col gap-4 p-5"
          >
            <h2
              id="titulo-descricao"
              className="font-display text-lg leading-[1.2] font-semibold tracking-[-0.02em]"
            >
              Descrição
            </h2>
            <p className="max-w-[64ch] text-[15px] leading-[1.6] break-words whitespace-pre-wrap">
              {solicitacao.descricao}
            </p>
            <dl className="border-border grid grid-cols-[max-content_1fr] gap-x-5 gap-y-2 border-t pt-4 text-sm">
              <Dado rotulo="Solicitante">{solicitacao.solicitante.nome}</Dado>
              <Dado rotulo="Área">{solicitacao.area.nome}</Dado>
              <Dado rotulo="Aberta em" mono>
                {formatarData(solicitacao.dataSolicitacao)}
              </Dado>
              <Dado rotulo="Responsável">{solicitacao.analista?.nome ?? 'Ainda sem analista'}</Dado>
              <Dado rotulo="Última atualização" mono>
                {formatarData(solicitacao.atualizadoEm)}
              </Dado>
            </dl>
          </section>
        </div>

        <section
          aria-labelledby="titulo-historico"
          className="bg-card rounded-card flex min-w-0 flex-[1_1_320px] flex-col gap-4 p-5"
        >
          <h2
            id="titulo-historico"
            className="font-display text-lg leading-[1.2] font-semibold tracking-[-0.02em]"
          >
            Histórico
          </h2>
          <LinhaDoTempo eventos={historico} />
        </section>
      </div>
    </div>
  );
}

function Dado({ rotulo, mono, children }: { rotulo: string; mono?: boolean; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className={cn('min-w-0', mono && 'font-mono text-[13px] tabular-nums')}>{children}</dd>
    </>
  );
}
