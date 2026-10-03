/**
 * Utilitários de teste para componentes com Radix (modais, menus) no jsdom.
 * Só para testes: nada aqui é importado pelo código de produção.
 */
import { expect, vi } from 'vitest';

/** APIs de layout que o jsdom não implementa e que modais, menus e gráficos usam. */
export function prepararDom(): void {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

/**
 * O jsdom não tem layout: todo elemento mede 0×0 e o ResponsiveContainer do Recharts avisa
 * "width(0) and height(0)". Dá ao container do gráfico o tamanho que ele teria na tela.
 * Os outros elementos continuam com a medida do jsdom. Devolve a função que desfaz.
 */
export function darTamanhoAosGraficos(largura = 360, altura = 220): () => void {
  const original = HTMLElement.prototype.getBoundingClientRect;
  const espiao = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains('recharts-responsive-container')) return original.call(this);
      return DOMRect.fromRect({ x: 0, y: 0, width: largura, height: altura });
    });
  return () => espiao.mockRestore();
}

/**
 * Silencia só o console.error cuja mensagem contém o trecho informado (um aviso conhecido de
 * biblioteca). Qualquer outra mensagem continua saindo normalmente. Devolve a função que desfaz.
 */
export function ignorarConsoleError(trecho: string): () => void {
  const original = console.error.bind(console);
  const espiao = vi.spyOn(console, 'error').mockImplementation((...argumentos: unknown[]) => {
    if (argumentos.some((a) => typeof a === 'string' && a.includes(trecho))) return;
    original(...argumentos);
  });
  return () => espiao.mockRestore();
}

/** Caminho e parâmetros de um href ou de um destino de navegação (relativo ou com "?"). */
export function lerUrl(destino: string): { caminho: string; params: URLSearchParams } {
  const url = new URL(destino, 'http://localhost/solicitacoes');
  return { caminho: url.pathname, params: url.searchParams };
}

/** Os parâmetros como objeto comparável: valores repetidos viram lista, em ordem alfabética. */
export function paramsComoObjeto(params: URLSearchParams): Record<string, string | string[]> {
  const resultado: Record<string, string | string[]> = {};
  for (const chave of [...new Set(params.keys())].sort()) {
    const valores = params.getAll(chave);
    resultado[chave] = valores.length === 1 ? valores[0]! : [...valores].sort();
  }
  return resultado;
}

/** Confere que o href aponta para o caminho com exatamente esses parâmetros, em qualquer ordem. */
export function esperarHref(
  elemento: Element | null | undefined,
  caminho: string,
  params: Record<string, string | string[]> = {},
): void {
  expect(elemento, `link para ${caminho}`).toBeTruthy();
  const href = elemento!.getAttribute('href') ?? '';
  const lido = lerUrl(href);
  expect(lido.caminho).toBe(caminho);
  const ordenado = Object.fromEntries(
    Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v]),
  );
  expect(paramsComoObjeto(lido.params)).toEqual(ordenado);
}

/** Primeiro link do container cujo href tem esse caminho e esses parâmetros. */
export function linkPara(
  container: ParentNode,
  caminho: string,
  params: Record<string, string> = {},
): HTMLAnchorElement | undefined {
  return [...container.querySelectorAll('a')].find((a) => {
    const { caminho: c, params: p } = lerUrl(a.getAttribute('href') ?? '');
    if (c !== caminho) return false;
    const obj = paramsComoObjeto(p);
    return (
      Object.keys(obj).length === Object.keys(params).length &&
      Object.entries(params).every(([k, v]) => obj[k] === v)
    );
  });
}

/** Primeiro argumento de cada chamada de um mock (ex.: o texto passado a toast.success). */
export function mensagens(funcao: { mock: { calls: unknown[][] } }): unknown[] {
  return funcao.mock.calls.map((chamada) => chamada[0]);
}
