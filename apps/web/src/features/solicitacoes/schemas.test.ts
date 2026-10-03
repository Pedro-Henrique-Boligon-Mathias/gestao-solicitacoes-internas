import { describe, expect, it } from 'vitest';
import { comentarioSchema, solicitacaoSchema } from './schemas';

const VALIDA = {
  titulo: 'Acesso ao sistema de folha',
  descricao: 'Preciso de acesso para fechar o mês.',
  prioridade: 'ALTA',
};

/** Mensagens de erro do zod para um campo. */
function errosDe(
  resultado: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
  campo?: string,
) {
  return (resultado.error?.issues ?? [])
    .filter((issue) => campo === undefined || issue.path[0] === campo)
    .map((issue) => issue.message);
}

describe('RF-01: solicitacaoSchema (validação de UX; a API é a autoridade)', () => {
  it('RF-01: aceita dados válidos', () => {
    expect(solicitacaoSchema.safeParse(VALIDA).success).toBe(true);
  });

  it('RF-01: prioridade ausente vira MEDIA', () => {
    const semPrioridade = { titulo: VALIDA.titulo, descricao: VALIDA.descricao };
    const resultado = solicitacaoSchema.safeParse(semPrioridade);
    expect(resultado.success).toBe(true);
    expect(resultado.data?.prioridade).toBe('MEDIA');
  });

  it('RF-01: prioridade fora de BAIXA, MEDIA e ALTA é recusada', () => {
    const resultado = solicitacaoSchema.safeParse({ ...VALIDA, prioridade: 'URGENTE' });
    expect(resultado.success).toBe(false);
    expect(errosDe(resultado, 'prioridade')).not.toHaveLength(0);
  });

  it('RF-01: título conta sem os espaços nas pontas (4 caracteres → erro)', () => {
    const resultado = solicitacaoSchema.safeParse({ ...VALIDA, titulo: '   abcd   ' });
    expect(resultado.success).toBe(false);
    expect(errosDe(resultado, 'titulo').join(' ')).toMatch(/pelo menos 5 caracteres/i);
  });

  it('RF-01: título válido sai sem os espaços nas pontas', () => {
    const resultado = solicitacaoSchema.safeParse({ ...VALIDA, titulo: '  Novo notebook  ' });
    expect(resultado.data?.titulo).toBe('Novo notebook');
  });

  it('RF-01: título com mais de 120 caracteres é recusado', () => {
    const resultado = solicitacaoSchema.safeParse({ ...VALIDA, titulo: 'a'.repeat(121) });
    expect(resultado.success).toBe(false);
    expect(errosDe(resultado, 'titulo')).not.toHaveLength(0);
  });

  it('RF-01: descrição só com espaços é recusada com "Escreva pelo menos 10 caracteres."', () => {
    const resultado = solicitacaoSchema.safeParse({ ...VALIDA, descricao: ' '.repeat(30) });
    expect(resultado.success).toBe(false);
    expect(errosDe(resultado, 'descricao')).toContain('Escreva pelo menos 10 caracteres.');
  });

  it('RF-01: descrição precisa de 10 caracteres que não sejam espaço', () => {
    // 15 caracteres no total, mas só 9 visíveis
    const resultado = solicitacaoSchema.safeParse({ ...VALIDA, descricao: 'a b c d e f g h i' });
    expect(resultado.success).toBe(false);
    expect(
      solicitacaoSchema.safeParse({ ...VALIDA, descricao: 'a b c d e f g h i j' }).success,
    ).toBe(true);
  });

  it('RF-01: descrição é mantida como foi digitada (sem trim)', () => {
    const descricao = '  Linha um\n  linha dois com recuo  ';
    expect(solicitacaoSchema.safeParse({ ...VALIDA, descricao }).data?.descricao).toBe(descricao);
  });

  it('RF-01: descrição com mais de 5000 caracteres é recusada', () => {
    const resultado = solicitacaoSchema.safeParse({ ...VALIDA, descricao: 'a'.repeat(5001) });
    expect(resultado.success).toBe(false);
  });
});

describe('RN-06/RN-16: comentarioSchema (comentário da decisão e justificativa da reabertura)', () => {
  it('RN-06: menos de 10 caracteres depois do trim → "Escreva pelo menos 10 caracteres."', () => {
    const resultado = comentarioSchema.safeParse('   curto     ');
    expect(resultado.success).toBe(false);
    expect(errosDe(resultado)).toContain('Escreva pelo menos 10 caracteres.');
  });

  it('RN-06: aceita 10 caracteres ou mais e devolve sem espaços nas pontas', () => {
    const resultado = comentarioSchema.safeParse('  Aprovado conforme política.  ');
    expect(resultado.success).toBe(true);
    expect(resultado.data).toBe('Aprovado conforme política.');
  });

  it('RN-06: mais de 2000 caracteres é recusado', () => {
    expect(comentarioSchema.safeParse('a'.repeat(2001)).success).toBe(false);
  });
});
