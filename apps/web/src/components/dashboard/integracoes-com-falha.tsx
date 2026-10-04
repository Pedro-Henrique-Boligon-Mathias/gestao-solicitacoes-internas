import { CircleAlert, CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { EstadoVazio } from '@/components/estado-vazio';
import { BotaoReprocessarIntegracao } from '@/components/solicitacoes/botao-reprocessar-integracao';
import { ROTULO_TIPO_INTEGRACAO } from '@/features/solicitacoes/rotulos';
import type { PainelGestao, TipoEventoIntegracao } from '@/features/solicitacoes/tipos';
import { TituloComTotal } from './partes';

type IntegracaoComFalha = PainelGestao['integracoesComFalha'][number];

/** Destino do botão "Ver integrações com falha" da Visão geral. */
export const ID_INTEGRACOES_COM_FALHA = 'integracoes-com-falha';

const formatoCurto = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "04/10 08:15" no fuso de São Paulo. */
function diaMesHora(iso: string): string {
  const p = Object.fromEntries(
    formatoCurto.formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

const rotuloTipo = (tipo: string) => ROTULO_TIPO_INTEGRACAO[tipo as TipoEventoIntegracao] ?? tipo;

/**
 * "Integrações com falha" do painel de gestão (ADR-010, RN-14/RN-17): eventos que esgotaram as
 * tentativas automáticas, com o último erro como chegou do sistema externo (em mono) e o
 * "Reprocessar" que já existe no detalhe (action + router.refresh).
 */
export function IntegracoesComFalha({ integracoes }: { integracoes: IntegracaoComFalha[] }) {
  const idTitulo = `${ID_INTEGRACOES_COM_FALHA}-titulo`;
  return (
    <section
      id={ID_INTEGRACOES_COM_FALHA}
      aria-labelledby={idTitulo}
      className="bg-card rounded-card flex min-w-0 scroll-mt-24 flex-col gap-3 p-5 max-[760px]:p-4"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="bg-status-rejeitada-bg text-status-rejeitada-fg grid size-9 shrink-0 place-items-center rounded-full"
        >
          <CircleAlert className="size-[18px]" />
        </span>
        <div>
          <TituloComTotal id={idTitulo} titulo="Integrações com falha" total={integracoes.length} />
          <p className="text-muted-foreground text-[13px]">
            Eventos que esgotaram as tentativas automáticas de envio ao sistema externo
          </p>
        </div>
      </div>

      {integracoes.length === 0 ? (
        <EstadoVazio Icone={CircleCheck} titulo="Nenhuma integração com falha" className="py-8">
          Todos os eventos foram entregues ao sistema externo ou ainda estão nas tentativas
          automáticas.
        </EstadoVazio>
      ) : (
        <ul className="flex flex-col">
          {integracoes.map((i) => (
            <LinhaFalha key={i.solicitacao.id} integracao={i} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LinhaFalha({ integracao: i }: { integracao: IntegracaoComFalha }) {
  const { solicitacao: s } = i;
  return (
    <li className="border-border grid grid-cols-[96px_minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_auto_auto] items-center gap-4 border-b py-3 last:border-b-0 max-[960px]:grid-cols-[minmax(0,1fr)_auto] max-[960px]:gap-x-3 max-[960px]:gap-y-1.5">
      <Link
        href={`/solicitacoes/${s.id}`}
        className="text-muted-foreground hover:text-foreground w-fit rounded-sm font-mono text-[12.5px] max-[960px]:col-span-2"
      >
        {s.codigo}
      </Link>
      <span className="flex min-w-0 flex-col max-[960px]:col-span-2">
        <b className="truncate font-medium">{s.titulo}</b>
        <small className="text-muted-foreground text-[12.5px]">
          {s.solicitante.nome} · {s.area.nome}
        </small>
      </span>
      <span className="flex flex-col text-sm max-[960px]:col-span-2 max-[960px]:flex-row max-[960px]:gap-1.5">
        {rotuloTipo(i.tipo)}
        <small className="text-muted-foreground text-[12.5px]">
          tentativa {i.tentativas} de {i.maxTentativas}
        </small>
      </span>
      <samp className="text-status-rejeitada-fg min-w-0 font-mono text-[12.5px] break-words max-[960px]:col-span-2">
        {i.ultimoErro ?? 'Sem mensagem de erro'}
      </samp>
      <span className="text-muted-foreground font-mono text-[12.5px] whitespace-nowrap">
        {i.ultimaTentativaEm ? (
          <time dateTime={i.ultimaTentativaEm}>{diaMesHora(i.ultimaTentativaEm)}</time>
        ) : (
          '—'
        )}
      </span>
      <BotaoReprocessarIntegracao id={s.id} />
    </li>
  );
}
