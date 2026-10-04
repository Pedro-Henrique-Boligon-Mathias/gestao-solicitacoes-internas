import Link from 'next/link';
import type { PainelGestao } from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';

export type AnalistaGestao = PainelGestao['porAnalista'][number];

const celulaNumero =
  'px-3 py-2.5 text-right font-mono tabular-nums max-[760px]:flex max-[760px]:flex-col max-[760px]:items-start max-[760px]:p-0 max-[760px]:text-left max-[760px]:before:font-sans max-[760px]:before:text-[11.5px] max-[760px]:before:text-muted-foreground max-[760px]:before:content-[attr(data-rotulo)]';

/** Taxa de aprovação em %; sem decisões no período fica "—", nunca 0%. */
function taxa(analista: AnalistaGestao): string {
  return analista.taxaAprovacao === null ? '—' : `${Math.round(analista.taxaAprovacao * 100)}%`;
}

/**
 * Tabela de analistas (agora, decididas no período e taxa). Cada linha abre a lista com as
 * análises da pessoa (?analista=<id>&status=EM_ANALISE). No celular, `cartoes` vira cartões.
 */
export function TabelaAnalistas({
  analistas,
  cartoes = true,
}: {
  analistas: AnalistaGestao[];
  cartoes?: boolean;
}) {
  const m = (classes: string) => (cartoes ? classes : '');
  return (
    <table className={cn('w-full border-collapse text-sm', m('max-[760px]:block'))}>
      <thead className={cn('text-muted-foreground text-xs', m('max-[760px]:hidden'))}>
        <tr className="border-border border-b">
          <th className="px-3 py-2 text-left font-medium">Analista</th>
          <th className="px-3 py-2 text-right font-medium">Agora</th>
          <th className="px-3 py-2 text-right font-medium">Decididas</th>
          <th className="px-3 py-2 text-right font-medium">Aprovação</th>
        </tr>
      </thead>
      <tbody className={m('max-[760px]:flex max-[760px]:flex-col max-[760px]:gap-2')}>
        {analistas.map((a) => (
          <tr
            key={a.analista.id}
            className={cn(
              'border-border hover:bg-muted/60 relative border-b last:border-b-0',
              m(
                'max-[760px]:rounded-inner max-[760px]:bg-muted max-[760px]:grid max-[760px]:grid-cols-3 max-[760px]:gap-2 max-[760px]:border-b-0 max-[760px]:p-3',
              ),
            )}
          >
            <td className={cn('px-3 py-2.5', m('max-[760px]:col-span-3 max-[760px]:p-0'))}>
              <Link
                href={`/solicitacoes?analista=${a.analista.id}&status=EM_ANALISE`}
                className="focus-visible:ring-ring rounded-sm font-medium outline-none after:absolute after:inset-0 focus-visible:ring-2"
              >
                {a.analista.nome}
              </Link>
            </td>
            <td
              data-rotulo="Agora"
              className={cn(
                cartoes ? celulaNumero : 'px-3 py-2.5 text-right font-mono tabular-nums',
              )}
            >
              {a.emAnaliseAgora}
            </td>
            <td
              data-rotulo="Decididas"
              className={cn(
                cartoes ? celulaNumero : 'px-3 py-2.5 text-right font-mono tabular-nums',
              )}
            >
              {a.decididas}
            </td>
            <td
              data-rotulo="Aprovação"
              title={a.taxaAprovacao === null ? 'Sem decisões no período' : undefined}
              className={cn(
                cartoes ? celulaNumero : 'px-3 py-2.5 text-right font-mono tabular-nums',
                a.taxaAprovacao === null && 'text-muted-foreground',
              )}
            >
              {taxa(a)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
