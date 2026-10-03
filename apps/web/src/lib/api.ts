import { respostaProntidaoSchema, type RespostaProntidao } from '@solicitacoes/contracts';

export type SituacaoApi =
  { alcancavel: true; prontidao: RespostaProntidao } | { alcancavel: false; motivo: string };

// Chamada feita pelo servidor do Next. Dentro do Docker, API_URL aponta para o serviço "api".
function urlBaseApi(): string {
  return process.env.API_URL ?? 'http://localhost:3001';
}

export async function consultarProntidaoApi(timeoutMs = 3_000): Promise<SituacaoApi> {
  try {
    const resposta = await fetch(`${urlBaseApi()}/health/ready`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    // 503 também traz o corpo com o estado de cada componente
    const prontidao = respostaProntidaoSchema.safeParse(await resposta.json());
    if (!prontidao.success) {
      return { alcancavel: false, motivo: 'A API respondeu num formato inesperado.' };
    }
    return { alcancavel: true, prontidao: prontidao.data };
  } catch {
    return { alcancavel: false, motivo: 'Não foi possível conectar à API.' };
  }
}
