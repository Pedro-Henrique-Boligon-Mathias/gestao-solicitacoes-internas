'use client';

import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { verificarIntegridade } from '@/features/auditoria/actions';
import type { ResultadoIntegridade } from '@/features/auditoria/tipos';
import { cn } from '@/lib/utils';
import { ResultadoVerificacao } from './integridade-resultado';

const ID_TITULO = 'integridade-historico-titulo';

/**
 * "Integridade do histórico" do painel do Admin (RN-10, doc 16): o botão chama a Server Action
 * que recalcula a corrente de hashes no banco. Nada é chamado ao abrir o painel; o resultado
 * (íntegro, adulteração com a lista das divergências ou erro com requestId) é anunciado num
 * role="status".
 */
export function IntegridadeHistorico() {
  const [resultado, setResultado] = useState<ResultadoIntegridade | null>(null);
  const [verificando, setVerificando] = useState(false);
  const adulterado = resultado?.ok === true && !resultado.integridade.integro;
  const Icone = adulterado ? ShieldAlert : ShieldCheck;

  // Resultado e fim da espera na mesma renderização: o botão volta junto com o anúncio.
  async function verificar() {
    setVerificando(true);
    try {
      setResultado(await verificarIntegridade());
    } catch {
      setResultado({
        ok: false,
        erro: 'Não foi possível concluir agora. Tente de novo em instantes.',
      });
    } finally {
      setVerificando(false);
    }
  }

  return (
    <section
      aria-labelledby={ID_TITULO}
      className="bg-card rounded-card flex min-w-0 flex-col gap-4 p-5 max-[760px]:p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full',
            adulterado
              ? 'bg-status-rejeitada-bg text-status-rejeitada-fg'
              : 'bg-status-aprovada-bg text-status-aprovada-fg',
          )}
        >
          <Icone className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id={ID_TITULO}
            className="font-display text-lg leading-[1.2] font-semibold tracking-[-0.02em]"
          >
            Integridade do histórico
          </h2>
          <p className="text-muted-foreground text-[13px]">
            Confere se algum evento do histórico foi alterado, apagado ou inserido
          </p>
        </div>
        <Button
          variant="outline"
          disabled={verificando}
          onClick={verificar}
          className="max-[760px]:h-11 max-[760px]:w-full"
        >
          {verificando ? 'Verificando…' : 'Verificar integridade'}
        </Button>
      </div>

      <div role="status" className="min-w-0">
        {resultado ? (
          <ResultadoVerificacao resultado={resultado} />
        ) : (
          <p className="text-muted-foreground text-sm">
            Cada evento guarda um hash encadeado ao evento anterior da mesma solicitação. A
            verificação recalcula a corrente inteira e aponta qualquer evento alterado, apagado ou
            inserido direto no banco.
          </p>
        )}
      </div>
    </section>
  );
}
