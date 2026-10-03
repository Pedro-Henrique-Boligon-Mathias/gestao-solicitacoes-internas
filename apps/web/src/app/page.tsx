import { connection } from 'next/server';
import { IndicadorStatus, type Estado } from '@/components/indicador-status';
import { consultarProntidaoApi } from '@/lib/api';

export default async function PaginaInicial() {
  // Renderiza a cada requisição: o estado da API não pode ficar congelado no build
  await connection();
  const situacao = await consultarProntidaoApi();

  const estadoApi: Estado = situacao.alcancavel ? 'ok' : 'falha';
  const banco = situacao.alcancavel ? situacao.prontidao.details.database?.status : undefined;
  const estadoBanco: Estado = banco === 'up' ? 'ok' : 'falha';

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-12">
      <p className="text-sm font-semibold tracking-wide text-marca-600 uppercase">
        Protótipo em construção
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Gestão de Solicitações Internas</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        Registro, análise e acompanhamento de solicitações internas, com indicadores da operação.
      </p>

      <section
        aria-labelledby="titulo-ambiente"
        className="mt-8 rounded-xl border border-zinc-200 bg-white px-5 py-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 id="titulo-ambiente" className="sr-only">
          Estado do ambiente
        </h2>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
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
    </main>
  );
}
