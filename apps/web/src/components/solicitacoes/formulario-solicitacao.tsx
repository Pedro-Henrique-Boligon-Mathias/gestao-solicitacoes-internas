'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { UsuarioAtual } from '@/features/auth/usuario';
import { criarSolicitacao, editarSolicitacao } from '@/features/solicitacoes/actions';
import { formatarData } from '@/features/solicitacoes/datas';
import { EXPLICACAO_PRIORIDADE, ROTULO_PRIORIDADE } from '@/features/solicitacoes/rotulos';
import {
  solicitacaoSchema,
  type DadosSolicitacao,
  type EntradaSolicitacao,
} from '@/features/solicitacoes/schemas';
import type { Prioridade, Solicitacao } from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';
import { COR_PRIORIDADE, IconePrioridade } from './selo-prioridade';

const ORDEM_PRIORIDADES: Prioridade[] = ['BAIXA', 'MEDIA', 'ALTA'];
const CAMPOS = ['titulo', 'descricao', 'prioridade'] as const;
const MENSAGEM_CONFLITO =
  'Alguém alterou esta solicitação antes. Recarregue para ver a versão atual.';

type Aviso = { tipo: 'erro'; mensagem: string } | { tipo: 'conflito' };

/**
 * Criação e edição de solicitação (react-hook-form + zod só para UX; a API é a autoridade).
 * Erros de campo da API aparecem no campo; o erro geral, no aviso do topo.
 */
export function FormularioSolicitacao({
  usuario,
  solicitacao,
  aoConcluir,
  aoCancelar,
}: {
  usuario: UsuarioAtual;
  solicitacao?: Solicitacao;
  aoConcluir?: () => void;
  aoCancelar?: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const edicao = solicitacao !== undefined;

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EntradaSolicitacao, unknown, DadosSolicitacao>({
    resolver: zodResolver(solicitacaoSchema),
    defaultValues: {
      titulo: solicitacao?.titulo ?? '',
      descricao: solicitacao?.descricao ?? '',
      prioridade: solicitacao?.prioridade ?? 'MEDIA',
    },
  });

  const titulo = useWatch({ control, name: 'titulo' }) ?? '';
  const descricao = useWatch({ control, name: 'descricao' }) ?? '';
  const prioridade = useWatch({ control, name: 'prioridade' });

  async function enviar(dados: DadosSolicitacao) {
    setAviso(null);
    const resultado = solicitacao
      ? await editarSolicitacao(solicitacao.id, { ...dados, versao: solicitacao.versao })
      : await criarSolicitacao(dados);

    if (resultado.ok) {
      if (edicao) {
        toast.success('Alterações salvas');
        aoConcluir?.();
        router.refresh();
      } else {
        toast.success(`Solicitação ${resultado.solicitacao.codigo} criada`);
        aoConcluir?.();
        router.push(`/solicitacoes/${resultado.solicitacao.id}`);
      }
      return;
    }

    if (resultado.code === 'CONFLITO_DE_VERSAO') {
      setAviso({ tipo: 'conflito' });
      return;
    }
    for (const [campo, mensagem] of Object.entries(resultado.errosDeCampo ?? {})) {
      const nome = CAMPOS.find((c) => c === campo);
      if (nome) setError(nome, { type: 'server', message: mensagem });
    }
    setAviso({ tipo: 'erro', mensagem: resultado.erro });
  }

  const idErroTitulo = `${id}-titulo-erro`;
  const idAjudaTitulo = `${id}-titulo-ajuda`;
  const idErroDescricao = `${id}-descricao-erro`;
  const idAjudaDescricao = `${id}-descricao-ajuda`;
  const idErroPrioridade = `${id}-prioridade-erro`;

  return (
    <form noValidate onSubmit={handleSubmit(enviar)} className="flex flex-col gap-5">
      {aviso && (
        <div
          role="alert"
          className="bg-warning-bg text-warning-fg rounded-inner flex items-start gap-3 px-4 py-3 text-sm"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 flex-none" />
          <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
            <p>{aviso.tipo === 'conflito' ? MENSAGEM_CONFLITO : aviso.mensagem}</p>
            {aviso.tipo === 'conflito' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setAviso(null);
                  router.refresh();
                }}
              >
                Recarregar
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-titulo`} className="text-[13px] leading-none font-medium">
          Título
        </label>
        <Input
          id={`${id}-titulo`}
          autoComplete="off"
          maxLength={200}
          aria-invalid={errors.titulo ? true : undefined}
          aria-describedby={errors.titulo ? idErroTitulo : idAjudaTitulo}
          {...register('titulo')}
        />
        <Rodape
          idErro={idErroTitulo}
          idAjuda={idAjudaTitulo}
          erro={errors.titulo?.message}
          ajuda="De 5 a 120 caracteres"
          contador={`${titulo.trim().length}/120`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-descricao`} className="text-[13px] leading-none font-medium">
          Descrição
        </label>
        <Textarea
          id={`${id}-descricao`}
          rows={4}
          maxLength={5200}
          aria-invalid={errors.descricao ? true : undefined}
          aria-describedby={errors.descricao ? idErroDescricao : idAjudaDescricao}
          {...register('descricao')}
        />
        <Rodape
          idErro={idErroDescricao}
          idAjuda={idAjudaDescricao}
          erro={errors.descricao?.message}
          ajuda="De 10 a 5000 caracteres"
          contador={`${descricao.length}/5000`}
        />
      </div>

      <fieldset
        className="flex min-w-0 flex-col gap-2"
        aria-invalid={errors.prioridade ? true : undefined}
        aria-describedby={errors.prioridade ? idErroPrioridade : undefined}
        aria-errormessage={errors.prioridade ? idErroPrioridade : undefined}
      >
        <legend className="mb-2 text-[13px] leading-none font-medium">Prioridade</legend>
        <div className="grid grid-cols-3 gap-2.5 max-[760px]:grid-cols-1">
          {ORDEM_PRIORIDADES.map((opcao) => {
            const marcada = prioridade === opcao;
            return (
              <label
                key={opcao}
                className={cn(
                  'rounded-inner bg-card relative flex cursor-pointer flex-col gap-1.5 p-3.5 shadow-[inset_0_0_0_1px_var(--border)] transition-[background-color,box-shadow] duration-150',
                  'has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
                  marcada ? 'bg-accent shadow-[inset_0_0_0_2px_var(--primary)]' : 'hover:bg-muted',
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn('flex items-center gap-1.5 font-semibold', COR_PRIORIDADE[opcao])}
                  >
                    <IconePrioridade prioridade={opcao} />
                    {ROTULO_PRIORIDADE[opcao]}
                  </span>
                  <input
                    type="radio"
                    value={opcao}
                    className="accent-primary ml-auto size-4 cursor-pointer"
                    {...register('prioridade')}
                  />
                </span>
                <span className="text-muted-foreground text-[12.5px] leading-snug">
                  {EXPLICACAO_PRIORIDADE[opcao]}
                </span>
              </label>
            );
          })}
        </div>
        {errors.prioridade && (
          <p id={idErroPrioridade} className="text-destructive text-[12.5px]">
            {errors.prioridade.message}
          </p>
        )}
      </fieldset>

      <dl className="grid grid-cols-3 gap-2.5 max-[760px]:grid-cols-1">
        <SoLeitura rotulo="Solicitante" valor={solicitacao?.solicitante.nome ?? usuario.nome} />
        <SoLeitura rotulo="Área" valor={solicitacao?.area.nome ?? usuario.area.nome} />
        <SoLeitura
          rotulo="Data"
          valor={
            solicitacao
              ? formatarData(solicitacao.dataSolicitacao)
              : 'Agora, definida pelo servidor'
          }
          mono={edicao}
        />
      </dl>

      <div
        className={cn(
          'flex flex-wrap items-center justify-end gap-2.5',
          'max-[760px]:bg-card max-[760px]:sticky max-[760px]:bottom-0 max-[760px]:-mx-5 max-[760px]:px-5 max-[760px]:py-4 max-[760px]:shadow-[0_-1px_0_var(--border)] max-[760px]:[&>*]:h-11 max-[760px]:[&>*]:flex-1',
        )}
      >
        {aoCancelar && (
          <Button type="button" variant="ghost" onClick={aoCancelar}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? edicao
              ? 'Salvando…'
              : 'Criando…'
            : edicao
              ? 'Salvar alterações'
              : 'Criar solicitação'}
        </Button>
      </div>
    </form>
  );
}

function Rodape({
  idErro,
  idAjuda,
  erro,
  ajuda,
  contador,
}: {
  idErro: string;
  idAjuda: string;
  erro?: string;
  ajuda: string;
  contador: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12px]">
      {erro ? (
        <p id={idErro} className="text-destructive">
          {erro}
        </p>
      ) : (
        <p id={idAjuda} className="text-muted-foreground">
          {ajuda}
        </p>
      )}
      <span aria-hidden="true" className="text-muted-foreground font-mono tabular-nums">
        {contador}
      </span>
    </div>
  );
}

function SoLeitura({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div className="bg-muted rounded-row flex flex-col gap-1 px-3.5 py-2.5">
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className={cn('text-[15px]', mono && 'font-mono text-sm tabular-nums')}>{valor}</dd>
    </div>
  );
}
