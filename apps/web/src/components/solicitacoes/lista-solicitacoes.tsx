import { FileQuestionMark, Inbox, SearchX } from 'lucide-react';
import Link from 'next/link';
import { EstadoVazio } from '@/components/estado-vazio';
import { Button } from '@/components/ui/button';
import type { UsuarioAtual } from '@/features/auth/usuario';
import { temFiltroAtivo, urlDaLista, type Filtros } from '@/features/solicitacoes/filtros';
import type { ItemSolicitacao, PaginaSolicitacoes } from '@/features/solicitacoes/tipos';
import { BotaoNovaSolicitacao } from './botao-nova-solicitacao';
import { CodigoSolicitacao } from './codigo-solicitacao';
import { DataRelativa } from './data-relativa';
import { SeloPrioridade } from './selo-prioridade';
import { SeloStatus } from './selo-status';

const linkDetalhe = (item: ItemSolicitacao) => `/solicitacoes/${item.id}`;

/**
 * Lista paginada: tabela no desktop, cartões abaixo de 760px. A coluna Solicitante some
 * para o solicitante, que só vê as próprias (RN-13).
 */
export function ListaSolicitacoes({
  pagina,
  filtros,
  usuario,
}: {
  pagina: PaginaSolicitacoes;
  filtros: Filtros;
  usuario: UsuarioAtual;
}) {
  const { data: itens, meta } = pagina;
  const mostrarSolicitante = usuario.cargo !== 'SOLICITANTE';

  if (itens.length === 0) {
    return (
      <section className="bg-card rounded-card">
        {meta.total > 0 ? (
          // Página além da última (ex.: ?page=99): há resultados, só não nesta página
          <EstadoVazio
            Icone={FileQuestionMark}
            titulo="Esta página não existe"
            acao={
              <Button variant="outline" asChild>
                <Link href={urlDaLista({ ...filtros, page: 1 })}>Ir para a página 1</Link>
              </Button>
            }
          >
            {meta.total} {meta.total === 1 ? 'solicitação' : 'solicitações'} em{' '}
            {Math.max(meta.totalPages, 1)} {meta.totalPages > 1 ? 'páginas' : 'página'}.
          </EstadoVazio>
        ) : temFiltroAtivo(filtros) ? (
          <EstadoVazio
            Icone={SearchX}
            titulo="Nenhuma solicitação encontrada"
            acao={
              <Button variant="outline" asChild>
                <Link href="/solicitacoes">Limpar filtros</Link>
              </Button>
            }
          >
            {filtros.q
              ? `Nada corresponde a “${filtros.q}” com os filtros atuais.`
              : 'Nada corresponde aos filtros atuais.'}
          </EstadoVazio>
        ) : (
          <EstadoVazio
            Icone={Inbox}
            titulo="Nenhuma solicitação ainda"
            acao={<BotaoNovaSolicitacao usuario={usuario} />}
          >
            Abra a primeira e acompanhe o andamento por aqui.
          </EstadoVazio>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Resultados" className="bg-card rounded-card flex flex-col p-2">
      <div className="overflow-x-auto max-[760px]:hidden">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-muted-foreground text-left text-xs">
              <th scope="col" className="px-3 py-3 font-medium">
                Código
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Título
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Área
              </th>
              {mostrarSolicitante && (
                <th scope="col" className="px-3 py-3 font-medium">
                  Solicitante
                </th>
              )}
              <th scope="col" className="px-3 py-3 font-medium">
                Prioridade
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Data
              </th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr
                key={item.id}
                className="hover:bg-muted relative transition-colors duration-150 [&>td]:px-3 [&>td]:py-2.5 [&>td:first-child]:rounded-l-row [&>td:last-child]:rounded-r-row"
              >
                <td>
                  <CodigoSolicitacao codigo={item.codigo} />
                </td>
                <td className="min-w-56">
                  {/* O link cobre a linha inteira (::after) e é o que o leitor de tela anuncia */}
                  <Link
                    href={linkDetalhe(item)}
                    className="focus-visible:after:outline-ring font-medium outline-none after:absolute after:inset-0 after:rounded-row focus-visible:after:outline-2 focus-visible:after:-outline-offset-2"
                  >
                    {item.titulo}
                  </Link>
                </td>
                <td>{item.area.nome}</td>
                {mostrarSolicitante && <td>{item.solicitante.nome}</td>}
                <td>
                  <SeloPrioridade prioridade={item.prioridade} />
                </td>
                <td>
                  <SeloStatus status={item.status} />
                </td>
                <td className="text-muted-foreground">
                  <DataRelativa iso={item.dataSolicitacao} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="hidden flex-col max-[760px]:flex">
        {itens.map((item) => (
          <li key={item.id} className="border-border border-b last:border-b-0">
            <Link
              href={linkDetalhe(item)}
              className="hover:bg-muted focus-visible:outline-ring rounded-row flex flex-col gap-2 p-3 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              <span className="flex items-center justify-between gap-3">
                <CodigoSolicitacao codigo={item.codigo} />
                <DataRelativa
                  iso={item.dataSolicitacao}
                  className="text-muted-foreground text-[13px]"
                />
              </span>
              <span className="font-semibold">{item.titulo}</span>
              <span className="text-muted-foreground text-[13px]">
                {item.area.nome}
                {mostrarSolicitante && ` · ${item.solicitante.nome}`}
              </span>
              <span className="flex flex-wrap gap-2">
                <SeloStatus status={item.status} />
                <SeloPrioridade prioridade={item.prioridade} />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Paginacao
        filtros={filtros}
        pagina={meta.page}
        totalPaginas={meta.totalPages}
        total={meta.total}
      />
    </section>
  );
}

function Paginacao({
  filtros,
  pagina,
  totalPaginas,
  total,
}: {
  filtros: Filtros;
  pagina: number;
  totalPaginas: number;
  total: number;
}) {
  const temAnterior = pagina > 1;
  const temProxima = pagina < totalPaginas;
  return (
    <nav
      aria-label="Paginação"
      className="border-border mx-1 mt-1 flex flex-wrap items-center justify-between gap-3 border-t px-2 pt-3 pb-1.5"
    >
      <p className="text-muted-foreground text-[13px]">
        {total} {total === 1 ? 'solicitação' : 'solicitações'} · Página {pagina} de{' '}
        {Math.max(totalPaginas, 1)}
      </p>
      <div className="flex gap-2 max-[760px]:[&>*]:h-11">
        {temAnterior ? (
          <Button variant="soft" size="sm" asChild>
            <Link href={urlDaLista({ ...filtros, page: pagina - 1 })}>Anterior</Link>
          </Button>
        ) : (
          <Button variant="soft" size="sm" disabled>
            Anterior
          </Button>
        )}
        {temProxima ? (
          <Button variant="soft" size="sm" asChild>
            <Link href={urlDaLista({ ...filtros, page: pagina + 1 })}>Próxima</Link>
          </Button>
        ) : (
          <Button variant="soft" size="sm" disabled>
            Próxima
          </Button>
        )}
      </div>
    </nav>
  );
}
