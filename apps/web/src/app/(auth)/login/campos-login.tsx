'use client';

import {
  createContext,
  useContext,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from 'react';

/** Estado dos campos do login: compartilhado com o card do modo demonstração quando ligado. */
export interface CamposLogin {
  email: string;
  setEmail: Dispatch<SetStateAction<string>>;
  senha: string;
  setSenha: Dispatch<SetStateAction<string>>;
  refEntrar: RefObject<HTMLButtonElement | null>;
}

const ContextoCampos = createContext<CamposLogin | null>(null);
const ContextoSenhaDemonstracao = createContext('');

function useNovosCampos(): CamposLogin {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const refEntrar = useRef<HTMLButtonElement>(null);
  return { email, setEmail, senha, setSenha, refEntrar };
}

/** Os campos do provedor do modo demonstração ou, fora dele, um estado próprio. */
export function useCamposLogin(): CamposLogin {
  const proprios = useNovosCampos();
  return useContext(ContextoCampos) ?? proprios;
}

/**
 * Liga o formulário ao card do modo demonstração. Só é renderizado com DEMO_MODE=true: é o
 * único lugar em que a senha do seed chega ao navegador.
 */
export function ProvedorModoDemonstracao({
  senha,
  children,
}: {
  senha: string;
  children: ReactNode;
}) {
  const campos = useNovosCampos();
  return (
    <ContextoCampos.Provider value={campos}>
      <ContextoSenhaDemonstracao.Provider value={senha}>
        {children}
      </ContextoSenhaDemonstracao.Provider>
    </ContextoCampos.Provider>
  );
}

/** Preenche o login com o e-mail informado e a senha do seed, e leva o foco para "Entrar". */
export function usePreencherLogin(): (email: string) => void {
  const campos = useContext(ContextoCampos);
  const senha = useContext(ContextoSenhaDemonstracao);
  return (email) => {
    if (!campos) return;
    campos.setEmail(email);
    campos.setSenha(senha);
    campos.refEntrar.current?.focus();
  };
}
