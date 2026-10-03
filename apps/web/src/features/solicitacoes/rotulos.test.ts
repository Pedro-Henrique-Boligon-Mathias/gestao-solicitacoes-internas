import { describe, expect, it } from 'vitest';
import {
  EXPLICACAO_PRIORIDADE,
  ROTULO_EVENTO,
  ROTULO_PRIORIDADE,
  ROTULO_STATUS,
  ROTULO_STATUS_INTEGRACAO,
  ROTULO_TIPO_INTEGRACAO,
} from './rotulos';

describe('ADR-013: rótulos em pt-BR (a API usa os códigos)', () => {
  it('ADR-013: status', () => {
    expect(ROTULO_STATUS).toEqual({
      ABERTA: 'Aberta',
      EM_ANALISE: 'Em análise',
      APROVADA: 'Aprovada',
      REJEITADA: 'Rejeitada',
    });
  });

  it('ADR-013: prioridade', () => {
    expect(ROTULO_PRIORIDADE).toEqual({ BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta' });
  });

  it('ADR-013: tipo de evento do histórico', () => {
    expect(ROTULO_EVENTO).toEqual({
      CRIADA: 'Criada',
      EDITADA: 'Editada',
      ANALISE_INICIADA: 'Análise iniciada',
      APROVADA: 'Aprovada',
      REJEITADA: 'Rejeitada',
      REABERTA: 'Reaberta',
      EXCLUIDA: 'Excluída',
    });
  });

  it('ADR-013: explicação de cada prioridade (nota de domínio)', () => {
    expect(EXPLICACAO_PRIORIDADE.ALTA).toMatch(/impede ou compromete uma operação/i);
    expect(EXPLICACAO_PRIORIDADE.MEDIA).toMatch(/existe alternativa temporária/i);
    expect(EXPLICACAO_PRIORIDADE.BAIXA).toMatch(/sem urgência/i);
  });

  it('ADR-010: tipo do evento de integração', () => {
    expect(ROTULO_TIPO_INTEGRACAO).toEqual({
      SolicitacaoAprovada: 'Aprovação',
      SolicitacaoReaberta: 'Reabertura',
    });
  });

  it('ADR-010: status da integração', () => {
    expect(ROTULO_STATUS_INTEGRACAO).toEqual({
      PENDENTE: 'Pendente',
      ENVIADO: 'Enviada',
      FALHOU: 'Falhou',
    });
  });
});
