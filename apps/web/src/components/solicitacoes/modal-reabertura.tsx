'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { reabrirSolicitacao } from '@/features/solicitacoes/actions';
import { ROTULO_STATUS } from '@/features/solicitacoes/rotulos';
import { reaberturaSchema } from '@/features/solicitacoes/schemas';
import type { Solicitacao } from '@/features/solicitacoes/tipos';

type DadosReabertura = z.output<typeof reaberturaSchema>;

/** Modal de reabertura (RN-16): aviso em âmbar e justificativa obrigatória. */
export function ModalReabertura({
  solicitacao,
  aberto,
  aoMudarAberto,
}: {
  solicitacao: Solicitacao;
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogContent className="gap-5">
        <FormularioReabertura solicitacao={solicitacao} aoMudarAberto={aoMudarAberto} />
      </DialogContent>
    </Dialog>
  );
}

function FormularioReabertura({
  solicitacao,
  aoMudarAberto,
}: {
  solicitacao: Solicitacao;
  aoMudarAberto: (aberto: boolean) => void;
}) {
  const router = useRouter();
  const id = useId();
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DadosReabertura>({
    resolver: zodResolver(reaberturaSchema),
    defaultValues: { justificativa: '' },
  });
  const justificativa = useWatch({ control, name: 'justificativa' }) ?? '';

  async function enviar(dados: DadosReabertura) {
    const retorno = await reabrirSolicitacao(solicitacao.id, dados);
    if (retorno.ok) {
      toast.success('Solicitação reaberta e de volta à fila');
      aoMudarAberto(false);
      router.refresh();
      return;
    }
    if (retorno.errosDeCampo?.justificativa) {
      setError('justificativa', { type: 'server', message: retorno.errosDeCampo.justificativa });
      return;
    }
    toast.error(retorno.erro, { duration: Infinity });
    aoMudarAberto(false);
    router.refresh();
  }

  const idErro = `${id}-erro`;
  const idAjuda = `${id}-ajuda`;

  return (
    <form noValidate onSubmit={handleSubmit(enviar)} className="flex flex-col gap-5">
      <DialogHeader>
        <span className="text-muted-foreground font-mono text-[12.5px]">
          {solicitacao.codigo} · {ROTULO_STATUS[solicitacao.status]}
        </span>
        <DialogTitle>Reabrir a solicitação</DialogTitle>
        <DialogDescription className="sr-only">{solicitacao.titulo}</DialogDescription>
      </DialogHeader>

      <div className="bg-warning-bg text-warning-fg rounded-inner flex items-start gap-3 px-4 py-3 text-sm">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 flex-none" />
        <p>
          A decisão atual será desfeita e a solicitação volta para a fila. A decisão continua
          registrada no histórico.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-justificativa`} className="text-[13px] leading-none font-medium">
          Justificativa
        </label>
        <Textarea
          id={`${id}-justificativa`}
          rows={4}
          maxLength={2200}
          aria-invalid={errors.justificativa ? true : undefined}
          aria-describedby={errors.justificativa ? idErro : idAjuda}
          {...register('justificativa')}
        />
        <div className="flex items-start justify-between gap-3 text-[12px]">
          {errors.justificativa ? (
            <p id={idErro} className="text-destructive">
              {errors.justificativa.message}
            </p>
          ) : (
            <p id={idAjuda} className="text-muted-foreground">
              Obrigatória, mínimo de 10 caracteres
            </p>
          )}
          <span aria-hidden="true" className="text-muted-foreground font-mono tabular-nums">
            {justificativa.trim().length}/2000
          </span>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => aoMudarAberto(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Reabrir solicitação
        </Button>
      </DialogFooter>
    </form>
  );
}
