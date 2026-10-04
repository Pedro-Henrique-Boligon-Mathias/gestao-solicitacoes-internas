import Link from 'next/link';
import type {
  DivergenciaIntegridade,
  Integridade,
  MotivoDivergencia,
  ResultadoIntegridade,
} from '@/features/auditoria/tipos';
import { formatarData } from '@/features/solicitacoes/datas';
import { ROTULO_EVENTO } from '@/features/solicitacoes/rotulos';

const ROTULO_MOTIVO: Record<MotivoDivergencia, string> = {
  CONTEUDO_ALTERADO: 'conteúdo alterado',
  CORRENTE_QUEBRADA: 'evento apagado ou inserido',
};

const numero = new Intl.NumberFormat('pt-BR');

/** "1 evento verificado" / "1.234 eventos verificados". */
function eventosVerificados(total: number): string {
  return `${numero.format(total)} ${total === 1 ? 'evento verificado' : 'eventos verificados'}`;
}

/** Conteúdo do anúncio depois de verificar: íntegro, adulteração ou erro com requestId. */
export function ResultadoVerificacao({ resultado }: { resultado: ResultadoIntegridade }) {
  if (!resultado.ok) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <p className="text-destructive font-medium">{resultado.erro}</p>
        {resultado.requestId ? (
          <p className="text-muted-foreground">
            Se continuar, informe o código para o suporte:{' '}
            <code className="text-foreground font-mono text-[12.5px]">{resultado.requestId}</code>
          </p>
        ) : null}
      </div>
    );
  }
  const { integridade } = resultado;
  return integridade.integro ? (
    <ResumoIntegro integridade={integridade} />
  ) : (
    <ResumoAdulterado integridade={integridade} />
  );
}

function Verificacao({ integridade }: { integridade: Integridade }) {
  return (
    <p className="text-muted-foreground text-[13px]">
      {eventosVerificados(integridade.eventosVerificados)} · verificado em{' '}
      <time dateTime={integridade.verificadoEm} className="font-mono text-[12.5px]">
        {formatarData(integridade.verificadoEm)}
      </time>
    </p>
  );
}

function ResumoIntegro({ integridade }: { integridade: Integridade }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-status-aprovada-fg font-semibold">Histórico íntegro</p>
      <Verificacao integridade={integridade} />
    </div>
  );
}

function ResumoAdulterado({ integridade }: { integridade: Integridade }) {
  const restantes = integridade.totalDivergencias - integridade.divergencias.length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-destructive font-semibold">Adulteração detectada</p>
        <Verificacao integridade={integridade} />
      </div>
      <ul className="flex flex-col">
        {integridade.divergencias.map((d) => (
          <LinhaDivergencia key={d.eventoId} divergencia={d} />
        ))}
      </ul>
      {restantes > 0 ? (
        <p className="text-muted-foreground text-[13px]">
          e mais {numero.format(restantes)} {restantes === 1 ? 'divergência' : 'divergências'}
        </p>
      ) : null}
    </div>
  );
}

function LinhaDivergencia({ divergencia: d }: { divergencia: DivergenciaIntegridade }) {
  return (
    <li className="border-border grid grid-cols-[96px_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b py-2.5 text-sm last:border-b-0 max-[760px]:grid-cols-[minmax(0,1fr)_auto] max-[760px]:gap-x-3 max-[760px]:gap-y-0.5">
      <Link
        href={`/solicitacoes/${d.solicitacao.id}`}
        className="text-muted-foreground hover:text-foreground w-fit rounded-sm font-mono text-[12.5px] max-[760px]:inline-flex max-[760px]:min-h-11 max-[760px]:items-center"
      >
        {d.solicitacao.codigo}
      </Link>
      <span className="min-w-0">{ROTULO_EVENTO[d.tipo] ?? d.tipo}</span>
      <time
        dateTime={d.criadoEm}
        className="text-muted-foreground font-mono text-[12.5px] whitespace-nowrap"
      >
        {formatarData(d.criadoEm)}
      </time>
      <span className="text-destructive min-w-0 font-medium max-[760px]:col-span-2">
        {ROTULO_MOTIVO[d.motivo] ?? d.motivo}
      </span>
    </li>
  );
}
