'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { UsuarioAtual } from '@/features/auth/usuario';
import { acoesDaBarra } from '@/features/solicitacoes/acoes';
import { excluirSolicitacao, iniciarAnalise } from '@/features/solicitacoes/actions';
import type { ResultadoDecisao, Solicitacao } from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';
import { ModalDecisao } from './modal-decisao';
import { ModalFormularioSolicitacao } from './modal-formulario-solicitacao';
import { ModalReabertura } from './modal-reabertura';

type Modal = 'editar' | 'excluir' | 'decidir' | 'reabrir' | null;

/**
 * Ações do detalhe. Só aparecem os botões que vierem em `acoesPermitidas` (a API decide); o
 * reprocessamento da integração fica no bloco Integração.
 * À direita do título no desktop; abaixo de 760px, numa barra fixa no rodapé.
 */
export function AcoesSolicitacao({
  solicitacao,
  usuario,
  className,
}: {
  solicitacao: Solicitacao;
  usuario: UsuarioAtual;
  className?: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);
  const [resultadoInicial, setResultadoInicial] = useState<ResultadoDecisao>();
  const [iniciando, iniciarTransicao] = useTransition();
  const [excluindo, excluirTransicao] = useTransition();
  const acoes = acoesDaBarra(solicitacao);
  const pode = (acao: Solicitacao['acoesPermitidas'][number]) => acoes.includes(acao);

  if (acoes.length === 0) return null;

  const fecharSe = (aberto: boolean) => {
    if (!aberto) setModal(null);
  };

  function iniciar() {
    iniciarTransicao(async () => {
      const resultado = await iniciarAnalise(solicitacao.id);
      if (resultado.ok) toast.success('Análise iniciada');
      else toast.error(resultado.erro, { duration: Infinity });
      router.refresh();
    });
  }

  function excluir() {
    excluirTransicao(async () => {
      const resultado = await excluirSolicitacao(solicitacao.id);
      setModal(null);
      if (resultado.ok) {
        toast.success(`Solicitação ${solicitacao.codigo} excluída`);
        router.push('/solicitacoes');
      } else {
        toast.error(resultado.erro, { duration: Infinity });
        router.refresh();
      }
    });
  }

  function decidir(resultado: ResultadoDecisao) {
    setResultadoInicial(resultado);
    setModal('decidir');
  }

  return (
    <>
      <div
        className={cn(
          'flex flex-wrap items-center justify-end gap-2.5',
          'max-[760px]:bg-card max-[760px]:fixed max-[760px]:inset-x-2.5 max-[760px]:bottom-2.5 max-[760px]:z-40 max-[760px]:flex-nowrap max-[760px]:rounded-card max-[760px]:p-2.5 max-[760px]:shadow-[0_10px_30px_rgb(14_22_38/18%)] max-[760px]:[&>*]:h-11',
          className,
        )}
      >
        {pode('EXCLUIR') && (
          <Button variant="ghost" onClick={() => setModal('excluir')}>
            Excluir
          </Button>
        )}
        {pode('EDITAR') && (
          <Button variant="outline" onClick={() => setModal('editar')}>
            Editar
          </Button>
        )}
        {pode('INICIAR_ANALISE') && (
          <Button onClick={iniciar} disabled={iniciando}>
            Iniciar análise
          </Button>
        )}
        {pode('DECIDIR') && (
          <>
            <Button variant="outline" onClick={() => decidir('REJEITADA')}>
              Rejeitar
            </Button>
            <Button onClick={() => decidir('APROVADA')}>Aprovar</Button>
          </>
        )}
        {pode('REABRIR') && (
          <Button variant="outline" onClick={() => setModal('reabrir')}>
            Reabrir
          </Button>
        )}
      </div>

      {pode('EDITAR') && (
        <ModalFormularioSolicitacao
          usuario={usuario}
          solicitacao={solicitacao}
          aberto={modal === 'editar'}
          aoMudarAberto={fecharSe}
        />
      )}
      {pode('EXCLUIR') && (
        <Dialog open={modal === 'excluir'} onOpenChange={fecharSe}>
          <DialogContent className="max-w-[440px] gap-5" comFechar={false}>
            <DialogHeader className="pr-0">
              <DialogTitle className="text-xl">Excluir {solicitacao.codigo}?</DialogTitle>
              <DialogDescription>
                Esta solicitação deixará de aparecer nas listas e indicadores.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={excluir} disabled={excluindo}>
                Excluir solicitação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {pode('DECIDIR') && (
        <ModalDecisao
          solicitacao={solicitacao}
          aberto={modal === 'decidir'}
          aoMudarAberto={fecharSe}
          resultadoInicial={resultadoInicial}
        />
      )}
      {pode('REABRIR') && (
        <ModalReabertura
          solicitacao={solicitacao}
          aberto={modal === 'reabrir'}
          aoMudarAberto={fecharSe}
        />
      )}
    </>
  );
}
