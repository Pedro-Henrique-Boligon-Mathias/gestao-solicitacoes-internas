import { CircleCheck, Clock, TriangleAlert } from 'lucide-react';
import { formatarData, formatarFuturo } from '@/features/solicitacoes/datas';
import { ROTULO_STATUS_INTEGRACAO, ROTULO_TIPO_INTEGRACAO } from '@/features/solicitacoes/rotulos';
import type { Integracao, Solicitacao, StatusIntegracao } from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';
import { BotaoReprocessarIntegracao } from './botao-reprocessar-integracao';

const VISUAL: Record<StatusIntegracao, { icone: typeof Clock; caixa: string; contorno: string }> = {
  PENDENTE: {
    icone: Clock,
    caixa: 'bg-status-analise-bg text-status-analise-fg',
    contorno: 'shadow-[inset_0_0_0_1px_var(--border)]',
  },
  ENVIADO: {
    icone: CircleCheck,
    caixa: 'bg-status-aprovada-bg text-status-aprovada-fg',
    contorno: 'shadow-[inset_0_0_0_1px_var(--border)]',
  },
  FALHOU: {
    icone: TriangleAlert,
    caixa: 'bg-status-rejeitada-bg text-status-rejeitada-fg',
    contorno: 'shadow-[inset_0_0_0_1px_var(--status-rejeitada-bg)]',
  },
};

const DATA = 'font-mono text-[12.5px] tabular-nums';

/** Situação do evento em foco, sempre em texto (a cor só reforça). */
function Situacao({ integracao }: { integracao: Integracao }) {
  const { status, tentativas, maxTentativas, enviadaEm } = integracao;
  if (status === 'ENVIADO' && enviadaEm) {
    return (
      <>
        Enviada em{' '}
        <time dateTime={enviadaEm} className={DATA}>
          {formatarData(enviadaEm)}
        </time>
      </>
    );
  }
  if (status === 'FALHOU') {
    return (
      <>
        {ROTULO_STATUS_INTEGRACAO.FALHOU}: tentativa {tentativas} de {maxTentativas}
      </>
    );
  }
  return <>{ROTULO_STATUS_INTEGRACAO[status]}</>;
}

/**
 * Bloco Integração do detalhe (ADR-010): status do evento em foco (o mais antigo ainda não
 * enviado), quantos aguardam atrás dele e, para quem pode, o reprocessamento.
 */
export function BlocoIntegracao({ solicitacao }: { solicitacao: Solicitacao }) {
  const { integracao } = solicitacao;
  if (!integracao) return null;

  const visual = VISUAL[integracao.status];
  const Icone = visual.icone;
  const proxima =
    integracao.status === 'PENDENTE' && integracao.tentativas > 0
      ? integracao.proximaTentativaEm
      : null;
  const podeReprocessar = solicitacao.acoesPermitidas.includes('REPROCESSAR_INTEGRACAO');

  return (
    <section
      aria-labelledby="titulo-integracao"
      className={cn('bg-card rounded-card flex flex-wrap gap-3.5 p-5', visual.contorno)}
    >
      <span
        aria-hidden="true"
        className={cn('rounded-field grid size-9 flex-none place-items-center', visual.caixa)}
      >
        <Icone className="size-4" strokeWidth={1.8} />
      </span>
      <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-1.5">
        <h2 id="titulo-integracao" className="text-muted-foreground text-xs font-medium">
          Integração
        </h2>
        <p className="font-semibold">
          <Situacao integracao={integracao} />
        </p>
        {proxima && (
          <p className="text-muted-foreground text-[13px]">
            Próxima tentativa{' '}
            <time dateTime={proxima} title={formatarData(proxima)}>
              {formatarFuturo(proxima)}
            </time>
          </p>
        )}
        <p className="text-muted-foreground text-[13px]">
          {ROTULO_TIPO_INTEGRACAO[integracao.tipo]}
          {integracao.aguardando > 0 && ` e mais ${integracao.aguardando} aguardando`}
        </p>
      </div>
      {podeReprocessar && (
        <div className="flex items-start">
          <BotaoReprocessarIntegracao id={solicitacao.id} />
        </div>
      )}
    </section>
  );
}
