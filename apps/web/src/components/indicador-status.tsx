export type Estado = 'ok' | 'falha';

const ESTILOS: Record<Estado, { ponto: string; texto: string; rotulo: string }> = {
  ok: {
    ponto: 'bg-emerald-500',
    texto: 'text-emerald-700 dark:text-emerald-400',
    rotulo: 'Operando',
  },
  falha: { ponto: 'bg-red-500', texto: 'text-red-700 dark:text-red-400', rotulo: 'Indisponível' },
};

export function IndicadorStatus({
  componente,
  estado,
  detalhe,
}: {
  componente: string;
  estado: Estado;
  detalhe?: string;
}) {
  const estilo = ESTILOS[estado];
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="font-medium">{componente}</p>
        {detalhe ? <p className="text-sm text-zinc-500 dark:text-zinc-400">{detalhe}</p> : null}
      </div>
      <span className={`flex shrink-0 items-center gap-2 text-sm font-medium ${estilo.texto}`}>
        <span aria-hidden="true" className={`size-2.5 rounded-full ${estilo.ponto}`} />
        {estilo.rotulo}
      </span>
    </li>
  );
}
