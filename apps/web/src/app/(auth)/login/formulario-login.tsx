'use client';

import { LoaderCircle } from 'lucide-react';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { entrar } from '@/features/auth/actions';

export function FormularioLogin({ next }: { next: string }) {
  const [estado, acao, enviando] = useActionState(entrar, undefined);
  // Controlado para não perder o e-mail quando o React limpa o formulário depois da action
  const [email, setEmail] = useState('');
  const erro = estado?.erro;

  return (
    <form action={acao} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? 'erro-login' : undefined}
          className="h-11"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="senha">Senha</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? 'erro-login' : undefined}
          className="h-11"
        />
      </div>

      {erro ? (
        <p
          id="erro-login"
          role="alert"
          className="bg-status-rejeitada-bg text-status-rejeitada-fg rounded-field px-3.5 py-2.5 text-[13.5px]"
        >
          {erro}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? (
          <>
            <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            Entrando…
          </>
        ) : (
          'Entrar'
        )}
      </Button>
    </form>
  );
}
