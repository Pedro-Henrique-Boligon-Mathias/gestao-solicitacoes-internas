'use client';

import { SlidersHorizontal, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FolhaContent } from '@/components/ui/folha';
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
  type Area,
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

/** Quantos filtros da folha do celular estão ativos: prioridades, áreas e ordenação fora do padrão. */
function totalDaFolha(filtros: Filtros): number {
  return (
    filtros.prioridade.length +
    filtros.area.length +
    (ordenacaoAtual(filtros) === 'recentes' ? 0 : 1)
  );
}

const alternar = <T,>(lista: T[], valor: T): T[] =>
  lista.includes(valor) ? lista.filter((item) => item !== valor) : [...lista, valor];

/**
 * Filtros da lista: tudo fica na URL (router.replace) e a página renderiza no servidor.
 * A busca espera 300 ms sem digitar; qualquer mudança volta para a página 1.
 * `areas` só vem para quem pode filtrar por área; sem ela (ou vazia), a linha não aparece.
 */
export function BarraFiltros({
  filtros,
  resumo,
  areas,
}: {
  filtros: Filtros;
  resumo: ResumoDashboard;
  areas?: Area[];
}) {
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

  function aoOrdenar(valor: string) {
    const escolhida = ORDENACOES.find((o) => o.valor === valor);
    if (escolhida) {
      navegar({ ...filtros, ordenarPor: escolhida.ordenarPor, direcao: escolhida.direcao });
    }
  }

  const mostrarAreas = Boolean(areas && areas.length > 0);
  const ativosNaFolha = totalDaFolha(filtros);

  const chipsPrioridade = PRIORIDADES.map((prioridade: Prioridade) => (
    <Chip
      key={prioridade}
      ativo={filtros.prioridade.includes(prioridade)}
      total={resumo.porPrioridade[prioridade]}
      icone={<IconePrioridade prioridade={prioridade} />}
      onClick={() => navegar({ ...filtros, prioridade: alternar(filtros.prioridade, prioridade) })}
    >
      {ROTULO_PRIORIDADE[prioridade]}
    </Chip>
  ));

  const chipsArea = (areas ?? []).map((area) => (
    <Chip
      key={area.id}
      ativo={filtros.area.includes(area.id)}
      onClick={() => navegar({ ...filtros, area: alternar(filtros.area, area.id) })}
    >
      {area.nome}
    </Chip>
  ));

  return (
    <section
      aria-label="Filtros"
      className="bg-card rounded-card flex flex-col gap-4 p-5 max-[760px]:gap-3 max-[760px]:rounded-none max-[760px]:bg-transparent max-[760px]:p-0"
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3.5 max-[760px]:gap-x-2 max-[760px]:gap-y-2">
        <div className="flex min-w-0 flex-[999_1_320px] flex-col gap-2 max-[760px]:basis-0">
          <label
            htmlFor={`${id}-busca`}
            className="text-[13px] leading-none font-medium max-[760px]:sr-only"
          >
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
              className="pl-10 max-[760px]:rounded-pill max-[760px]:h-11 max-[760px]:shadow-none"
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-2 max-[760px]:hidden">
          <label htmlFor={`${id}-ordem`} className="text-[13px] leading-none font-medium">
            Ordenar
          </label>
          <SeletorOrdem id={`${id}-ordem`} valor={ordenacaoAtual(filtros)} aoMudar={aoOrdenar} />
        </div>

        {/* Celular: prioridade, área e ordenação ficam numa folha; a folha só entra no DOM aberta */}
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label={
                ativosNaFolha > 0
                  ? `Filtros e ordenação (${ativosNaFolha} ${ativosNaFolha === 1 ? 'ativo' : 'ativos'})`
                  : 'Filtros e ordenação'
              }
              className="bg-card text-foreground hover:bg-muted focus-visible:outline-ring relative hidden size-11 flex-none cursor-pointer place-items-center rounded-full transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 max-[760px]:grid"
            >
              <SlidersHorizontal aria-hidden="true" className="size-[18px]" />
              {ativosNaFolha > 0 && (
                <span
                  aria-hidden="true"
                  className="bg-brand-orange rounded-pill absolute -top-0.5 -right-1 px-1.5 font-mono text-[10.5px] leading-4 font-medium text-[#14213D] tabular-nums"
                >
                  {ativosNaFolha}
                </span>
              )}
            </button>
          </DialogTrigger>
          <FolhaContent aria-describedby={undefined}>
            <DialogTitle className="font-display pr-12 text-xl font-semibold">Filtros</DialogTitle>
            <div className="mt-5 flex flex-col gap-5">
              <GrupoChips rotulo="Prioridade" quebrar>
                {chipsPrioridade}
              </GrupoChips>
              {mostrarAreas && (
                <GrupoChips rotulo="Área" quebrar>
                  {chipsArea}
                </GrupoChips>
              )}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor={`${id}-ordem-folha`}
                  className="text-[13px] leading-none font-medium"
                >
                  Ordenar
                </label>
                <SeletorOrdem
                  id={`${id}-ordem-folha`}
                  valor={ordenacaoAtual(filtros)}
                  aoMudar={aoOrdenar}
                  className="h-11"
                />
              </div>
            </div>
          </FolhaContent>
        </Dialog>

        {temFiltroAtivo(filtros) && (
          <Button
            variant="ghost"
            className="text-link max-[760px]:h-11"
            onClick={() => {
              setTexto('');
              navegar({
                ...filtros,
                q: undefined,
                status: [],
                prioridade: [],
                area: [],
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
        {/* No celular, prioridade e área saem da barra e vão para a folha */}
        <GrupoChips rotulo="Prioridade" className="max-[760px]:hidden">
          {chipsPrioridade}
        </GrupoChips>
        {mostrarAreas && (
          <GrupoChips rotulo="Área" className="max-[760px]:hidden">
            {chipsArea}
          </GrupoChips>
        )}
      </div>
    </section>
  );
}

function SeletorOrdem({
  id,
  valor,
  aoMudar,
  className,
}: {
  id: string;
  valor: string;
  aoMudar: (valor: string) => void;
  className?: string;
}) {
  return (
    <select
      id={id}
      value={valor}
      onChange={(evento) => aoMudar(evento.target.value)}
      className={cn(
        'rounded-field bg-card text-foreground focus-visible:outline-ring h-[42px] w-full cursor-pointer px-3 text-[15px] shadow-[inset_0_0_0_1px_var(--input)] outline-none focus-visible:outline-2 focus-visible:outline-offset-1 sm:text-sm',
        className,
      )}
    >
      {ORDENACOES.map((opcao) => (
        <option key={opcao.valor} value={opcao.valor}>
          {opcao.rotulo}
        </option>
      ))}
    </select>
  );
}

function GrupoChips({
  rotulo,
  quebrar = false,
  className,
  children,
}: {
  rotulo: string;
  /** Na folha os chips quebram linha em vez de rolar para o lado. */
  quebrar?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className={cn('flex min-w-0 flex-col gap-2', className)}>
      <span id={id} className="text-[13px] leading-none font-medium">
        {rotulo}
      </span>
      {/* No celular os chips rolam para o lado */}
      <div
        className={cn(
          '-m-1 flex gap-1.5 p-1',
          quebrar ? 'flex-wrap' : 'max-[760px]:overflow-x-auto max-[760px]:[scrollbar-width:none]',
        )}
      >
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
  /** Quantas há nessa opção; os chips de área não têm (o resumo não conta por área). */
  total?: number;
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
        'rounded-pill flex h-8 flex-none max-[760px]:h-11 max-[760px]:px-3.5 cursor-pointer items-center gap-1.5 px-3 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 outline-none',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
        ativo
          ? 'bg-primary text-primary-foreground'
          : 'bg-card text-foreground hover:bg-muted shadow-[inset_0_0_0_1px_var(--border)]',
      )}
    >
      {icone}
      {children}
      {total !== undefined && (
        <span
          className={cn(
            'font-mono text-[11.5px] tabular-nums',
            ativo ? 'opacity-85' : 'text-muted-foreground',
          )}
        >
          {total}
        </span>
      )}
    </button>
  );
}
