import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import { EstadoVazio } from '@/components/estado-vazio';
import { STATUS, type PainelGestao, type Status } from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';

type AreaGestao = PainelGestao['porArea'][number];

const COR_STATUS: Record<Status, string> = {
  ABERTA: 'bg-status-aberta-dot',
  EM_ANALISE: 'bg-status-analise-dot',
  APROVADA: 'bg-status-aprovada-dot',
  REJEITADA: 'bg-status-rejeitada-dot',
};

const lista = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' });

const celulaNumero =
  'px-3 py-2.5 text-right font-mono tabular-nums max-[760px]:flex max-[760px]:flex-col max-[760px]:items-start max-[760px]:p-0 max-[760px]:text-left max-[760px]:before:font-sans max-[760px]:before:text-[11.5px] max-[760px]:before:text-muted-foreground max-[760px]:before:content-[attr(data-rotulo)]';

/**
 * "Por área" do painel de gestão (RF-04): total e os 4 status de cada área no período, na ordem
 * da API. Cada linha abre a lista filtrada pela área (sem o período, que a lista não tem). As
 * zeradas vão juntas para o rodapé. No celular, cada linha vira um cartão (só CSS).
 */
export function PorArea({ areas }: { areas: AreaGestao[] }) {
  const idTitulo = useId();
  const comSolicitacoes = areas.filter((a) => a.total > 0);
  const zeradas = areas.filter((a) => a.total === 0);

  return (
    <section
      aria-labelledby={idTitulo}
      className="bg-card rounded-card flex min-w-0 flex-col gap-2 p-5 max-[760px]:p-4"
    >
      <div>
        <h2
          id={idTitulo}
          className="font-display text-lg leading-[1.2] font-semibold tracking-[-0.02em]"
        >
          Por área
        </h2>
        {comSolicitacoes.length > 0 && (
          <p className="text-muted-foreground text-[13px]">
            Cada linha abre a lista filtrada pela área
          </p>
        )}
      </div>

      {comSolicitacoes.length === 0 ? (
        <EstadoVazio Icone={Building2} titulo="Nenhuma solicitação no período" className="py-8">
          Escolha um período maior no seletor acima.
        </EstadoVazio>
      ) : (
        <TabelaAreas areas={comSolicitacoes} />
      )}

      {comSolicitacoes.length > 0 && zeradas.length > 0 && (
        <p className="text-muted-foreground border-border border-t px-3 pt-2 text-[12.5px]">
          Sem solicitações no período: {lista.format(zeradas.map((a) => a.area.nome))}.
        </p>
      )}
    </section>
  );
}

const COLUNA_STATUS: Record<Status, string> = {
  ABERTA: 'Abertas',
  EM_ANALISE: 'Em análise',
  APROVADA: 'Aprovadas',
  REJEITADA: 'Rejeitadas',
};

function TabelaAreas({ areas }: { areas: AreaGestao[] }) {
  return (
    <table className="w-full border-collapse text-sm max-[760px]:block">
      <thead className="text-muted-foreground text-xs max-[760px]:hidden">
        <tr className="border-border border-b">
          <th className="px-3 py-2 text-left font-medium">Área</th>
          <th className="px-3 py-2 text-right font-medium">Total</th>
          {STATUS.map((s) => (
            <th key={s} className="px-3 py-2 text-right font-medium">
              {COLUNA_STATUS[s]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="max-[760px]:flex max-[760px]:flex-col max-[760px]:gap-2">
        {areas.map((a) => (
          <tr
            key={a.area.id}
            className="border-border hover:bg-muted/60 relative border-b last:border-b-0 max-[760px]:grid max-[760px]:grid-cols-4 max-[760px]:gap-x-2 max-[760px]:gap-y-2 max-[760px]:rounded-inner max-[760px]:border-b-0 max-[760px]:bg-muted max-[760px]:p-3"
          >
            <td className="px-3 py-2.5 max-[760px]:col-span-3 max-[760px]:p-0">
              <Link
                href={`/solicitacoes?area=${a.area.id}`}
                className="focus-visible:ring-ring rounded-sm font-medium outline-none after:absolute after:inset-0 focus-visible:ring-2"
              >
                {a.area.nome}
              </Link>
              <MiniBarra area={a} />
            </td>
            <td
              data-rotulo="Total"
              className={cn(
                celulaNumero,
                'font-semibold max-[760px]:items-end max-[760px]:text-right',
              )}
            >
              {a.total}
            </td>
            {STATUS.map((s) => (
              <td key={s} data-rotulo={COLUNA_STATUS[s]} className={celulaNumero}>
                {a.porStatus[s]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Barrinha proporcional aos 4 status (decorativa: os números estão nas colunas). */
function MiniBarra({ area }: { area: AreaGestao }) {
  return (
    <span
      aria-hidden="true"
      className="mt-1.5 flex h-1.5 w-full max-w-40 gap-0.5 overflow-hidden rounded-full"
    >
      {STATUS.filter((s) => area.porStatus[s] > 0).map((s) => (
        <i
          key={s}
          className={cn('block h-full', COR_STATUS[s])}
          style={{ flex: area.porStatus[s] }}
        />
      ))}
    </span>
  );
}
