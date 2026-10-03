'use client';

import { Button } from '@/components/ui/button';
import type { UsuarioDemonstracao } from '@/features/auth/demonstracao';
import { ROTULO_CARGO } from '@/features/auth/usuario';
import { usePreencherLogin } from './campos-login';

const iniciais = (nome: string) =>
  nome
    .split(' ')
    .map((parte) => parte[0])
    .slice(0, 2)
    .join('');

/**
 * Card marinho do modo demonstração (P1): um usuário do seed por cargo. "Usar" só preenche o
 * formulário e põe o foco em "Entrar"; o login segue o fluxo normal.
 */
export function CardDemonstracao({ usuarios }: { usuarios: readonly UsuarioDemonstracao[] }) {
  const preencher = usePreencherLogin();

  return (
    <section
      aria-labelledby="rotulo-demonstracao titulo-demonstracao"
      className="bg-hero text-hero-foreground rounded-card relative isolate flex flex-col gap-5 overflow-hidden p-8 max-[760px]:p-7"
    >
      {/* Anéis decorativos no canto */}
      <span
        aria-hidden="true"
        className="border-brand-orange/60 absolute -right-16 -bottom-16 -z-10 size-60 rounded-full border"
      />
      <span
        aria-hidden="true"
        className="border-brand-orange/40 absolute -right-2 -bottom-2 -z-10 size-32 rounded-full border"
      />
      <div className="flex flex-col gap-2">
        <p
          id="rotulo-demonstracao"
          className="text-brand-orange font-mono text-xs font-medium tracking-[0.12em] uppercase"
        >
          Modo demonstração
        </p>
        <h2
          id="titulo-demonstracao"
          className="font-display text-2xl leading-[1.15] font-semibold tracking-[-0.03em]"
        >
          Entre como um dos cargos
        </h2>
        <p className="text-hero-muted text-sm">
          Usuários de exemplo, criados pelo seed. O botão preenche o login.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {usuarios.map((usuario) => (
          <li
            key={usuario.email}
            className="rounded-row flex items-center gap-3 bg-white/[0.07] px-3 py-2.5"
          >
            <span
              aria-hidden="true"
              className="grid size-8 flex-none place-items-center rounded-full bg-white/15 text-xs font-semibold"
            >
              {iniciais(usuario.nome)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{usuario.nome}</span>
              <span className="text-hero-muted truncate text-[13px]">
                {ROTULO_CARGO[usuario.cargo]} · {usuario.area}
              </span>
            </span>
            <Button
              type="button"
              variant="orange"
              size="sm"
              aria-label={`Usar ${usuario.nome}`}
              onClick={() => preencher(usuario.email)}
              className="max-[760px]:h-11 max-[760px]:px-4"
            >
              Usar
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
