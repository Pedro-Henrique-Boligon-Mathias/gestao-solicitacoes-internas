import { Inbox } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { EsqueletoBotaoDestaque, EsqueletoFraseDestaque } from '@/components/esqueletos';
import { EstadoErro } from '@/components/estado-erro';
import { EstadoVazio } from '@/components/estado-vazio';
import { BotaoIniciarAnalise } from '@/components/solicitacoes/botao-iniciar-analise';
import { BotaoNovaSolicitacao } from '@/components/solicitacoes/botao-nova-solicitacao';
import { Button } from '@/components/ui/button';
import type { UsuarioAtual } from '@/features/auth/usuario';
import type { Consulta } from '@/features/solicitacoes/consultas';
import { formatarData, formatarDiaMes, formatarRelativo } from '@/features/solicitacoes/datas';
import {
  STATUS,
  type PaginaSolicitacoes,
  type ResumoDashboard,
} from '@/features/solicitacoes/tipos';
import { GraficoPrioridade } from './grafico-prioridade';
import { BlocoStatus, Destaque, URL_FILA } from './partes';

type PromessaResumo = Promise<Consulta<ResumoDashboard>>;
type PromessaLista = Promise<Consulta<PaginaSolicitacoes>>;

/**
 * Bloco do resumo, linha 1 do dashboard (RF-04): card de destaque e os 4 blocos de status.
 * Só espera o resumo. Os botões do destaque que precisam de um item da lista ("Iniciar a
 * próxima", "Ver a mais recente") esperam a promessa da lista num <Suspense> próprio, sem
 * requisição extra. Sem solicitações, mostra o estado vazio; com falha, o erro só neste bloco.
 */
export async function BlocoResumo({
  usuario,
  resumo: promessaResumo,
  fila,
  ultimas,
}: {
  usuario: UsuarioAtual;
  resumo: PromessaResumo;
  /** Quem analisa: a fila de análise, para "Iniciar a próxima". */
  fila?: PromessaLista;
  /** Solicitante: as últimas, para "Ver a mais recente". */
  ultimas?: PromessaLista;
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
  const geral = resumo.escopo === 'GERAL';
  const titulo = geral ? 'Visão geral' : 'Suas solicitações';

  if (resumo.total === 0) {
    return (
      <section className="bg-card rounded-card">
        <h1 className="sr-only">{titulo}</h1>
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
    );
  }

  return (
    <div className="flex flex-wrap gap-4 max-[760px]:gap-3">
      <Destaque titulo={titulo} resumo={resumo}>
        {fila ? (
          <>
            <div className="text-hero-muted flex flex-col gap-1.5 text-sm">
              <p className="text-hero-foreground">
                {resumo.filaAlta} de alta prioridade esperam na fila
              </p>
              {resumo.aberturaMaisAntiga && (
                <p>A mais antiga entrou na fila {formatarRelativo(resumo.aberturaMaisAntiga)}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2.5 max-[760px]:[&>*]:h-11">
              <Suspense fallback={<EsqueletoBotaoDestaque />}>
                <IniciarProxima usuario={usuario} fila={fila} />
              </Suspense>
              <Button variant="hero" asChild>
                <Link href={URL_FILA}>Ver a fila</Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            {ultimas && (
              <Suspense fallback={<EsqueletoFraseDestaque />}>
                <FraseMaisRecente ultimas={ultimas} />
              </Suspense>
            )}
            <div className="flex flex-wrap gap-2.5 max-[760px]:[&>*]:h-11">
              {ultimas && (
                <Suspense fallback={<EsqueletoBotaoDestaque />}>
                  <VerMaisRecente ultimas={ultimas} />
                </Suspense>
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
  );
}

/**
 * Gráfico por prioridade: fica na linha 2, ao lado das listas, mas é parte do resumo (mesma
 * promessa). Sem solicitações ou com falha, não aparece: o bloco do resumo já mostra o estado.
 */
export async function GraficoResumo({ resumo: promessaResumo }: { resumo: PromessaResumo }) {
  const consulta = await promessaResumo;
  if (!consulta.ok || consulta.dados.total === 0) return null;
  const resumo = consulta.dados;

  return (
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
        Como {resumo.escopo === 'GERAL' ? `as ${resumo.total}` : `as suas ${resumo.total}`} se
        dividem
      </p>
      <GraficoPrioridade resumo={resumo} />
    </section>
  );
}

/** "Dados de dd/MM/yyyy HH:mm" do cabeçalho, quando o resumo chega. */
export async function DataResumo({ resumo: promessaResumo }: { resumo: PromessaResumo }) {
  const consulta = await promessaResumo;
  if (!consulta.ok) return null;
  const { geradoEm } = consulta.dados;

  return (
    <p className="text-muted-foreground text-sm">
      Dados de{' '}
      <time dateTime={geradoEm} className="font-mono text-[13px] tabular-nums">
        {formatarData(geradoEm)}
      </time>
    </p>
  );
}

/** RN-07: a próxima é a primeira da fila que não foi aberta por quem está analisando. */
async function IniciarProxima({ usuario, fila }: { usuario: UsuarioAtual; fila: PromessaLista }) {
  const consulta = await fila;
  // Com falha, o erro aparece no bloco das listas; aqui o botão só não aparece
  if (!consulta.ok) return null;
  const proxima = consulta.dados.data.find((item) => item.solicitante.id !== usuario.id);
  if (!proxima) return null;
  return <BotaoIniciarAnalise id={proxima.id} rotulo="Iniciar a próxima" variant="orange" />;
}

async function FraseMaisRecente({ ultimas }: { ultimas: PromessaLista }) {
  const consulta = await ultimas;
  const recente = consulta.ok ? consulta.dados.data[0] : undefined;
  if (!recente) return null;
  return (
    <p className="text-hero-muted text-sm">
      A mais recente é <span className="text-hero-foreground font-mono">{recente.codigo}</span>,
      aberta em {formatarDiaMes(recente.dataSolicitacao)}.
    </p>
  );
}

async function VerMaisRecente({ ultimas }: { ultimas: PromessaLista }) {
  const consulta = await ultimas;
  const recente = consulta.ok ? consulta.dados.data[0] : undefined;
  if (!recente) return null;
  return (
    <Button variant="orange" asChild>
      <Link href={`/solicitacoes/${recente.id}`}>Ver a mais recente</Link>
    </Button>
  );
}
