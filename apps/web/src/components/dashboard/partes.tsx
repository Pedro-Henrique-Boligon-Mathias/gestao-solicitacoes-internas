/**
 * Peças visuais do dashboard, sem consulta: os blocos assíncronos (bloco-resumo e bloco-listas)
 * montam a tela com elas.
 */
import { saudacao } from '@/lib/saudacao';
import { ArrowUpRight, CircleCheck, CircleX, Clock, Inbox, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Children, type ReactNode } from 'react';
import { BotaoNovaSolicitacao } from '@/components/solicitacoes/botao-nova-solicitacao';
import { CodigoSolicitacao } from '@/components/solicitacoes/codigo-solicitacao';
import { IconePrioridade, SeloPrioridade } from '@/components/solicitacoes/selo-prioridade';
import { CORES_STATUS } from '@/components/solicitacoes/selo-status';
import type { UsuarioAtual } from '@/features/auth/usuario';
import type { Periodo } from '@/features/dashboard/periodo';
import { ROTULO_PRIORIDADE, ROTULO_STATUS_PLURAL } from '@/features/solicitacoes/rotulos';
import {
  STATUS,
  type ItemSolicitacao,
  type ResumoDashboard,
  type Status,
} from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';
import { SeletorPeriodo } from './seletor-periodo';

const ICONE_STATUS: Record<Status, LucideIcon> = {
  ABERTA: Inbox,
  EM_ANALISE: Clock,
  APROVADA: CircleCheck,
  REJEITADA: CircleX,
};

export const URL_FILA = '/solicitacoes?status=ABERTA&ordenarPor=prioridade';

/** Percentual inteiro (sem casas decimais). */
const percentual = (valor: number, total: number) =>
  total > 0 ? Math.round((valor / total) * 100) : 0;

/**
 * Linha de ações da página: a data dos dados à esquerda e a ação principal ("Nova solicitação")
 * no canto direito. Não espera consulta nenhuma: a data chega com o resumo, em `dados`.
 */
/**
 * Dashboard que cabe na tela (variante `tela`: desktop com altura suficiente). A coluna ocupa a
 * altura da janela e as listas rolam dentro dos cards; em telas menores a página rola normalmente.
 */
export const CLASSE_DASHBOARD_TELA =
  'flex flex-col gap-4 max-[760px]:gap-3 tela:h-[calc(100dvh-2rem)]';

export function BarraTopo({
  usuario,
  dados,
  periodo,
}: {
  usuario: UsuarioAtual;
  dados: ReactNode;
  /** Com o período, o cabeçalho ganha o seletor (vale só para os indicadores). */
  periodo?: Periodo;
}) {
  const primeiroNome = usuario.nome.split(' ')[0];
  return (
    // Cabeçalho do dashboard: saudação e data à esquerda, período e "Nova solicitação" à direita
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-1 pt-1">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="font-display text-2xl leading-tight font-semibold tracking-[-0.03em]">
          {saudacao()}, <span className="text-muted-foreground font-normal">{primeiroNome}</span>
        </p>
        <div className="flex min-h-5 items-center">{dados}</div>
      </div>
      <div className="flex items-center gap-3">
        {periodo && <SeletorPeriodo periodo={periodo} />}
        {/* No celular, quem cria é o "+" da barra de navegação */}
        <BotaoNovaSolicitacao usuario={usuario} className="max-[760px]:hidden" />
      </div>
    </header>
  );
}

export function Destaque({
  titulo,
  resumo,
  canto,
  children,
}: {
  titulo: string;
  resumo: ResumoDashboard;
  /** Canto direito do cabeçalho do card (o "atualizado há N s" do admin). */
  canto?: ReactNode;
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
      <div className="flex items-start justify-between gap-3">
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
        {canto}
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

export function BlocoStatus({
  status,
  valor,
  total,
  compacto = false,
}: {
  status: Status;
  valor: number;
  total: number;
  /** Faixa do solicitante: sem o ícone e com o número menor. */
  compacto?: boolean;
}) {
  const Icone = ICONE_STATUS[status];
  const pct = percentual(valor, total);
  return (
    <Link
      href={`/solicitacoes?status=${status}`}
      // Nome falado inteiro: "Aprovadas: 14 solicitações, 35% do total"
      aria-label={`${ROTULO_STATUS_PLURAL[status]}: ${valor} ${valor === 1 ? 'solicitação' : 'solicitações'}, ${pct}% do total`}
      className="bg-tile rounded-card hover:bg-muted/60 focus-visible:outline-ring flex min-w-0 flex-col gap-3 px-5 py-[18px] tela:gap-2 tela:py-3.5 transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 max-[760px]:px-4 max-[760px]:py-3.5"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span
            aria-hidden="true"
            className={cn('size-2 rounded-full', CORES_STATUS[status].ponto)}
          />
          {ROTULO_STATUS_PLURAL[status]}
        </span>
        {compacto ? null : (
          <span
            aria-hidden="true"
            className={cn(
              'rounded-field grid size-9 place-items-center tela:size-8',
              CORES_STATUS[status].selo,
            )}
          >
            <Icone className="size-[18px]" strokeWidth={1.8} />
          </span>
        )}
      </span>
      <span className="flex flex-wrap items-end justify-between gap-x-2">
        <span
          className={cn(
            'font-display leading-[0.95] font-semibold tracking-[-0.035em]',
            compacto ? 'text-[34px]' : 'text-5xl max-[760px]:text-[38px] tela:text-[40px]',
          )}
        >
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

export function CardLista({
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
  children: ReactNode;
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
          className="text-foreground hover:bg-muted focus-visible:outline-ring grid size-9 flex-none place-items-center rounded-full max-[760px]:size-11 shadow-[inset_0_0_0_1px_var(--border)] transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      {Children.count(children) > 0 ? (
        <ul className="flex flex-col">{children}</ul>
      ) : (
        <p className="text-muted-foreground py-6 text-center text-sm">{vazio}</p>
      )}
    </section>
  );
}

export function LinhaItem({
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

/** Selo de prioridade sobre o card escuro (fundo translúcido, texto claro). */
export function ChipPrioridadeHero({ prioridade }: { prioridade: ItemSolicitacao['prioridade'] }) {
  return (
    <span className="text-hero-foreground inline-flex h-[22px] items-center gap-1.5 rounded-pill bg-white/10 px-2.5 text-xs font-medium">
      <IconePrioridade prioridade={prioridade} />
      {ROTULO_PRIORIDADE[prioridade]}
    </span>
  );
}

/**
 * Título de card com o total ao lado, em mono ("Minhas análises 4"). O espaço entre os dois é
 * texto de verdade, para o nome acessível sair "Minhas análises 4" e não "Minhas análises4".
 */
export function TituloComTotal({
  id,
  titulo,
  total,
  nivel = 'h2',
  escuro = false,
}: {
  id: string;
  titulo: string;
  total?: number;
  nivel?: 'h2' | 'h3';
  escuro?: boolean;
}) {
  const Tag = nivel;
  return (
    <Tag id={id} className="font-display text-lg leading-[1.2] font-semibold tracking-[-0.02em]">
      {titulo}
      {total !== undefined ? (
        <>
          {' '}
          <span
            className={cn(
              'font-mono text-[15px] font-medium tabular-nums',
              escuro ? 'text-hero-muted' : 'text-muted-foreground',
            )}
          >
            {total}
          </span>
        </>
      ) : null}
    </Tag>
  );
}

/** Botão redondo do canto do card, que abre a mesma lista na tela de solicitações. */
export function LinkCanto({
  href,
  rotulo,
  escuro = false,
}: {
  href: string;
  rotulo: string;
  escuro?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={rotulo}
      className={cn(
        'grid size-9 flex-none place-items-center rounded-full transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 max-[760px]:size-11',
        escuro
          ? 'text-hero-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255/25%)] hover:bg-white/10 focus-visible:outline-brand-orange'
          : 'text-foreground hover:bg-muted focus-visible:outline-ring shadow-[inset_0_0_0_1px_var(--border)]',
      )}
    >
      <ArrowUpRight aria-hidden="true" className="size-4" />
    </Link>
  );
}

/** Anéis decorativos laranja no canto do card escuro. */
export function AneisHero() {
  return (
    <>
      <span
        aria-hidden="true"
        className="border-brand-orange/60 absolute -right-16 -bottom-24 -z-10 size-64 rounded-full border"
      />
      <span
        aria-hidden="true"
        className="border-brand-orange/40 absolute -right-6 -bottom-12 -z-10 size-40 rounded-full border"
      />
    </>
  );
}
