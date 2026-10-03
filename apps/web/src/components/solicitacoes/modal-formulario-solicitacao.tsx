'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { UsuarioAtual } from '@/features/auth/usuario';
import type { Solicitacao } from '@/features/solicitacoes/tipos';
import { FormularioSolicitacao } from './formulario-solicitacao';

/** Modal de 680px com o formulário de criação ou de edição. */
export function ModalFormularioSolicitacao({
  usuario,
  solicitacao,
  aberto,
  aoMudarAberto,
}: {
  usuario: UsuarioAtual;
  solicitacao?: Solicitacao;
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogContent className="max-w-[680px] gap-6">
        <DialogHeader>
          <DialogTitle>{solicitacao ? 'Editar solicitação' : 'Nova solicitação'}</DialogTitle>
          <DialogDescription>
            {solicitacao
              ? `${solicitacao.codigo} · as alterações ficam registradas no histórico.`
              : 'Descreva o que você precisa. Um analista vai assumir a análise.'}
          </DialogDescription>
        </DialogHeader>
        <FormularioSolicitacao
          usuario={usuario}
          solicitacao={solicitacao}
          aoConcluir={() => aoMudarAberto(false)}
          aoCancelar={() => aoMudarAberto(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
