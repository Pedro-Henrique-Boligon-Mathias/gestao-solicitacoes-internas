import { ArrowDown, ArrowUp, ChartColumn, Clock, Inbox } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { intervaloPeriodo, rotuloPeriodo } from '@/features/dashboard/periodo';
import { diasDesde, formatarDiaMes } from '@/features/solicitacoes/datas';
import { ROTULO_PRIORIDADE } from '@/features/solicitacoes/rotulos';
import { PRIORIDADES, type PainelGestao, type Prioridade } from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';

type DadosEntradaSaida = PainelGestao['entradaSaida'];
type PeriodoGestao = PainelGestao['periodo'];
type Balde = DadosEntradaSaida['serie'][number];

const GRANULARIDADE: Record<NonNullable<PeriodoGestao['granularidade']>, string> = {
  dia: 'por dia',
  semana: 'por semana',
  mes: 'por mês',
};

const COR_TRILHA: Record<Prioridade, string> = {
  ALTA: 'bg-chart-alta',
  MEDIA: 'bg-chart-media',
  BAIXA: 'bg-chart-baixa',
};

const formatoMes = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  month: '2-digit',
  year: 'numeric',
});

/** Sinal tipográfico: "+3", "−2", "0". */
function comSinal(valor: number): string {
  if (valor > 0) return `+${valor}`;
  if (valor < 0) return `−${Math.abs(valor)}`;
  return '0';
}

const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

function rotuloBalde(balde: Balde, granularidade: PeriodoGestao['granularidade']): string {
  return granularidade === 'mes'
    ? formatoMes.format(new Date(balde.inicio))
    : formatarDiaMes(balde.inicio);
}

function subtitulo(periodo: PeriodoGestao): string {
  const intervalo = intervaloPeriodo(periodo.valor, new Date(periodo.fim));
  const base = `${rotuloPeriodo(periodo.valor)} (${intervalo})`;
  return periodo.granularidade ? `${base}, ${GRANULARIDADE[periodo.granularidade]}` : base;
}

/** Bloco em --muted com o rótulo como nome do role="group". */
function Bloco({
  rotulo,
  valor,
  selo,
  detalhe,
  amostra,
}: {
  rotulo: ReactNode;
  valor: string;
  selo?: ReactNode;
  detalhe?: ReactNode;
  amostra?: 'solida' | 'hachura';
}) {
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="bg-muted rounded-inner flex min-w-0 flex-col gap-3 px-[18px] py-4 max-[760px]:gap-2 max-[760px]:p-3"
    >
      <span className="flex items-center gap-2 text-[13.5px] font-medium">
        {amostra && <Amostra tipo={amostra} />}
        <span id={id}>{rotulo}</span>
      </span>
      <span className="flex flex-wrap items-end justify-between gap-2">
        <span className="font-display text-[40px] leading-[0.95] font-semibold tracking-[-0.035em] max-[760px]:text-[28px]">
          {valor}
        </span>
        {selo}
      </span>
      {detalhe && (
        <small className="text-muted-foreground -mt-1 text-[12.5px] max-[760px]:hidden">
          {detalhe}
        </small>
      )}
    </div>
  );
}

function Amostra({ tipo }: { tipo: 'solida' | 'hachura' }) {
  return (
    <i
      aria-hidden="true"
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full',
        tipo === 'solida' ? 'bg-chart-serie' : 'ring-chart-serie-muted ring-[1.5px] ring-inset',
      )}
    />
  );
}

function Selo({ tom, children }: { tom: 'neutro' | 'ambar' | 'verde'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap',
        tom === 'neutro' && 'bg-card text-muted-foreground max-[760px]:hidden',
        tom === 'ambar' && 'bg-warning-bg text-warning-fg',
        tom === 'verde' && 'bg-status-aprovada-bg text-status-aprovada-fg',
      )}
    >
      {children}
    </span>
  );
}

/** "+3 vs. 7 dias antes", com a seta. */
function SeloVariacao({
  atual,
  anterior,
  janela,
}: {
  atual: number;
  anterior: number;
  janela: number;
}) {
  const diferenca = atual - anterior;
  const Seta = diferenca < 0 ? ArrowDown : ArrowUp;
  return (
    <Selo tom="neutro">
      {diferenca !== 0 && <Seta aria-hidden="true" className="size-3" />}
      {comSinal(diferenca)} vs. {janela} dias antes
    </Selo>
  );
}

/** Pares de pílulas por balde: sólida = entraram, hachura = saíram, número em cima. */
function Grafico({ serie, periodo }: { serie: Balde[]; periodo: PeriodoGestao }) {
  const maior = Math.max(1, ...serie.flatMap((b) => [b.entraram, b.sairam]));
  const rotulos = serie.map((b) => rotuloBalde(b, periodo.granularidade));
  const descricao = serie
    .map((b, i) => `${rotulos[i]}: ${b.entraram} entraram, ${b.sairam} saíram`)
    .join('; ');
  const granularidade = periodo.granularidade ? ` ${GRANULARIDADE[periodo.granularidade]}` : '';

  return (
    <div
      role="img"
      aria-label={`Entrada e saída${granularidade}. ${descricao}.`}
      className="grid h-[250px] items-end gap-2 pt-7 max-[760px]:h-[180px] max-[760px]:gap-1"
      style={{ gridTemplateColumns: `repeat(${serie.length}, minmax(0, 1fr))` }}
    >
      {serie.map((balde, i) => (
        <div
          key={balde.inicio}
          className="flex h-full min-w-0 flex-col items-center justify-end gap-2.5"
        >
          <span className="flex h-full items-end gap-[5px] max-[760px]:gap-0.5">
            <Pilula valor={balde.entraram} maior={maior} tipo="solida" />
            <Pilula valor={balde.sairam} maior={maior} tipo="hachura" />
          </span>
          <small className="text-muted-foreground font-mono text-[11.5px] whitespace-nowrap max-[760px]:text-[10px]">
            {rotulos[i]}
          </small>
        </div>
      ))}
    </div>
  );
}

function Pilula({
  valor,
  maior,
  tipo,
}: {
  valor: number;
  maior: number;
  tipo: 'solida' | 'hachura';
}) {
  const zero = valor === 0;
  return (
    <span
      className={cn(
        'relative block min-h-1.5 w-[26px] rounded-full max-[760px]:w-2.5',
        zero && 'ring-border ring-1 ring-inset',
        !zero && tipo === 'solida' && 'bg-chart-serie',
        !zero &&
          tipo === 'hachura' &&
          'ring-chart-serie-muted bg-[repeating-linear-gradient(135deg,var(--chart-serie-muted)_0_2px,transparent_2px_7px)] ring-[1.5px] ring-inset',
      )}
      style={{ height: zero ? 6 : `${(valor / maior) * 100}%` }}
    >
      <em
        className={cn(
          'absolute bottom-[calc(100%+5px)] left-1/2 -translate-x-1/2 font-mono text-xs leading-none not-italic max-[760px]:hidden',
          zero && 'text-muted-foreground',
        )}
      >
        {valor}
      </em>
    </span>
  );
}

/** Indicador ao lado do gráfico: ícone, título (nome do grupo), valor e linha de apoio. */
function Indicador({
  icone,
  titulo,
  valor,
  apoio,
}: {
  icone: ReactNode;
  titulo: string;
  valor: string;
  apoio: ReactNode;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex items-start gap-3">
      {icone}
      <span className="flex min-w-0 flex-col gap-0.5">
        <h3 id={id} className="text-[13px] font-medium">
          {titulo}
        </h3>
        <b className="font-display text-[22px] leading-tight font-semibold">{valor}</b>
        <small className="text-muted-foreground text-[12.5px]">{apoio}</small>
      </span>
    </div>
  );
}

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn('grid size-9 shrink-0 place-items-center rounded-full', className)}
    >
      {children}
    </span>
  );
}

/** Barras por prioridade com "N · P%" (das que entraram ou dos pendentes agora). */
function Prioridades({ titulo, valores }: { titulo: string; valores: Record<Prioridade, number> }) {
  const id = useId();
  const total = PRIORIDADES.reduce((soma, p) => soma + valores[p], 0);
  const maior = Math.max(1, ...PRIORIDADES.map((p) => valores[p]));
  const percentual = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-2.5">
      <h3 id={id} className="text-[13px] font-medium">
        {titulo}
      </h3>
      {PRIORIDADES.map((p) => (
        <span key={p} className="grid grid-cols-[64px_1fr_64px] items-center gap-2 text-[12.5px]">
          <span>{ROTULO_PRIORIDADE[p]}</span>
          <span aria-hidden="true" className="bg-muted h-2.5 overflow-hidden rounded-full">
            <i
              className={cn('block h-full rounded-full', COR_TRILHA[p])}
              style={{ width: `${(valores[p] / maior) * 100}%` }}
            />
          </span>
          <span className="text-right font-mono tabular-nums">
            {valores[p]} · {percentual(valores[p])}%
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * "Entrada e saída" do painel de gestão (RF-04): se a fila cresce ou diminui no período.
 * Três blocos com a variação contra a janela anterior (7d e 30d), o gráfico de pares de
 * pílulas e, ao lado, tempo médio, a mais antiga na fila e a prioridade das que entraram.
 * Em Hoje não há gráfico nem comparação: entram os pendentes agora, por prioridade.
 */
export function EntradaSaida({
  dados,
  periodo,
  canto,
}: {
  dados: DadosEntradaSaida;
  periodo: PeriodoGestao;
  /** Canto do cabeçalho (o "atualizado há N s" no painel). */
  canto?: ReactNode;
}) {
  const idTitulo = useId();
  const hoje = periodo.valor === 'hoje';
  const janela = periodo.valor === '7d' ? 7 : periodo.valor === '30d' ? 30 : null;
  const anterior = !hoje && janela ? dados.anterior : null;
  const semMovimento = dados.entraram === 0 && dados.sairam === 0;
  const comGrafico = !hoje && !semMovimento && dados.serie.length > 0;
  const pendentes = PRIORIDADES.reduce((s, p) => s + dados.pendentesPorPrioridade[p], 0);

  return (
    <section
      aria-labelledby={idTitulo}
      className="bg-card rounded-card flex min-w-0 flex-col gap-4 p-5 max-[760px]:gap-3 max-[760px]:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id={idTitulo}
            className="font-display text-lg leading-[1.2] font-semibold tracking-[-0.02em]"
          >
            Entrada e saída
          </h2>
          <p className="text-muted-foreground text-[13px]">{subtitulo(periodo)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {comGrafico && (
            <div aria-hidden="true" className="flex items-center gap-4 text-[12.5px]">
              <span className="flex items-center gap-1.5">
                <Amostra tipo="solida" />
                Entraram
              </span>
              <span className="flex items-center gap-1.5">
                <Amostra tipo="hachura" />
                Saíram
              </span>
            </div>
          )}
          {canto}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 max-[760px]:gap-2">
        <Bloco
          rotulo="Entraram"
          amostra="solida"
          valor={String(dados.entraram)}
          selo={
            anterior && (
              <SeloVariacao atual={dados.entraram} anterior={anterior.entraram} janela={janela!} />
            )
          }
        />
        <Bloco
          rotulo={
            <>
              Saíram<span className="max-[760px]:hidden"> (decididas)</span>
            </>
          }
          amostra="hachura"
          valor={String(dados.sairam)}
          selo={
            anterior && (
              <SeloVariacao atual={dados.sairam} anterior={anterior.sairam} janela={janela!} />
            )
          }
          detalhe={`${dados.aprovadas} aprovadas · ${dados.rejeitadas} rejeitadas`}
        />
        <Bloco
          rotulo="Saldo da fila"
          valor={comSinal(dados.saldo)}
          selo={dados.saldo > 0 && <Selo tom="ambar">a fila cresceu</Selo>}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_290px] gap-6 max-[960px]:grid-cols-1 max-[760px]:gap-4">
        {hoje ? (
          <div className="bg-muted rounded-inner flex flex-col justify-center gap-1 p-5">
            <p className="font-display text-2xl font-semibold">Pendentes agora: {pendentes}</p>
            <p className="text-muted-foreground text-[13px]">
              Abertas e em análise neste momento. Em Hoje não há gráfico nem comparação.
            </p>
          </div>
        ) : comGrafico ? (
          <Grafico serie={dados.serie} periodo={periodo} />
        ) : (
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="bg-muted grid size-11 place-items-center rounded-full">
              <ChartColumn aria-hidden="true" className="size-[22px]" />
            </span>
            <b className="text-foreground font-medium">Sem movimento no período</b>
            <span className="text-[13px]">
              Nenhuma solicitação entrou na fila nem foi decidida nesse intervalo.
            </span>
          </div>
        )}

        <aside className="flex flex-col gap-4">
          <Indicador
            icone={
              <Chip className="bg-status-analise-bg text-status-analise-fg">
                <Clock className="size-[18px]" />
              </Chip>
            }
            titulo="Tempo médio até a decisão"
            valor={
              dados.tempoMedioDecisaoDias === null
                ? '—'
                : dias(Math.round(dados.tempoMedioDecisaoDias))
            }
            apoio={<ApoioTempo atual={dados.tempoMedioDecisaoDias} anterior={anterior} />}
          />
          <Indicador
            icone={
              <Chip className="bg-status-aberta-bg text-status-aberta-fg">
                <Inbox className="size-[18px]" />
              </Chip>
            }
            titulo="Mais antiga na fila"
            valor={
              dados.maisAntigaNaFila
                ? dias(diasDesde(dados.maisAntigaNaFila.desde, new Date(periodo.fim)))
                : '—'
            }
            apoio={
              dados.maisAntigaNaFila
                ? `${dados.maisAntigaNaFila.codigo} · ${dados.maisAntigaNaFila.area.nome}`
                : 'Nenhuma solicitação na fila'
            }
          />
          <div className="border-border border-t pt-3.5">
            {hoje ? (
              <Prioridades
                titulo="Pendentes agora, por prioridade"
                valores={dados.pendentesPorPrioridade}
              />
            ) : (
              <Prioridades
                titulo="Prioridade das que entraram"
                valores={dados.prioridadeEntraram}
              />
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function ApoioTempo({
  atual,
  anterior,
}: {
  atual: number | null;
  anterior: DadosEntradaSaida['anterior'];
}) {
  if (atual === null) return 'sem decisões no período';
  const antes = anterior?.tempoMedioDecisaoDias;
  if (antes === null || antes === undefined) return 'média das decisões do período';
  const texto = `${dias(Math.round(antes))} vs. antes`;
  return atual < antes ? <Selo tom="verde">{texto}</Selo> : texto;
}
