'use client';

import { Plus } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import type { UsuarioAtual } from '@/features/auth/usuario';
import { ModalFormularioSolicitacao } from './modal-formulario-solicitacao';

/** Botão que abre o modal de nova solicitação. */
export function BotaoNovaSolicitacao({
  usuario,
  rotulo = 'Nova solicitação',
  className,
  variant,
}: {
  usuario: UsuarioAtual;
  rotulo?: string;
  className?: string;
  variant?: ComponentProps<typeof Button>['variant'];
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button className={className} variant={variant} onClick={() => setAberto(true)}>
        <Plus aria-hidden="true" />
        {rotulo}
      </Button>
      <ModalFormularioSolicitacao usuario={usuario} aberto={aberto} aoMudarAberto={setAberto} />
    </>
  );
}
