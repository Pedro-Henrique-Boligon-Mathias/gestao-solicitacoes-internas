import { Inbox } from 'lucide-react';
import Link from 'next/link';
import { EstadoErro } from '@/components/estado-erro';
import { EstadoVazio } from '@/components/estado-vazio';
import { BotaoNovaSolicitacao } from '@/components/solicitacoes/botao-nova-solicitacao';
import { SeloPrioridade } from '@/components/solicitacoes/selo-prioridade';
import { CORES_STATUS } from '@/components/solicitacoes/selo-status';
import type { UsuarioAtual } from '@/features/auth/usuario';
import type { Consulta } from '@/features/solicitacoes/consultas';
import { ROTULO_PRIORIDADE, ROTULO_STATUS_PLURAL } from '@/features/solicitacoes/rotulos';
import { PRIORIDADES, STATUS, type ResumoDashboard } from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';
import { BlocoStatus } from './partes';

/**
 * "Seus números" do solicitante (escopo PROPRIAS): Total com a barra por status, os 4 status e a
 * prioridade em barras horizontais, numa faixa só. Sem solicitações, vira o estado vazio da tela.
 */
export async function SeusNumeros({
  usuario,
  resumo: promessaResumo,
}: {
  usuario: UsuarioAtual;
  resumo: Promise<Consulta<ResumoDashboard>>;
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

  if (resumo.total === 0) {
    return (
      <section className="bg-card rounded-card">
        <h2 className="sr-only">Seus números</h2>
        <EstadoVazio
          Icone={Inbox}
          titulo="Você ainda não tem solicitações"
          acao={<BotaoNovaSolicitacao usuario={usuario} rotulo="Criar a primeira" />}
        >
          Abra a primeira e acompanhe o andamento por aqui.
        </EstadoVazio>
      </section>
    );
  }

  return (
    <section aria-labelledby="titulo-seus-numeros" className="flex flex-col gap-3">
      <h2
        id="titulo-seus-numeros"
        className="text-muted-foreground px-1 text-[13px] font-semibold tracking-[0.06em] uppercase"
      >
        Seus números
      </h2>
      <div className="grid grid-cols-2 gap-3 min-[761px]:grid-cols-3 min-[1180px]:grid-cols-[1.3fr_repeat(4,1fr)_1.7fr]">
        <TileTotal resumo={resumo} />
        {STATUS.map((status) => (
          <BlocoStatus
            key={status}
            status={status}
            valor={resumo.porStatus[status]}
            total={resumo.total}
            compacto
          />
        ))}
        <BarrasPrioridade resumo={resumo} />
      </div>
    </section>
  );
}

/** Barra fina dividida por status, nas cores dos blocos (o texto vai no nome acessível). */
export function BarraPorStatus({ resumo }: { resumo: ResumoDashboard }) {
  const descricao = STATUS.map(
    (status) => `${resumo.porStatus[status]} ${ROTULO_STATUS_PLURAL[status].toLowerCase()}`,
  ).join(', ');
  return (
    <span
      role="img"
      aria-label={`Divisão por status: ${descricao}`}
      className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
    >
      {STATUS.filter((s) => resumo.porStatus[s] > 0).map((status) => (
        <span
          key={status}
          className={cn('h-full', CORES_STATUS[status].barra)}
          style={{ flexGrow: resumo.porStatus[status] }}
        />
      ))}
    </span>
  );
}

/** Bloco do total, que leva à lista inteira. `alto` é o do analista (ocupa duas linhas). */
export function TileTotal({
  resumo,
  rotulo = 'Total',
  alto = false,
}: {
  resumo: ResumoDashboard;
  rotulo?: string;
  alto?: boolean;
}) {
  return (
    <Link
      href="/solicitacoes"
      aria-label={`${rotulo}: ${resumo.total} ${resumo.total === 1 ? 'solicitação' : 'solicitações'}`}
      className={cn(
        'bg-tile rounded-card hover:bg-muted/60 focus-visible:outline-ring flex min-w-0 flex-col justify-between gap-3 px-5 py-4 transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
        alto && 'row-span-2 gap-4 py-5',
      )}
    >
      <span className="text-sm font-semibold">{rotulo}</span>
      <span
        className={cn(
          'font-display leading-[0.95] font-semibold tracking-[-0.035em]',
          alto ? 'text-[64px] max-[760px]:text-5xl' : 'text-[34px]',
        )}
      >
        {resumo.total}
      </span>
      <span className="flex flex-col gap-2.5">
        <BarraPorStatus resumo={resumo} />
        {alto ? (
          <span className="text-muted-foreground text-[12.5px]">
            Divisão por status, nas cores dos blocos ao lado
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/** Prioridade em barras horizontais; cada linha leva à lista filtrada por ela. */
function BarrasPrioridade({ resumo }: { resumo: ResumoDashboard }) {
  const maior = Math.max(1, ...PRIORIDADES.map((p) => resumo.porPrioridade[p]));
  return (
    <div
      role="group"
      aria-labelledby="titulo-por-prioridade"
      className="bg-tile rounded-card col-span-2 flex min-w-0 flex-col gap-2.5 px-5 py-4 min-[761px]:col-span-1"
    >
      <span id="titulo-por-prioridade" className="text-sm font-semibold">
        Por prioridade
      </span>
      <ul className="flex flex-col gap-1">
        {PRIORIDADES.map((prioridade) => {
          const valor = resumo.porPrioridade[prioridade];
          return (
            <li key={prioridade}>
              <Link
                href={`/solicitacoes?prioridade=${prioridade}`}
                aria-label={`${ROTULO_PRIORIDADE[prioridade]}: ${valor} ${valor === 1 ? 'solicitação' : 'solicitações'}`}
                className="rounded-row hover:bg-muted/60 focus-visible:outline-ring grid min-h-8 grid-cols-[72px_1fr_28px] items-center gap-2 px-1 text-[12.5px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 max-[760px]:min-h-11"
              >
                <SeloPrioridade prioridade={prioridade} />
                <span aria-hidden="true" className="bg-muted h-2.5 overflow-hidden rounded-full">
                  <span
                    className="bg-chart-alta block h-full rounded-full"
                    style={{ width: `${Math.round((valor / maior) * 100)}%` }}
                  />
                </span>
                <span className="text-right font-mono tabular-nums">{valor}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
