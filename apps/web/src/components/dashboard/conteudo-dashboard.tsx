import { ArrowUpRight, CircleCheck, CircleX, Clock, Inbox, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { EstadoVazio } from '@/components/estado-vazio';
import { BotaoIniciarAnalise } from '@/components/solicitacoes/botao-iniciar-analise';
import { BotaoNovaSolicitacao } from '@/components/solicitacoes/botao-nova-solicitacao';
import { CodigoSolicitacao } from '@/components/solicitacoes/codigo-solicitacao';
import { DataRelativa } from '@/components/solicitacoes/data-relativa';
import { SeloPrioridade } from '@/components/solicitacoes/selo-prioridade';
import { CORES_STATUS, SeloStatus } from '@/components/solicitacoes/selo-status';
import { Button } from '@/components/ui/button';
import type { UsuarioAtual } from '@/features/auth/usuario';
import { formatarData, formatarDiaMes, formatarRelativo } from '@/features/solicitacoes/datas';
import { ROTULO_STATUS_PLURAL } from '@/features/solicitacoes/rotulos';
import {
  STATUS,
  type ItemSolicitacao,
  type ResumoDashboard,
  type Status,
} from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';
import { GraficoPrioridade } from './grafico-prioridade';

const ICONE_STATUS: Record<Status, LucideIcon> = {
  ABERTA: Inbox,
  EM_ANALISE: Clock,
  APROVADA: CircleCheck,
  REJEITADA: CircleX,
};

const URL_FILA = '/solicitacoes?status=ABERTA&ordenarPor=prioridade';

const percentual = (valor: number, total: number) =>
  total > 0 ? Math.round((valor / total) * 100) : 0;

/**
 * Dashboard: card de destaque com o total e a próxima ação, blocos de status que levam à
 * lista filtrada, gráfico por prioridade e as listas do cargo (fila e análises, ou as últimas).
 */
export function ConteudoDashboard({
  usuario,
  resumo,
  fila,
  minhasAnalises,
  ultimas,
}: {
  usuario: UsuarioAtual;
  resumo: ResumoDashboard;
  fila: ItemSolicitacao[];
  minhasAnalises: ItemSolicitacao[];
  ultimas: ItemSolicitacao[];
}) {
  const geral = resumo.escopo === 'GERAL';
  const analisa = usuario.cargo !== 'SOLICITANTE';

  if (resumo.total === 0) {
    return (
      <>
        <BarraTopo usuario={usuario} geradoEm={resumo.geradoEm} />
        <section className="bg-card rounded-card">
          <h1 className="sr-only">{geral ? 'Visão geral' : 'Suas solicitações'}</h1>
          <EstadoVazio
            Icone={Inbox}
            titulo={
              geral ? 'Nenhuma solicitação registrada ainda' : 'Você ainda não tem solicitações'
            }
            acao={<BotaoNovaSolicitacao usuario={usuario} rotulo="Criar a primeira" />}
          >
            Abra a primeira e acompanhe o andamento por aqui.
          </EstadoVazio>
        </section>
      </>
    );
  }

  // RN-07: ninguém analisa a própria solicitação; a próxima é a primeira da fila que não é sua
  const proxima = fila.find((item) => item.solicitante.id !== usuario.id);

  return (
    <>
      <BarraTopo usuario={usuario} geradoEm={resumo.geradoEm} />

      <div className="flex flex-wrap gap-4 max-[760px]:gap-3">
        <Destaque titulo={geral ? 'Visão geral' : 'Suas solicitações'} resumo={resumo}>
          {analisa ? (
            <>
              <div className="text-hero-muted flex flex-col gap-1.5 text-sm">
                <p className="text-hero-foreground">
                  {resumo.filaAlta} de alta prioridade esperam na fila
                </p>
                {resumo.aberturaMaisAntiga && (
                  <p>A mais antiga entrou na fila {formatarRelativo(resumo.aberturaMaisAntiga)}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2.5">
                {proxima && (
                  <BotaoIniciarAnalise
                    id={proxima.id}
                    rotulo="Iniciar a próxima"
                    variant="orange"
                  />
                )}
                <Button variant="hero" asChild>
                  <Link href={URL_FILA}>Ver a fila</Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              {ultimas[0] && (
                <p className="text-hero-muted text-sm">
                  A mais recente é{' '}
                  <span className="text-hero-foreground font-mono">{ultimas[0].codigo}</span>,
                  aberta em {formatarDiaMes(ultimas[0].dataSolicitacao)}.
                </p>
              )}
              <div className="flex flex-wrap gap-2.5">
                {ultimas[0] && (
                  <Button variant="orange" asChild>
                    <Link href={`/solicitacoes/${ultimas[0].id}`}>Ver a mais recente</Link>
                  </Button>
                )}
                <Button variant="hero" asChild>
                  <Link href="/solicitacoes">Ver todas</Link>
                </Button>
              </div>
            </>
          )}
        </Destaque>

        <div className="grid min-w-0 flex-[7_1_420px] grid-cols-2 gap-4 max-[760px]:gap-3">
          {STATUS.map((status) => (
            <BlocoStatus
              key={status}
              status={status}
              valor={resumo.porStatus[status]}
              total={resumo.total}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4 max-[760px]:gap-3">
        <div className="flex min-w-0 flex-[7_1_480px] flex-col gap-4 max-[760px]:gap-3">
          {analisa ? (
            <>
              <CardLista
                titulo="Fila de análise"
                subtitulo="As 5 abertas mais urgentes"
                href={URL_FILA}
                vazio="Nenhuma solicitação esperando análise."
              >
                {fila.map((item) => (
                  <LinhaItem
                    key={item.id}
                    item={item}
                    detalhe={
                      <>
                        {item.area.nome} · aberta <DataRelativa iso={item.dataSolicitacao} />
                      </>
                    }
                    acao={
                      item.solicitante.id !== usuario.id ? (
                        <BotaoIniciarAnalise id={item.id} variant="soft" size="sm" />
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
                {minhasAnalises.map((item) => (
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
          ) : (
            <CardLista
              titulo="Minhas últimas solicitações"
              subtitulo="As 5 mais recentes"
              href="/solicitacoes"
              vazio="Nenhuma solicitação ainda."
            >
              {ultimas.map((item) => (
                <LinhaItem
                  key={item.id}
                  item={item}
                  detalhe={
                    <>
                      Aberta <DataRelativa iso={item.dataSolicitacao} />
                    </>
                  }
                  acao={<SeloStatus status={item.status} />}
                />
              ))}
            </CardLista>
          )}
        </div>

        <section
          aria-labelledby="titulo-prioridade"
          className="bg-card rounded-card flex min-w-0 flex-[5_1_320px] flex-col gap-2 p-5"
        >
          <h2
            id="titulo-prioridade"
            className="font-display text-lg leading-[1.2] font-semibold tracking-[-0.02em]"
          >
            Por prioridade
          </h2>
          <p className="text-muted-foreground text-[13px]">
            Como {geral ? `as ${resumo.total}` : `as suas ${resumo.total}`} se dividem
          </p>
          <GraficoPrioridade resumo={resumo} />
        </section>
      </div>
    </>
  );
}

/** Linha de ações da página: a principal ("Nova solicitação") no canto direito. */
function BarraTopo({ usuario, geradoEm }: { usuario: UsuarioAtual; geradoEm: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 max-[760px]:[&>button]:h-11 max-[760px]:[&>button]:w-full">
      <p className="text-muted-foreground text-sm">
        Dados de{' '}
        <time dateTime={geradoEm} className="font-mono text-[13px] tabular-nums">
          {formatarData(geradoEm)}
        </time>
      </p>
      <BotaoNovaSolicitacao usuario={usuario} />
    </div>
  );
}

function Destaque({
  titulo,
  resumo,
  children,
}: {
  titulo: string;
  resumo: ResumoDashboard;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby="titulo-destaque"
      className="bg-hero text-hero-foreground rounded-card relative isolate flex min-w-0 flex-[5_1_340px] flex-col gap-4 overflow-hidden p-5"
    >
      {/* Anéis decorativos no canto */}
      <span
        aria-hidden="true"
        className="border-brand-orange/60 absolute -right-16 -bottom-24 -z-10 size-64 rounded-full border"
      />
      <span
        aria-hidden="true"
        className="border-brand-orange/40 absolute -right-6 -bottom-12 -z-10 size-40 rounded-full border"
      />
      <div className="flex flex-col gap-1">
        <h1
          id="titulo-destaque"
          className="font-display text-lg leading-[1.2] font-semibold tracking-[-0.02em]"
        >
          {titulo}
        </h1>
        <p className="text-hero-muted text-[13px]">
          {resumo.escopo === 'GERAL'
            ? 'Todas as solicitações, de todas as áreas'
            : 'Tudo o que você abriu e o andamento de cada uma'}
        </p>
      </div>
      <p className="flex items-end gap-3">
        <span className="font-display text-[84px] leading-[0.95] font-semibold tracking-[-0.035em] max-[760px]:text-[64px]">
          {resumo.total}
        </span>
        <span className="text-hero-muted pb-2 text-sm">no total</span>
      </p>
      <div
        aria-hidden="true"
        className="flex h-1.5 w-full max-w-[420px] gap-0.5 overflow-hidden rounded-full"
      >
        {STATUS.filter((s) => resumo.porStatus[s] > 0).map((status) => (
          <span
            key={status}
            className={cn('h-full', CORES_STATUS[status].barra)}
            style={{ flexGrow: resumo.porStatus[status] }}
          />
        ))}
      </div>
      {children}
    </section>
  );
}

function BlocoStatus({ status, valor, total }: { status: Status; valor: number; total: number }) {
  const Icone = ICONE_STATUS[status];
  const pct = percentual(valor, total);
  return (
    <Link
      href={`/solicitacoes?status=${status}`}
      className="bg-tile rounded-card hover:bg-muted/60 focus-visible:outline-ring flex min-w-0 flex-col gap-3 px-5 py-[18px] transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 max-[760px]:px-4 max-[760px]:py-3.5"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span
            aria-hidden="true"
            className={cn('size-2 rounded-full', CORES_STATUS[status].ponto)}
          />
          {ROTULO_STATUS_PLURAL[status]}
        </span>
        <span
          aria-hidden="true"
          className={cn('rounded-field grid size-9 place-items-center', CORES_STATUS[status].selo)}
        >
          <Icone className="size-[18px]" strokeWidth={1.8} />
        </span>
      </span>
      <span className="flex flex-wrap items-end justify-between gap-x-2">
        <span className="font-display text-5xl leading-[0.95] font-semibold tracking-[-0.035em] max-[760px]:text-[38px]">
          {valor}
        </span>
        <span className="text-muted-foreground text-[12.5px]">{pct}% do total</span>
      </span>
      <span aria-hidden="true" className="bg-muted h-1 w-full overflow-hidden rounded-full">
        <span
          className={cn('block h-full rounded-full', CORES_STATUS[status].barra)}
          style={{ width: `${pct}%` }}
        />
      </span>
    </Link>
  );
}

function CardLista({
  titulo,
  subtitulo,
  href,
  vazio,
  children,
}: {
  titulo: string;
  subtitulo: string;
  href: string;
  vazio: string;
  children: ReactNode[];
}) {
  return (
    <section className="bg-card rounded-card flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg leading-[1.2] font-semibold tracking-[-0.02em]">
            {titulo}
          </h2>
          <p className="text-muted-foreground text-[13px]">{subtitulo}</p>
        </div>
        <Link
          href={href}
          aria-label={`Abrir na lista: ${titulo.toLowerCase()}`}
          className="text-foreground hover:bg-muted focus-visible:outline-ring grid size-9 flex-none place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--border)] transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      {children.length > 0 ? (
        <ul className="flex flex-col">{children}</ul>
      ) : (
        <p className="text-muted-foreground py-6 text-center text-sm">{vazio}</p>
      )}
    </section>
  );
}

function LinhaItem({
  item,
  detalhe,
  acao,
}: {
  item: ItemSolicitacao;
  detalhe: ReactNode;
  acao: ReactNode;
}) {
  return (
    <li className="hover:bg-muted rounded-row relative flex items-center gap-x-4 gap-y-2 px-3 py-2.5 transition-colors duration-150 max-[760px]:flex-wrap max-[760px]:px-0">
      <CodigoSolicitacao codigo={item.codigo} className="w-[86px] flex-none max-[760px]:w-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 max-[760px]:basis-full">
        <Link
          href={`/solicitacoes/${item.id}`}
          className="focus-visible:outline-ring rounded-sm font-medium outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {item.titulo}
        </Link>
        <span className="text-muted-foreground text-[12.5px]">{detalhe}</span>
      </div>
      <SeloPrioridade prioridade={item.prioridade} />
      <span className="flex min-w-[112px] justify-end max-[760px]:min-w-0">{acao}</span>
    </li>
  );
}
