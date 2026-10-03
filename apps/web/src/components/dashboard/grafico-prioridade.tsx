'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { COR_PRIORIDADE, IconePrioridade } from '@/components/solicitacoes/selo-prioridade';
import { ROTULO_PRIORIDADE } from '@/features/solicitacoes/rotulos';
import type { Prioridade, ResumoDashboard } from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';

const ORDEM: Prioridade[] = ['ALTA', 'MEDIA', 'BAIXA'];
const TOKEN: Record<Prioridade, string> = { ALTA: 'alta', MEDIA: 'media', BAIXA: 'baixa' };

type Ponto = { prioridade: Prioridade; valor: number; selecionada: boolean };

/**
 * Distribuição por prioridade. A barra mais alta é sólida e as outras em hachura (tokens
 * --chart-*). Valores e links ficam em HTML embaixo do gráfico, que é só ilustração.
 */
export function GraficoPrioridade({ resumo }: { resumo: ResumoDashboard }) {
  const router = useRouter();
  const maior = Math.max(...ORDEM.map((p) => resumo.porPrioridade[p]));
  const dados: Ponto[] = ORDEM.map((prioridade) => ({
    prioridade,
    valor: resumo.porPrioridade[prioridade],
    selecionada: maior > 0 && resumo.porPrioridade[prioridade] === maior,
  }));
  const percentual = (valor: number) =>
    resumo.total > 0 ? Math.round((valor / resumo.total) * 100) : 0;
  const destino = (p: Prioridade) => `/solicitacoes?prioridade=${p}`;

  return (
    <div className="flex flex-col gap-1">
      <p className="sr-only">
        Distribuição por prioridade:{' '}
        {dados.map((d) => `${ROTULO_PRIORIDADE[d.prioridade]} ${d.valor}`).join(', ')}.
      </p>
      <div aria-hidden="true" className="h-[220px] w-full">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 360, height: 220 }}
        >
          <BarChart
            data={dados}
            margin={{ top: 34, right: 8, bottom: 0, left: 8 }}
            barCategoryGap="28%"
          >
            <defs>
              {ORDEM.map((p) => (
                <pattern
                  key={p}
                  id={`hachura-${TOKEN[p]}`}
                  patternUnits="userSpaceOnUse"
                  width="7"
                  height="7"
                  patternTransform="rotate(45)"
                >
                  <rect width="7" height="7" fill="var(--card)" />
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="7"
                    stroke={`var(--chart-${TOKEN[p]}-muted)`}
                    strokeWidth="3"
                  />
                </pattern>
              ))}
            </defs>
            <XAxis dataKey="prioridade" hide />
            <YAxis hide domain={[0, (max: number) => Math.max(max, 1)]} />
            <Bar
              dataKey="valor"
              radius={999}
              maxBarSize={76}
              minPointSize={6}
              isAnimationActive={false}
              cursor="pointer"
              onClick={(ponto) => {
                const prioridade = (ponto as { payload?: Ponto }).payload?.prioridade;
                if (prioridade) router.push(destino(prioridade));
              }}
            >
              {dados.map((d) => (
                <Cell
                  key={d.prioridade}
                  fill={
                    d.selecionada
                      ? `var(--chart-${TOKEN[d.prioridade]})`
                      : `url(#hachura-${TOKEN[d.prioridade]})`
                  }
                  stroke={d.selecionada ? 'none' : `var(--chart-${TOKEN[d.prioridade]}-muted)`}
                  strokeWidth={1.5}
                />
              ))}
              <LabelList
                dataKey="valor"
                content={({ x, y, width, index }) => {
                  const ponto = typeof index === 'number' ? dados[index] : undefined;
                  if (!ponto?.selecionada) return null;
                  const centro = Number(x) + Number(width) / 2;
                  const texto = `${ponto.valor} · ${percentual(ponto.valor)}%`;
                  const largura = texto.length * 7 + 18;
                  return (
                    <g>
                      <rect
                        x={centro - largura / 2}
                        y={Number(y) - 30}
                        width={largura}
                        height={22}
                        rx={11}
                        fill="var(--brand-orange)"
                      />
                      <text
                        x={centro}
                        y={Number(y) - 15}
                        textAnchor="middle"
                        fontSize={12}
                        fontFamily="var(--font-mono)"
                        fill="#14213D"
                      >
                        {texto}
                      </text>
                    </g>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid grid-cols-3 gap-2 px-2">
        {dados.map((d) => (
          <li key={d.prioridade} className="flex justify-center">
            <Link
              href={destino(d.prioridade)}
              className="rounded-field hover:bg-muted focus-visible:outline-ring flex flex-col items-center gap-1.5 px-3 py-1.5 outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span
                className={cn(
                  'rounded-pill inline-flex h-6 items-center gap-1.5 px-2.5 text-xs font-medium shadow-[inset_0_0_0_1px_currentColor]',
                  COR_PRIORIDADE[d.prioridade],
                )}
              >
                <IconePrioridade prioridade={d.prioridade} />
                {ROTULO_PRIORIDADE[d.prioridade]}
              </span>
              <span className="font-mono text-[13px] tabular-nums">{d.valor}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
