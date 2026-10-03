import { formatarData } from '@/features/solicitacoes/datas';
import {
  ROTULO_CAMPO,
  ROTULO_EVENTO,
  ROTULO_PRIORIDADE,
  ROTULO_STATUS,
  ROTULO_TIPO_INTEGRACAO,
} from '@/features/solicitacoes/rotulos';
import type {
  EventoHistorico,
  EventoIntegracao,
  Pessoa,
  Prioridade,
  Status,
  StatusIntegracao,
} from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';

const COR_EVENTO: Record<EventoHistorico['tipo'], string> = {
  CRIADA: 'bg-status-aberta-dot',
  EDITADA: 'bg-input',
  ANALISE_INICIADA: 'bg-status-analise-dot',
  APROVADA: 'bg-status-aprovada-dot',
  REJEITADA: 'bg-status-rejeitada-dot',
  REABERTA: 'bg-status-aberta-dot',
  EXCLUIDA: 'bg-input',
};

const COR_INTEGRACAO: Record<StatusIntegracao, string> = {
  PENDENTE: 'bg-status-analise-dot',
  ENVIADO: 'bg-status-aprovada-dot',
  FALHOU: 'bg-status-rejeitada-dot',
};

type Alteracao = { campo: string; antes: string; depois: string };
type DecisaoDesfeita = {
  resultado: Status;
  comentario?: string;
  decididoEm?: string;
  decididoPor?: Pessoa;
};

const ehObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null;

/** Valor de um campo editado, com rótulo quando é prioridade. */
function valorLegivel(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (campo === 'prioridade' && typeof valor === 'string' && valor in ROTULO_PRIORIDADE) {
    return ROTULO_PRIORIDADE[valor as Prioridade];
  }
  return String(valor);
}

/** EDITADA: `{ campo: { antes, depois } }`. */
function alteracoes(dados: EventoHistorico['dados']): Alteracao[] {
  if (!ehObjeto(dados)) return [];
  return Object.entries(dados)
    .filter(([, valor]) => ehObjeto(valor) && ('antes' in valor || 'depois' in valor))
    .map(([campo, valor]) => {
      const { antes, depois } = valor as { antes?: unknown; depois?: unknown };
      return {
        campo: ROTULO_CAMPO[campo] ?? campo,
        antes: valorLegivel(campo, antes),
        depois: valorLegivel(campo, depois),
      };
    });
}

/** REABERTA: `{ decisaoAnterior: { resultado, comentario, decididoEm, decididoPor } }`. */
function decisaoDesfeita(dados: EventoHistorico['dados']): DecisaoDesfeita | null {
  const anterior = ehObjeto(dados) ? dados.decisaoAnterior : null;
  if (!ehObjeto(anterior) || typeof anterior.resultado !== 'string') return null;
  return anterior as unknown as DecisaoDesfeita;
}

function Citacao({ children, className }: { children: string; className?: string }) {
  return (
    <p
      className={cn(
        'bg-muted rounded-field px-3 py-2 text-[13px] leading-normal whitespace-pre-wrap',
        className,
      )}
    >
      {children}
    </p>
  );
}

type Item =
  | { origem: 'historico'; data: string; evento: EventoHistorico }
  | { origem: 'integracao'; data: string; evento: EventoIntegracao };

/**
 * Itens de integração que viram marco na linha do tempo: o envio (pela data de envio) e a falha
 * (pela data de criação do evento). Os pendentes ficam só no bloco Integração.
 */
function itensDeIntegracao(eventos: EventoIntegracao[]): Item[] {
  return eventos.flatMap((evento): Item[] => {
    if (evento.status === 'ENVIADO') {
      return [{ origem: 'integracao', data: evento.enviadaEm ?? evento.criadoEm, evento }];
    }
    if (evento.status === 'FALHOU')
      return [{ origem: 'integracao', data: evento.criadoEm, evento }];
    return [];
  });
}

/** Histórico e integração intercalados por data; no empate, o histórico vem antes. */
function intercalar(historico: EventoHistorico[], integracao: EventoIntegracao[]): Item[] {
  const itens: Item[] = [
    ...historico.map((evento): Item => ({ origem: 'historico', data: evento.criadoEm, evento })),
    ...itensDeIntegracao(integracao),
  ];
  return itens.sort((a, b) => Date.parse(a.data) - Date.parse(b.data));
}

/**
 * Linha do tempo do histórico, do evento mais antigo para o mais recente, com os marcos da
 * integração (ADR-010) intercalados por data. Os itens do histórico não mudam.
 */
export function LinhaDoTempo({
  eventos,
  eventosIntegracao = [],
}: {
  eventos: EventoHistorico[];
  eventosIntegracao?: EventoIntegracao[];
}) {
  const itens = intercalar(eventos, eventosIntegracao);
  return (
    <ol aria-label="Histórico" className="flex flex-col">
      {itens.map((item, indice) => {
        const ultimo = indice === itens.length - 1;
        const cor =
          item.origem === 'historico'
            ? COR_EVENTO[item.evento.tipo]
            : COR_INTEGRACAO[item.evento.status];
        return (
          <li
            key={`${item.origem}-${item.evento.id}`}
            className="relative flex gap-3 pb-5 last:pb-0"
          >
            {!ultimo && (
              <span
                aria-hidden="true"
                className="bg-border absolute top-4 bottom-0 left-[4.5px] w-px"
              />
            )}
            <span
              aria-hidden="true"
              className={cn('mt-1.5 size-2.5 flex-none rounded-full', cor)}
            />
            {item.origem === 'historico' ? (
              <ItemHistorico evento={item.evento} />
            ) : (
              <ItemIntegracao evento={item.evento} data={item.data} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Marco da integração: sem autor (quem envia é o sistema). */
function ItemIntegracao({ evento, data }: { evento: EventoIntegracao; data: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <p className="text-sm">
        <span className="font-medium">
          {evento.status === 'ENVIADO' ? 'Integração enviada' : 'Integração falhou'}
        </span>
        <span className="text-muted-foreground"> · {ROTULO_TIPO_INTEGRACAO[evento.tipo]}</span>
      </p>
      <time dateTime={data} className="text-muted-foreground font-mono text-[12.5px] tabular-nums">
        {formatarData(data)}
      </time>
    </div>
  );
}

function ItemHistorico({ evento }: { evento: EventoHistorico }) {
  const mudancas = evento.tipo === 'EDITADA' ? alteracoes(evento.dados) : [];
  const desfeita = evento.tipo === 'REABERTA' ? decisaoDesfeita(evento.dados) : null;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <p className="text-sm">
        <span className="font-medium">{ROTULO_EVENTO[evento.tipo]}</span>
        <span className="text-muted-foreground"> por </span>
        {evento.autor.nome}
      </p>
      <time
        dateTime={evento.criadoEm}
        className="text-muted-foreground font-mono text-[12.5px] tabular-nums"
      >
        {formatarData(evento.criadoEm)}
      </time>

      {mudancas.length > 0 && (
        <dl className="flex flex-col gap-1 text-[13px]">
          {mudancas.map((mudanca) => (
            <div key={mudanca.campo} className="flex flex-wrap gap-x-1.5">
              <dt className="text-muted-foreground">{mudanca.campo}:</dt>
              <dd className="min-w-0 break-words">
                <span className="text-muted-foreground line-through">{mudanca.antes}</span>
                <span aria-hidden="true"> → </span>
                <span className="sr-only"> para </span>
                <span>{mudanca.depois}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {evento.tipo === 'REABERTA' && evento.comentario && (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Justificativa</span>
          <Citacao>{evento.comentario}</Citacao>
        </div>
      )}
      {evento.tipo !== 'REABERTA' && evento.comentario && <Citacao>{evento.comentario}</Citacao>}

      {desfeita && (
        <div className="rounded-field flex flex-col gap-1 px-3 py-2 text-[13px] shadow-[inset_0_0_0_1px_var(--border)]">
          <span className="text-muted-foreground text-xs">Decisão desfeita</span>
          <p>
            {ROTULO_STATUS[desfeita.resultado] ?? desfeita.resultado}
            {desfeita.decididoPor && ` por ${desfeita.decididoPor.nome}`}
            {desfeita.decididoEm && (
              <>
                {' em '}
                <time
                  dateTime={desfeita.decididoEm}
                  className="font-mono text-[12.5px] tabular-nums"
                >
                  {formatarData(desfeita.decididoEm)}
                </time>
              </>
            )}
          </p>
          {desfeita.comentario && (
            <p className="text-muted-foreground whitespace-pre-wrap">{desfeita.comentario}</p>
          )}
        </div>
      )}
    </div>
  );
}
