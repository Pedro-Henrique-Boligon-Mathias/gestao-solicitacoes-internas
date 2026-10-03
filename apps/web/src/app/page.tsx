import { connection } from 'next/server';
import { IndicadorStatus, type Estado } from '@/components/indicador-status';
import { consultarProntidaoApi } from '@/lib/api/saude';

export default async function PaginaInicial() {
  // Renderiza a cada requisição: o estado da API não pode ficar congelado no build
  await connection();
  const situacao = await consultarProntidaoApi();

  const estadoApi: Estado = situacao.alcancavel ? 'ok' : 'falha';
  const banco = situacao.alcancavel ? situacao.prontidao.details.database.status : undefined;
  const estadoBanco: Estado = banco === 'up' ? 'ok' : 'falha';

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-3 py-12 sm:px-4">
      <section className="bg-card rounded-card flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="bg-brand-orange flex size-8 items-center justify-center rounded-[11px]"
          >
            <span className="size-3 rounded-[3px] border-2 border-[#14213D]" />
          </span>
          <span className="font-display text-[15px] font-semibold">Solicitações</span>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground font-mono text-xs font-medium tracking-wider uppercase">
            Protótipo em construção
          </p>
          <h1 className="font-display text-2xl leading-tight font-semibold tracking-[-0.03em] sm:text-3xl">
            Gestão de Solicitações Internas
          </h1>
          <p className="text-muted-foreground text-[15px] leading-relaxed">
            Registro, análise e acompanhamento de solicitações internas, com indicadores da
            operação.
          </p>
        </div>

        <section aria-labelledby="titulo-ambiente" className="flex flex-col gap-1">
          <h2
            id="titulo-ambiente"
            className="font-display text-lg leading-tight font-semibold tracking-[-0.02em]"
          >
            Estado do ambiente
          </h2>
          <ul className="divide-border divide-y">
            <IndicadorStatus componente="Aplicação web" estado="ok" />
            <IndicadorStatus
              componente="API"
              estado={estadoApi}
              {...(situacao.alcancavel ? {} : { detalhe: situacao.motivo })}
            />
            <IndicadorStatus
              componente="Banco de dados"
              estado={estadoBanco}
              {...(estadoBanco === 'falha'
                ? {
                    detalhe: situacao.alcancavel
                      ? 'A API não alcança o banco.'
                      : 'Sem resposta da API.',
                  }
                : {})}
            />
          </ul>
        </section>
      </section>
    </main>
  );
}
