'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck, CircleX } from 'lucide-react';
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
import { decidirSolicitacao } from '@/features/solicitacoes/actions';
import { decisaoSchema } from '@/features/solicitacoes/schemas';
import type { ResultadoDecisao, Solicitacao } from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';
import { CodigoSolicitacao } from './codigo-solicitacao';

type EntradaDecisao = z.input<typeof decisaoSchema>;
type DadosDecisao = z.output<typeof decisaoSchema>;

const OPCOES = [
  { valor: 'APROVADA', rotulo: 'Aprovar', Icone: CircleCheck, cor: 'text-status-aprovada-fg' },
  { valor: 'REJEITADA', rotulo: 'Rejeitar', Icone: CircleX, cor: 'text-status-rejeitada-fg' },
] as const;

/** Modal de 560px: escolha entre Aprovar e Rejeitar e comentário obrigatório (RN-06). */
export function ModalDecisao({
  solicitacao,
  aberto,
  aoMudarAberto,
  resultadoInicial,
}: {
  solicitacao: Solicitacao;
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  resultadoInicial?: ResultadoDecisao;
}) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogContent className="gap-5">
        {/* O formulário só existe com o modal aberto: cada abertura começa do zero */}
        <FormularioDecisao
          solicitacao={solicitacao}
          aoMudarAberto={aoMudarAberto}
          resultadoInicial={resultadoInicial}
        />
      </DialogContent>
    </Dialog>
  );
}

function FormularioDecisao({
  solicitacao,
  aoMudarAberto,
  resultadoInicial,
}: {
  solicitacao: Solicitacao;
  aoMudarAberto: (aberto: boolean) => void;
  resultadoInicial?: ResultadoDecisao;
}) {
  const router = useRouter();
  const id = useId();
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EntradaDecisao, unknown, DadosDecisao>({
    resolver: zodResolver(decisaoSchema),
    defaultValues: { resultado: resultadoInicial, comentario: '' },
  });
  const resultado = useWatch({ control, name: 'resultado' });
  const comentario = useWatch({ control, name: 'comentario' }) ?? '';

  async function enviar(dados: DadosDecisao) {
    const retorno = await decidirSolicitacao(solicitacao.id, dados);
    if (retorno.ok) {
      toast.success(
        dados.resultado === 'APROVADA' ? 'Solicitação aprovada' : 'Solicitação rejeitada',
      );
      aoMudarAberto(false);
      router.refresh();
      return;
    }
    if (retorno.errosDeCampo?.comentario) {
      setError('comentario', { type: 'server', message: retorno.errosDeCampo.comentario });
      return;
    }
    toast.error(retorno.erro, { duration: Infinity });
    aoMudarAberto(false);
    router.refresh();
  }

  const idErro = `${id}-erro`;
  const idAjuda = `${id}-ajuda`;
  const idErroResultado = `${id}-resultado-erro`;
  const rotuloConfirmar =
    resultado === 'APROVADA'
      ? 'Confirmar aprovação'
      : resultado === 'REJEITADA'
        ? 'Confirmar rejeição'
        : 'Confirmar decisão';

  return (
    <form noValidate onSubmit={handleSubmit(enviar)} className="flex flex-col gap-5">
      <DialogHeader>
        <CodigoSolicitacao codigo={solicitacao.codigo} />
        <DialogTitle>Decidir a solicitação</DialogTitle>
        <DialogDescription>{solicitacao.titulo}</DialogDescription>
      </DialogHeader>

      <fieldset
        className="flex flex-col gap-2"
        aria-invalid={errors.resultado ? true : undefined}
        aria-describedby={errors.resultado ? idErroResultado : undefined}
        aria-errormessage={errors.resultado ? idErroResultado : undefined}
      >
        <legend className="mb-2 text-[13px] leading-none font-medium">Decisão</legend>
        <div className="grid grid-cols-2 gap-2.5">
          {OPCOES.map(({ valor, rotulo, Icone, cor }) => (
            <label
              key={valor}
              className={cn(
                'rounded-inner flex h-[52px] cursor-pointer items-center gap-3 px-4 font-semibold shadow-[inset_0_0_0_1px_var(--border)] transition-[background-color,box-shadow] duration-150',
                'has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
                resultado === valor
                  ? 'bg-accent shadow-[inset_0_0_0_2px_var(--primary)]'
                  : 'hover:bg-muted',
              )}
            >
              <input
                type="radio"
                value={valor}
                className="accent-primary size-4 cursor-pointer"
                {...register('resultado')}
              />
              <Icone aria-hidden="true" className={cn('size-4', cor)} strokeWidth={1.8} />
              {rotulo}
            </label>
          ))}
        </div>
        {errors.resultado && (
          <p id={idErroResultado} className="text-destructive text-[12.5px]">
            {errors.resultado.message}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-comentario`} className="text-[13px] leading-none font-medium">
          Comentário
        </label>
        <Textarea
          id={`${id}-comentario`}
          rows={4}
          maxLength={2200}
          aria-invalid={errors.comentario ? true : undefined}
          aria-describedby={errors.comentario ? idErro : idAjuda}
          {...register('comentario')}
        />
        <div className="flex items-start justify-between gap-3 text-[12px]">
          {errors.comentario ? (
            <p id={idErro} className="text-destructive">
              {errors.comentario.message}
            </p>
          ) : (
            <p id={idAjuda} className="text-muted-foreground">
              Obrigatório, mínimo de 10 caracteres
            </p>
          )}
          <span aria-hidden="true" className="text-muted-foreground font-mono tabular-nums">
            {comentario.trim().length}/2000
          </span>
        </div>
        <p className="text-muted-foreground text-[13px]">
          O comentário fica no histórico e o solicitante vê a decisão no detalhe.
        </p>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => aoMudarAberto(false)}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          variant={resultado === 'REJEITADA' ? 'destructive' : 'primary'}
        >
          {rotuloConfirmar}
        </Button>
      </DialogFooter>
    </form>
  );
}
