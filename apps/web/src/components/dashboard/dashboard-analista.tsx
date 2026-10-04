import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { EsqueletoDataResumo, EsqueletoListas, EsqueletoResumo } from '@/components/esqueletos';
import { EstadoErro } from '@/components/estado-erro';
import { BotaoIniciarAnalise } from '@/components/solicitacoes/botao-iniciar-analise';
import { CodigoSolicitacao } from '@/components/solicitacoes/codigo-solicitacao';
import { SeloPrioridade } from '@/components/solicitacoes/selo-prioridade';
import { Button } from '@/components/ui/button';
import type { UsuarioAtual } from '@/features/auth/usuario';
import { rotuloPeriodo, type Periodo } from '@/features/dashboard/periodo';
import { listarSolicitacoes, obterResumo, type Consulta } from '@/features/solicitacoes/consultas';
import { formatarData, formatarHaDias } from '@/features/solicitacoes/datas';
import { ROTULO_PRIORIDADE } from '@/features/solicitacoes/rotulos';
import {
  STATUS,
  type ItemSolicitacao,
  type PaginaSolicitacoes,
  type ResumoDashboard,
} from '@/features/solicitacoes/tipos';
import { AbasSeuTrabalho } from './abas-seu-trabalho';
import { AtualizacaoAutomatica } from './atualizacao-automatica';
import { DataResumo } from './bloco-resumo';
import { GraficoPrioridade } from './grafico-prioridade';
import {
  AneisHero,
  BarraTopo,
  BlocoStatus,
  ChipPrioridadeHero,
  LinkCanto,
  TituloComTotal,
  URL_FILA,
} from './partes';
import { TileTotal } from './seus-numeros';

type PromessaResumo = Promise<Consulta<ResumoDashboard>>;
type PromessaLista = Promise<Consulta<PaginaSolicitacoes>>;

const URL_MINHAS_ANALISES = '/solicitacoes?status=EM_ANALISE&analista=eu';

/**
 * Dashboard do analista (RF-04, RN-07): "Seu trabalho" (Minhas análises e a Fila, lado a lado no
 * desktop e em abas no celular) e depois os "Indicadores" de todas as áreas. As três consultas
 * saem juntas daqui. As listas não esperam o resumo: o que vem dele no card da fila (a frase de
 * prioridade alta e o "atualizado há") chega num <Suspense> próprio. Só os "Indicadores" seguem
 * o período; "Seu trabalho" mostra sempre o estado atual.
 */
export async function DashboardAnalista({
  usuario,
  periodo = 'tudo',
}: {
  usuario: UsuarioAtual;
  periodo?: Periodo;
}) {
  // Sem período, o mesmo resumo do contador do menu (deduplicado por requisição)
  const resumo = obterResumo();
  const resumoPeriodo = periodo === 'tudo' ? resumo : obterResumo(periodo);
  const fila = listarSolicitacoes({ status: ['ABERTA'], ordenarPor: 'prioridade' }, 5);
  const minhasAnalises = listarSolicitacoes(
    { status: ['EM_ANALISE'], analista: 'eu', ordenarPor: 'prioridade' },
    5,
  );

  return (
    <>
      <h1 className="sr-only">Dashboard</h1>
      <BarraTopo
        usuario={usuario}
        periodo={periodo}
        dados={
          <Suspense fallback={<EsqueletoDataResumo />}>
            <DataResumo resumo={resumo} />
          </Suspense>
        }
      />

      <section aria-labelledby="titulo-seu-trabalho" className="flex flex-col gap-3">
        <h2 id="titulo-seu-trabalho" className={CLASSE_TITULO_SECAO}>
          Seu trabalho
        </h2>
        <Suspense
          fallback={
            <EsqueletoListas
              quantidade={2}
              className="min-[761px]:grid min-[761px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
            />
          }
        >
          <SeuTrabalho
            usuario={usuario}
            resumo={resumo}
            fila={fila}
            minhasAnalises={minhasAnalises}
          />
        </Suspense>
      </section>

      <Suspense fallback={<EsqueletoResumo />}>
        <Indicadores resumo={resumoPeriodo} periodo={periodo} />
      </Suspense>
    </>
  );
}

const CLASSE_TITULO_SECAO =
  'text-muted-foreground px-1 text-[13px] font-semibold tracking-[0.06em] uppercase';

/**
 * As duas listas de "Seu trabalho", num bloco só: as abas do celular precisam dos dois totais
 * (meta.total de cada consulta). Uma falha em qualquer uma mostra o erro só aqui.
 */
async function SeuTrabalho({
  usuario,
  resumo,
  fila: promessaFila,
  minhasAnalises: promessaMinhas,
}: {
  usuario: UsuarioAtual;
  resumo: PromessaResumo;
  fila: PromessaLista;
  minhasAnalises: PromessaLista;
}) {
  const [fila, minhas] = await Promise.all([promessaFila, promessaMinhas]);
  if (!fila.ok || !minhas.ok) {
    const falha = !fila.ok ? fila : !minhas.ok ? minhas : undefined;
    return (
      <section className="bg-card rounded-card">
        <EstadoErro titulo="Não foi possível carregar as listas" requestId={falha?.requestId} />
      </section>
    );
  }

  return (
    <AbasSeuTrabalho
      totalMinhasAnalises={minhas.dados.meta.total}
      totalFila={fila.dados.meta.total}
      minhasAnalises={
        <CardMinhasAnalises
          itens={minhas.dados.data}
          total={minhas.dados.meta.total}
          rotulo={
            <Suspense fallback={null}>
              <RotuloAtualizacao resumo={resumo} atualizar={false} />
            </Suspense>
          }
        />
      }
      fila={
        <CardFila
          usuario={usuario}
          itens={fila.dados.data}
          total={fila.dados.meta.total}
          subtitulo={
            <Suspense fallback={null}>
              <SubtituloFila resumo={resumo} />
            </Suspense>
          }
          rotulo={
            <Suspense fallback={null}>
              <RotuloAtualizacao resumo={resumo} className="text-hero-muted" />
            </Suspense>
          }
        />
      }
    />
  );
}

/** "atualizado há N s" quando o resumo chega; com falha no resumo, não aparece. */
async function RotuloAtualizacao({
  resumo,
  atualizar = true,
  className,
}: {
  resumo: PromessaResumo;
  atualizar?: boolean;
  className?: string;
}) {
  const consulta = await resumo;
  // Sem o resumo, o polling continua (sem rótulo), para a tela se recuperar sozinha
  if (!consulta.ok) return atualizar ? <AtualizacaoAutomatica /> : null;
  return (
    <AtualizacaoAutomatica
      geradoEm={consulta.dados.geradoEm}
      atualizar={atualizar}
      className={className}
    />
  );
}

/** "N de prioridade alta · a mais antiga espera há N dias" (estado atual, do resumo). */
async function SubtituloFila({ resumo }: { resumo: PromessaResumo }) {
  const consulta = await resumo;
  if (!consulta.ok) return null;
  const { filaAlta, aberturaMaisAntiga } = consulta.dados;
  const espera = aberturaMaisAntiga ? formatarHaDias(aberturaMaisAntiga) : null;
  return (
    <p className="text-hero-muted text-[13px]">
      {filaAlta} de prioridade alta
      {espera ? ` · a mais antiga espera ${espera === 'hoje' ? 'desde hoje' : espera}` : ''}
    </p>
  );
}

/** Minhas análises: em análise com a pessoa, da mais urgente para a mais antiga. */
function CardMinhasAnalises({
  itens,
  total,
  rotulo,
}: {
  itens: ItemSolicitacao[];
  total: number;
  rotulo: ReactNode;
}) {
  return (
    <section
      aria-labelledby="titulo-minhas-analises"
      className="bg-card rounded-card flex min-w-0 flex-col gap-3 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="max-[760px]:sr-only">
            <TituloComTotal
              id="titulo-minhas-analises"
              titulo="Minhas análises"
              total={total}
              nivel="h3"
            />
          </div>
          <p className="text-muted-foreground text-[13px]">
            Em análise com você, da mais urgente para a mais antiga
          </p>
        </div>
        <span className="flex items-center gap-2.5">
          {rotulo}
          {/* No celular a aba já nomeia o card e a lista fica na barra de navegação */}
          <span className="max-[760px]:hidden">
            <LinkCanto href={URL_MINHAS_ANALISES} rotulo="Ver minhas análises na lista" />
          </span>
        </span>
      </div>
      {itens.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">Nada em análise com você</p>
      ) : (
        <ul className="flex flex-col">
          {itens.map((item) => (
            <LinhaMinhaAnalise key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LinhaMinhaAnalise({ item }: { item: ItemSolicitacao }) {
  const desde = item.analiseIniciadaEm ?? item.atualizadoEm;
  return (
    <li className="hover:bg-muted rounded-row relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-3 py-2.5 transition-colors duration-150 max-[760px]:px-1 min-[1180px]:grid-cols-[96px_minmax(0,1fr)_auto_92px]">
      <CodigoSolicitacao codigo={item.codigo} className="max-[1179px]:col-span-2" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <Link
          href={`/solicitacoes/${item.id}`}
          className="focus-visible:outline-ring rounded-sm font-medium outline-none after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {item.titulo}
        </Link>
        <span className="text-muted-foreground text-[12.5px]">
          {item.solicitante.nome} · {item.area.nome}
        </span>
      </span>
      <SeloPrioridade prioridade={item.prioridade} />
      <time
        dateTime={desde}
        title={`Com você desde ${formatarData(desde)}`}
        className="text-muted-foreground text-right text-[12.5px] whitespace-nowrap max-[1179px]:col-span-2 max-[1179px]:text-left"
      >
        {formatarHaDias(desde)}
      </time>
    </li>
  );
}

/**
 * Fila de análise (o destaque): a "Próxima para você" (RN-07: a primeira que a pessoa não abriu)
 * e as três seguintes, com "Iniciar a próxima" e "Ver a fila". N é o meta.total da consulta.
 */
function CardFila({
  usuario,
  itens,
  total,
  subtitulo,
  rotulo,
}: {
  usuario: UsuarioAtual;
  itens: ItemSolicitacao[];
  total: number;
  subtitulo: ReactNode;
  rotulo: ReactNode;
}) {
  const indiceProxima = itens.findIndex((item) => item.solicitante.id !== usuario.id);
  const proxima = indiceProxima >= 0 ? itens[indiceProxima] : undefined;
  const seguintes = proxima ? itens.slice(indiceProxima + 1, indiceProxima + 4) : itens.slice(0, 3);

  return (
    <section
      aria-labelledby="titulo-fila"
      className="bg-hero text-hero-foreground rounded-card relative isolate flex min-w-0 flex-col gap-3.5 overflow-hidden p-5"
    >
      <AneisHero />
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="max-[760px]:sr-only">
            <TituloComTotal
              id="titulo-fila"
              titulo="Fila de análise"
              total={total}
              nivel="h3"
              escuro
            />
          </div>
          {subtitulo}
        </div>
        <span className="flex items-center gap-2.5">
          {rotulo}
          {/* No celular a aba já nomeia o card e a lista fica na barra de navegação */}
          <span className="max-[760px]:hidden">
            <LinkCanto href={URL_FILA} rotulo="Ver a fila na lista" escuro />
          </span>
        </span>
      </div>
      {itens.length === 0 ? (
        <p className="text-hero-muted py-6 text-center text-sm">Fila vazia</p>
      ) : null}
      {proxima ? <ProximaParaVoce item={proxima} /> : null}
      {itens.length > 0 && !proxima ? (
        <p className="text-hero-muted text-sm">
          {total > itens.length
            ? 'As primeiras da fila foram abertas por você: outra pessoa precisa analisá-las.'
            : 'As solicitações da fila foram abertas por você: outra pessoa precisa analisá-las.'}
        </p>
      ) : null}
      {seguintes.length > 0 ? (
        <ul aria-label={proxima ? 'Depois dela' : 'Na fila'} className="flex flex-col">
          {seguintes.map((item) => (
            <li
              key={item.id}
              className="relative grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-white/12 py-2 text-[13px] first:border-t-0 max-[760px]:min-h-11"
            >
              <CodigoSolicitacao codigo={item.codigo} className="text-hero-muted text-xs" />
              {/* A linha inteira é o alvo do link (44px no celular) */}
              <Link
                href={`/solicitacoes/${item.id}`}
                className="focus-visible:outline-brand-orange truncate rounded-sm outline-none after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {item.titulo}
              </Link>
              <span className="text-hero-muted text-xs">{ROTULO_PRIORIDADE[item.prioridade]}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2.5 max-[760px]:[&>*]:h-11">
        {proxima ? (
          <BotaoIniciarAnalise id={proxima.id} rotulo="Iniciar a próxima" variant="orange" />
        ) : null}
        <Button variant="hero" asChild>
          <Link href={URL_FILA}>Ver a fila</Link>
        </Button>
      </div>
    </section>
  );
}

function ProximaParaVoce({ item }: { item: ItemSolicitacao }) {
  return (
    <div
      role="group"
      aria-labelledby="rotulo-proxima"
      className="rounded-inner flex flex-col gap-1.5 px-4 py-3.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/14%)]"
    >
      <span
        id="rotulo-proxima"
        className="text-brand-orange text-[11.5px] font-semibold tracking-[0.06em] uppercase"
      >
        Próxima para você
      </span>
      <span className="flex items-center gap-2">
        <CodigoSolicitacao codigo={item.codigo} className="text-hero-muted" />
        <ChipPrioridadeHero prioridade={item.prioridade} />
      </span>
      <Link
        href={`/solicitacoes/${item.id}`}
        className="focus-visible:outline-brand-orange rounded-sm text-base font-semibold outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {item.titulo}
      </Link>
      <span className="text-hero-muted text-[12.5px]">
        {item.solicitante.nome} · {item.area.nome} · aberta {formatarHaDias(item.dataSolicitacao)}
      </span>
    </div>
  );
}

/**
 * Indicadores de todas as áreas: Total alto com a barra por status, os 4 status em 2 × 2 e o
 * gráfico por prioridade. O "N com você" fica só no título de Minhas análises (revisão de
 * 04/10/2026), porque os blocos de status ganham o filtro de período no 4C.
 */
async function Indicadores({
  resumo: promessaResumo,
  periodo,
}: {
  resumo: PromessaResumo;
  periodo: Periodo;
}) {
  const consulta = await promessaResumo;
  if (!consulta.ok) {
    return (
      <section className="bg-card rounded-card">
        <EstadoErro titulo="Não foi possível carregar o resumo" requestId={consulta.requestId} />
      </section>
    );
  }
  const resumo = consulta.dados;

  return (
    <section aria-labelledby="titulo-indicadores" className="flex flex-col gap-3">
      <h2 id="titulo-indicadores" className={CLASSE_TITULO_SECAO}>
        Indicadores · {rotuloPeriodo(periodo)}{' '}
        <span className="font-normal normal-case">· todas as áreas</span>
      </h2>
      <div className="grid items-start gap-4 max-[760px]:gap-3 min-[1024px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="grid grid-cols-2 gap-3 min-[761px]:grid-cols-[1.25fr_1fr_1fr]">
          <div className="col-span-2 grid min-[761px]:col-span-1 min-[761px]:row-span-2">
            <TileTotal resumo={resumo} rotulo="Total de solicitações" alto />
          </div>
          {STATUS.map((status) => (
            <BlocoStatus
              key={status}
              status={status}
              valor={resumo.porStatus[status]}
              total={resumo.total}
            />
          ))}
        </div>
        <section
          aria-labelledby="titulo-prioridade"
          className="bg-card rounded-card flex min-w-0 flex-col gap-2 p-5"
        >
          <h3
            id="titulo-prioridade"
            className="font-display text-lg leading-[1.2] font-semibold tracking-[-0.02em]"
          >
            Por prioridade
          </h3>
          <p className="text-muted-foreground text-[13px]">Como as {resumo.total} se dividem</p>
          <GraficoPrioridade resumo={resumo} />
        </section>
      </div>
    </section>
  );
}
