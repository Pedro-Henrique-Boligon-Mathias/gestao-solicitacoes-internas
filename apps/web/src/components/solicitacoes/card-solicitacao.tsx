import Link from 'next/link';
import type { UsuarioAtual } from '@/features/auth/usuario';
import type { ItemSolicitacao } from '@/features/solicitacoes/tipos';
import { CodigoSolicitacao } from './codigo-solicitacao';
import { DataRelativa } from './data-relativa';
import { SeloPrioridade } from './selo-prioridade';
import { SeloStatus } from './selo-status';

/**
 * Card da lista no celular: código e data relativa → título → área · solicitante → selos.
 * O card inteiro é um único link para o detalhe. O solicitante só vê as próprias (RN-13),
 * então para ele o card mostra só a área.
 */
export function CardSolicitacao({
  item,
  usuario,
}: {
  item: ItemSolicitacao;
  usuario: Pick<UsuarioAtual, 'cargo'>;
}) {
  const mostrarSolicitante = usuario.cargo !== 'SOLICITANTE';
  return (
    <Link
      href={`/solicitacoes/${item.id}`}
      className="bg-card text-foreground hover:bg-muted focus-visible:outline-ring flex flex-col gap-2 rounded-[20px] p-4 transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <span className="flex items-center justify-between gap-3">
        <CodigoSolicitacao codigo={item.codigo} />
        <DataRelativa iso={item.dataSolicitacao} className="text-muted-foreground text-[12.5px]" />
      </span>
      <span className="text-base leading-[1.3] font-semibold">{item.titulo}</span>
      <span className="text-muted-foreground text-[13px]">
        {item.area.nome}
        {mostrarSolicitante && ` · ${item.solicitante.nome}`}
      </span>
      <span className="mt-0.5 flex flex-wrap gap-1.5">
        <SeloStatus status={item.status} />
        <SeloPrioridade prioridade={item.prioridade} />
      </span>
    </Link>
  );
}
