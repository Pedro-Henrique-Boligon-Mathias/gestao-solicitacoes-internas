import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { EsqueletoDataResumo, EsqueletoListas, EsqueletoResumo } from '@/components/esqueletos';
import { EstadoErro } from '@/components/estado-erro';
import { CodigoSolicitacao } from '@/components/solicitacoes/codigo-solicitacao';
import { SeloStatus } from '@/components/solicitacoes/selo-status';
import type { UsuarioAtual } from '@/features/auth/usuario';
import type { Periodo } from '@/features/dashboard/periodo';
import { listarSolicitacoes, obterResumo, type Consulta } from '@/features/solicitacoes/consultas';
import { formatarDiaMes, formatarHaDias } from '@/features/solicitacoes/datas';
import type {
  ItemSolicitacao,
  PaginaSolicitacoes,
  ResumoDashboard,
} from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';
import { DataResumo } from './bloco-resumo';
import { AneisHero, BarraTopo, ChipPrioridadeHero, LinkCanto, TituloComTotal } from './partes';
import { ReguaEtapas } from './regua-etapas';
import { SeusNumeros } from './seus-numeros';

type PromessaResumo = Promise<Consulta<ResumoDashboard>>;
type PromessaLista = Promise<Consulta<PaginaSolicitacoes>>;

/** Quantos itens do "Em andamento" aparecem no celular antes do "Ver mais N". */
const VISIVEIS_NO_CELULAR = 3;
const URL_EM_ANDAMENTO = '/solicitacoes?status=ABERTA&status=EM_ANALISE';

/**
 * Dashboard do solicitante (RF-04, RN-13): "Em andamento" (destaque), "Decididas recentemente" e
 * "Seus números". As consultas saem juntas daqui; cada bloco tem o próprio <Suspense>,
 * esqueleto e erro. Só "Seus números" segue o período; os outros blocos mostram o estado atual.
 * Sem fila e sem atualização automática: o que muda aqui muda por ação de outra
 * pessoa e pode esperar a próxima visita.
 */
export async function DashboardSolicitante({
  usuario,
  periodo = 'tudo',
}: {
  usuario: UsuarioAtual;
  periodo?: Periodo;
}) {
  // Sem período, o mesmo resumo do contador do menu (deduplicado por requisição)
  const resumo = obterResumo();
  const resumoPeriodo = periodo === 'tudo' ? resumo : obterResumo(periodo);
  const emAndamento = listarSolicitacoes(
    { status: ['ABERTA', 'EM_ANALISE'], ordenarPor: 'dataSolicitacao', direcao: 'desc' },
    5,
  );
  const decididas = listarSolicitacoes(
    { status: ['APROVADA', 'REJEITADA'], ordenarPor: 'decididoEm' },
    3,
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

      <div className="grid items-start gap-4 empty:hidden max-[760px]:gap-3 min-[1024px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Suspense fallback={<EsqueletoListas />}>
          <BlocoEmAndamento resumo={resumo} lista={emAndamento} />
        </Suspense>
        <Suspense fallback={<EsqueletoListas />}>
          <BlocoDecididas resumo={resumo} lista={decididas} />
        </Suspense>
      </div>

      <Suspense fallback={<EsqueletoResumo />}>
        <SeusNumeros usuario={usuario} resumo={resumoPeriodo} periodo={periodo} />
      </Suspense>
    </>
  );
}

/**
 * Espera a lista e o resumo (já disparados na página). Sem nenhuma solicitação, o bloco some e
 * "Seus números" mostra o estado vazio; se o resumo falhou, a lista aparece normalmente.
 */
async function esperarLista(resumo: PromessaResumo, lista: PromessaLista) {
  const [consultaResumo, consulta] = await Promise.all([resumo, lista]);
  if (consultaResumo.ok && consultaResumo.dados.total === 0) return null;
  return consulta;
}

function ErroDoBloco({ titulo, requestId }: { titulo: string; requestId?: string }) {
  return (
    <section className="bg-card rounded-card">
      <EstadoErro titulo={titulo} requestId={requestId} />
    </section>
  );
}

/** "Na fila há N dias" (aberta) ou "Com <analista> desde dd/MM" (em análise). */
function OndeEsta({ item }: { item: ItemSolicitacao }) {
  if (item.status === 'EM_ANALISE' && item.analista) {
    return (
      <>
        Com {item.analista.nome}
        {item.analiseIniciadaEm ? ` desde ${formatarDiaMes(item.analiseIniciadaEm)}` : ''}
      </>
    );
  }
  const espera = formatarHaDias(item.dataSolicitacao);
  return (
    <>{espera === 'hoje' ? 'Na fila desde hoje' : `Na fila ${espera}`}, esperando um analista</>
  );
}

/** Destaque do solicitante: o que ainda espera decisão, com a régua de etapas de cada uma. */
async function BlocoEmAndamento({
  resumo,
  lista,
}: {
  resumo: PromessaResumo;
  lista: PromessaLista;
}) {
  const consulta = await esperarLista(resumo, lista);
  if (!consulta) return null;
  if (!consulta.ok) {
    return (
      <ErroDoBloco
        titulo="Não foi possível carregar o em andamento"
        requestId={consulta.requestId}
      />
    );
  }
  const { data: itens, meta } = consulta.dados;
  const restantes = meta.total - VISIVEIS_NO_CELULAR;

  return (
    <section
      aria-labelledby="titulo-em-andamento"
      className="bg-hero text-hero-foreground rounded-card relative isolate flex min-w-0 flex-col gap-3 overflow-hidden p-5"
    >
      <AneisHero />
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <TituloComTotal
            id="titulo-em-andamento"
            titulo="Em andamento"
            total={meta.total}
            escuro
          />
          <p className="text-hero-muted text-[13px]">Suas solicitações que ainda esperam decisão</p>
        </div>
        <LinkCanto href={URL_EM_ANDAMENTO} rotulo="Ver em andamento na lista" escuro />
      </div>
      {itens.length === 0 ? (
        <p className="text-hero-muted py-6 text-center text-sm">Nada esperando decisão</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {itens.map((item, indice) => (
            <li key={item.id} className={cn(indice >= VISIVEIS_NO_CELULAR && 'max-[760px]:hidden')}>
              <LinhaEmAndamento item={item} />
            </li>
          ))}
        </ul>
      )}
      {restantes > 0 ? (
        <Link
          href={URL_EM_ANDAMENTO}
          className="text-hero-foreground focus-visible:outline-brand-orange inline-flex min-h-11 items-center gap-1 self-center rounded-sm text-sm font-medium outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 min-[761px]:hidden"
        >
          Ver mais {restantes} em andamento
          <ChevronRight aria-hidden="true" className="size-3.5" />
        </Link>
      ) : null}
    </section>
  );
}

function LinhaEmAndamento({ item }: { item: ItemSolicitacao }) {
  return (
    <Link
      href={`/solicitacoes/${item.id}`}
      className="rounded-inner focus-visible:outline-brand-orange grid gap-x-5 gap-y-3 px-4 py-3.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/14%)] transition-colors duration-150 outline-none hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 min-[761px]:grid-cols-[minmax(0,1fr)_minmax(180px,250px)] min-[761px]:items-center"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-hero-muted flex items-center gap-2 text-[12.5px]">
          <CodigoSolicitacao codigo={item.codigo} className="text-hero-muted" />
          <ChipPrioridadeHero prioridade={item.prioridade} />
        </span>
        <span className="text-[15.5px] leading-[1.3] font-semibold">{item.titulo}</span>
        <span className="text-hero-muted text-[12.5px]">
          <OndeEsta item={item} />
        </span>
      </span>
      <ReguaEtapas status={item.status} />
    </Link>
  );
}

/** As 3 últimas decididas, com o selo e a citação "<quem decidiu>: <comentário>". */
async function BlocoDecididas({ resumo, lista }: { resumo: PromessaResumo; lista: PromessaLista }) {
  const consulta = await esperarLista(resumo, lista);
  if (!consulta) return null;
  if (!consulta.ok) {
    return (
      <ErroDoBloco titulo="Não foi possível carregar as decididas" requestId={consulta.requestId} />
    );
  }
  const itens = consulta.dados.data;

  return (
    <section
      aria-labelledby="titulo-decididas"
      className="bg-card rounded-card flex min-w-0 flex-col gap-2.5 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <TituloComTotal id="titulo-decididas" titulo="Decididas recentemente" />
          <p className="text-muted-foreground text-[13px]">O que mudou nos últimos dias</p>
        </div>
        <LinkCanto
          href="/solicitacoes?status=APROVADA&status=REJEITADA"
          rotulo="Ver decididas na lista"
        />
      </div>
      {itens.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">Nenhuma decisão ainda</p>
      ) : (
        <ul className="flex flex-col">
          {itens.map((item) => (
            <li key={item.id} className="border-border border-t first:border-t-0">
              <Link
                href={`/solicitacoes/${item.id}`}
                className="rounded-row focus-visible:outline-ring flex flex-col gap-1.5 px-1 py-3.5 outline-none hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span className="text-muted-foreground flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="font-mono tabular-nums">
                    {item.codigo}
                    {item.decisao ? ` · ${formatarDiaMes(item.decisao.decididoEm)}` : ''}
                  </span>
                  <SeloStatus status={item.status} />
                </span>
                <span className="text-[14.5px] leading-[1.3] font-semibold">{item.titulo}</span>
                {item.decisao ? (
                  <span className="text-sm">
                    <span className="text-muted-foreground">{item.decisao.decididoPor.nome}:</span>{' '}
                    {item.decisao.comentario}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
