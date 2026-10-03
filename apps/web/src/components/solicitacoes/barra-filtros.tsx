'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  temFiltroAtivo,
  urlDaLista,
  type Direcao,
  type Filtros,
  type OrdenarPor,
} from '@/features/solicitacoes/filtros';
import { ROTULO_PRIORIDADE, ROTULO_STATUS_PLURAL } from '@/features/solicitacoes/rotulos';
import {
  PRIORIDADES,
  STATUS,
  type Prioridade,
  type ResumoDashboard,
  type Status,
} from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';
import { IconePrioridade } from './selo-prioridade';

const ESPERA_BUSCA_MS = 300;

const ORDENACOES: { valor: string; rotulo: string; ordenarPor: OrdenarPor; direcao: Direcao }[] = [
  { valor: 'recentes', rotulo: 'Mais recentes', ordenarPor: 'dataSolicitacao', direcao: 'desc' },
  { valor: 'antigas', rotulo: 'Mais antigas', ordenarPor: 'dataSolicitacao', direcao: 'asc' },
  { valor: 'prioridade', rotulo: 'Prioridade', ordenarPor: 'prioridade', direcao: 'desc' },
];

function ordenacaoAtual(filtros: Filtros): string {
  if (filtros.ordenarPor === 'prioridade') return 'prioridade';
  return filtros.direcao === 'asc' ? 'antigas' : 'recentes';
}

const alternar = <T,>(lista: T[], valor: T): T[] =>
  lista.includes(valor) ? lista.filter((item) => item !== valor) : [...lista, valor];

/**
 * Filtros da lista: tudo fica na URL (router.replace) e a página renderiza no servidor.
 * A busca espera 300 ms sem digitar; qualquer mudança volta para a página 1.
 */
export function BarraFiltros({ filtros, resumo }: { filtros: Filtros; resumo: ResumoDashboard }) {
  const router = useRouter();
  const id = useId();
  const [texto, setTexto] = useState(filtros.q ?? '');
  const [qDaUrl, setQDaUrl] = useState(filtros.q);
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A URL mudou por fora (Limpar filtros, voltar do navegador): o campo acompanha
  if (qDaUrl !== filtros.q) {
    setQDaUrl(filtros.q);
    setTexto(filtros.q ?? '');
  }

  useEffect(() => () => clearTimeout(espera.current), []);

  function navegar(novos: Filtros) {
    clearTimeout(espera.current);
    router.replace(urlDaLista({ ...novos, page: 1 }), { scroll: false });
  }

  function aoDigitar(valor: string) {
    setTexto(valor);
    clearTimeout(espera.current);
    espera.current = setTimeout(() => {
      const q = valor.trim();
      const normalizado = q.length >= 2 ? q : undefined;
      if (normalizado === filtros.q) return;
      navegar({ ...filtros, q: normalizado });
    }, ESPERA_BUSCA_MS);
  }

  return (
    <section
      aria-label="Filtros"
      className="bg-card rounded-card flex flex-col gap-4 p-5 max-[760px]:gap-3.5"
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3.5">
        <div className="flex min-w-0 flex-[999_1_320px] flex-col gap-2">
          <label htmlFor={`${id}-busca`} className="text-[13px] leading-none font-medium">
            Buscar
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
            />
            <Input
              id={`${id}-busca`}
              type="search"
              value={texto}
              onChange={(evento) => aoDigitar(evento.target.value)}
              placeholder="Título, descrição ou código"
              autoComplete="off"
              className="pl-10"
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-2">
          <label htmlFor={`${id}-ordem`} className="text-[13px] leading-none font-medium">
            Ordenar
          </label>
          <select
            id={`${id}-ordem`}
            value={ordenacaoAtual(filtros)}
            onChange={(evento) => {
              const escolhida = ORDENACOES.find((o) => o.valor === evento.target.value);
              if (escolhida) {
                navegar({
                  ...filtros,
                  ordenarPor: escolhida.ordenarPor,
                  direcao: escolhida.direcao,
                });
              }
            }}
            className="rounded-field bg-card text-foreground focus-visible:outline-ring h-[42px] w-full cursor-pointer px-3 text-[15px] shadow-[inset_0_0_0_1px_var(--input)] outline-none focus-visible:outline-2 focus-visible:outline-offset-1 sm:text-sm"
          >
            {ORDENACOES.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
        </div>
        {temFiltroAtivo(filtros) && (
          <Button
            variant="ghost"
            className="text-link"
            onClick={() => {
              setTexto('');
              navegar({
                ...filtros,
                q: undefined,
                status: [],
                prioridade: [],
                analista: undefined,
              });
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3.5">
        <GrupoChips rotulo="Status">
          {STATUS.map((status: Status) => (
            <Chip
              key={status}
              ativo={filtros.status.includes(status)}
              total={resumo.porStatus[status]}
              onClick={() => navegar({ ...filtros, status: alternar(filtros.status, status) })}
            >
              {ROTULO_STATUS_PLURAL[status]}
            </Chip>
          ))}
        </GrupoChips>
        <GrupoChips rotulo="Prioridade">
          {PRIORIDADES.map((prioridade: Prioridade) => (
            <Chip
              key={prioridade}
              ativo={filtros.prioridade.includes(prioridade)}
              total={resumo.porPrioridade[prioridade]}
              icone={<IconePrioridade prioridade={prioridade} />}
              onClick={() =>
                navegar({ ...filtros, prioridade: alternar(filtros.prioridade, prioridade) })
              }
            >
              {ROTULO_PRIORIDADE[prioridade]}
            </Chip>
          ))}
        </GrupoChips>
      </div>
    </section>
  );
}

function GrupoChips({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <span id={id} className="text-[13px] leading-none font-medium">
        {rotulo}
      </span>
      {/* No celular os chips rolam para o lado */}
      <div className="-m-1 flex gap-1.5 p-1 max-[760px]:overflow-x-auto max-[760px]:[scrollbar-width:none]">
        {children}
      </div>
    </div>
  );
}

function Chip({
  ativo,
  total,
  icone,
  onClick,
  children,
}: {
  ativo: boolean;
  total: number;
  icone?: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        'rounded-pill flex h-8 flex-none cursor-pointer items-center gap-1.5 px-3 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 outline-none',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
        ativo
          ? 'bg-primary text-primary-foreground'
          : 'bg-card text-foreground hover:bg-muted shadow-[inset_0_0_0_1px_var(--border)]',
      )}
    >
      {icone}
      {children}
      <span
        className={cn(
          'font-mono text-[11.5px] tabular-nums',
          ativo ? 'opacity-85' : 'text-muted-foreground',
        )}
      >
        {total}
      </span>
    </button>
  );
}
