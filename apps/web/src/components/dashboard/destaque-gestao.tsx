import Link from 'next/link';
import type { ReactNode } from 'react';
import { EsqueletoBotaoDestaque } from '@/components/esqueletos';
import { Button } from '@/components/ui/button';
import type { Consulta } from '@/features/solicitacoes/consultas';
import { diasDesde } from '@/features/solicitacoes/datas';
import type { PainelGestao, ResumoDashboard } from '@/features/solicitacoes/tipos';
import { ID_INTEGRACOES_COM_FALHA } from './integracoes-com-falha';
import { URL_FILA } from './partes';

type PromessaGestao = Promise<Consulta<PainelGestao>>;

function Fato({ valor, children }: { valor: string | number; children: ReactNode }) {
  return (
    <li className="flex items-baseline gap-2">
      <b className="text-hero-foreground font-mono font-medium tabular-nums">{valor}</b>{' '}
      <span>{children}</span>
    </li>
  );
}

/** Fatos e botão da Visão geral do admin; `falhas` null = painel ainda carregando ou com erro. */
function Conteudo({
  resumo,
  falhas,
  botao,
}: {
  resumo: ResumoDashboard;
  falhas: number | null;
  botao: ReactNode;
}) {
  return (
    <>
      <ul className="text-hero-muted flex flex-col gap-1.5 text-sm">
        {falhas !== null && falhas > 0 && (
          <Fato valor={falhas}>
            {falhas === 1 ? 'integração com falha' : 'integrações com falha'} esperando
            reprocessamento
          </Fato>
        )}
        {resumo.aberturaMaisAntiga && (
          <Fato valor={`${diasDesde(resumo.aberturaMaisAntiga)}d`}>
            é a espera da mais antiga da fila
          </Fato>
        )}
      </ul>
      <div className="mt-auto flex flex-wrap gap-2.5 max-[760px]:[&>*]:h-11">{botao}</div>
    </>
  );
}

const verFila = (
  <Button variant="hero" asChild>
    <Link href={URL_FILA}>Ver a fila</Link>
  </Button>
);

/**
 * Visão geral do admin (RF-04): "N integrações com falha" vem do painel de gestão. Com falha, o
 * botão laranja rola até o bloco das falhas; sem falha (ou sem o painel), vira "Ver a fila".
 */
export async function DestaqueGestao({
  resumo,
  gestao,
}: {
  resumo: ResumoDashboard;
  gestao: PromessaGestao;
}) {
  const consulta = await gestao;
  const falhas = consulta.ok ? consulta.dados.integracoesComFalha.length : null;
  const botao =
    falhas !== null && falhas > 0 ? (
      <Button variant="orange" asChild>
        <a href={`#${ID_INTEGRACOES_COM_FALHA}`}>Ver integrações com falha</a>
      </Button>
    ) : (
      verFila
    );
  return <Conteudo resumo={resumo} falhas={falhas} botao={botao} />;
}

/** Enquanto o painel carrega: só o fato do resumo e o esqueleto do botão. */
export function DestaqueGestaoCarregando({ resumo }: { resumo: ResumoDashboard }) {
  return <Conteudo resumo={resumo} falhas={null} botao={<EsqueletoBotaoDestaque />} />;
}
