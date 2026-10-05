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

/**
 * Resumo depois de verificar, que vai no anúncio (role="status"): íntegro, adulteração ou erro
 * com requestId. A lista de divergências fica fora do anúncio (DivergenciasVerificacao).
 */
export function ResumoVerificacao({ resultado }: { resultado: ResultadoIntegridade }) {
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
  return (
    <div className="flex flex-col gap-0.5">
      {integridade.integro ? (
        <p className="text-status-aprovada-fg font-semibold">Histórico íntegro</p>
      ) : (
        <p className="text-destructive font-semibold">Adulteração detectada</p>
      )}
      <Verificacao integridade={integridade} />
    </div>
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

/** Lista das divergências (até 20) e "e mais N"; nada quando o histórico está íntegro. */
export function DivergenciasVerificacao({ resultado }: { resultado: ResultadoIntegridade }) {
  if (!resultado.ok || resultado.integridade.integro) return null;
  const { integridade } = resultado;
  const restantes = integridade.totalDivergencias - integridade.divergencias.length;
  return (
    <div className="flex flex-col gap-3">
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
      <Codigo solicitacao={d.solicitacao} />
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

const CLASSE_CODIGO = 'text-muted-foreground w-fit rounded-sm font-mono text-[12.5px]';

/** Código com link para o detalhe; a excluída não abre mais (RN-12), então vai sem link. */
function Codigo({ solicitacao }: { solicitacao: DivergenciaIntegridade['solicitacao'] }) {
  if (solicitacao.excluida) {
    return (
      <span className={`${CLASSE_CODIGO} flex flex-col leading-tight`}>
        {solicitacao.codigo}
        <span className="font-sans text-[11px]">
          <span className="sr-only">, </span>excluída
        </span>
      </span>
    );
  }
  return (
    <Link
      href={`/solicitacoes/${solicitacao.id}`}
      className={`${CLASSE_CODIGO} hover:text-foreground max-[760px]:inline-flex max-[760px]:min-h-11 max-[760px]:items-center`}
    >
      {solicitacao.codigo}
    </Link>
  );
}
