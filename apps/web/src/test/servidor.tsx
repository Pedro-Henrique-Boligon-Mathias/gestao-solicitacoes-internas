/**
 * Renderiza no jsdom uma árvore com Server Components assíncronos (páginas e blocos com
 * `async function`), que o React do cliente não sabe renderizar.
 *
 * Antes do render, cada componente assíncrono encontrado na árvore é chamado e trocado pelo que
 * ele devolve. Se a promessa dele ainda não resolveu depois de um tique (consulta pendente), ele é
 * trocado por um componente que suspende para sempre: o <Suspense> mais próximo mostra o fallback,
 * como no streaming do servidor. Irmãos são resolvidos ao mesmo tempo, então um bloco pendente não
 * segura os outros.
 *
 * Limite: o componente assíncrono precisa aparecer na árvore JSX (como filho ou prop de outro
 * elemento, inclusive dentro do que outro componente assíncrono devolve). Um componente síncrono
 * que renderiza internamente um assíncrono não é alcançado.
 *
 * Só para testes: nada aqui é importado pelo código de produção.
 */
import { act, render, type RenderResult } from '@testing-library/react';
import {
  Fragment,
  cloneElement,
  isValidElement,
  use,
  type ReactElement,
  type ReactNode,
} from 'react';

const NUNCA = new Promise<never>(() => undefined);

/** Ocupa o lugar de um componente cuja consulta não terminou: suspende até o fim do teste. */
function Pendente(): never {
  return use(NUNCA);
}

const PENDENTE = Symbol('pendente');
const umTique = () =>
  new Promise<typeof PENDENTE>((resolver) => setTimeout(() => resolver(PENDENTE), 0));

type ComponenteAssincrono = (props: unknown) => Promise<ReactNode>;

function ehAssincrono(tipo: unknown): tipo is ComponenteAssincrono {
  return typeof tipo === 'function' && tipo.constructor.name === 'AsyncFunction';
}

async function resolver(no: unknown): Promise<unknown> {
  if (Array.isArray(no)) return Promise.all(no.map(resolver));
  if (!isValidElement(no)) return no;

  const elemento = no as ReactElement<Record<string, unknown>>;
  if (ehAssincrono(elemento.type)) {
    const saida = elemento.type(elemento.props);
    // Se rejeitar depois do tique, o teste já seguiu: evita a rejeição não tratada
    saida.catch(() => undefined);
    const resultado = await Promise.race([saida, umTique()]);
    if (resultado === PENDENTE) return <Pendente key={elemento.key} />;
    return <Fragment key={elemento.key}>{(await resolver(resultado)) as ReactNode}</Fragment>;
  }

  const novasProps: Record<string, unknown> = {};
  let mudou = false;
  await Promise.all(
    Object.entries(elemento.props).map(async ([chave, valor]) => {
      if (isValidElement(valor) || Array.isArray(valor)) {
        novasProps[chave] = await resolver(valor);
        mudou = true;
      }
    }),
  );
  if (!mudou) return elemento;
  // Filhos em lista voltam como argumentos, como no JSX: assim o React não pede `key` para eles
  const { children: filhos, ...outras } = novasProps;
  if (Array.isArray(filhos)) return cloneElement(elemento, outras, ...(filhos as ReactNode[]));
  return cloneElement(elemento, novasProps);
}

/** Resolve os componentes assíncronos e renderiza o resultado com o Testing Library. */
export async function renderizarServidor(arvore: ReactNode): Promise<RenderResult> {
  const resolvida = (await resolver(arvore)) as ReactNode;
  let resultado: RenderResult | undefined;
  await act(async () => {
    resultado = render(<>{resolvida}</>);
  });
  return resultado!;
}
