// Valores de exemplo do Swagger (`example` nos DTOs), os mesmos da documentação da API.
// Só documentação: nada aqui é usado na validação nem nas respostas.

export const EXEMPLO = {
  solicitacaoId: '0b6c8f9e-3d2a-4f7b-9c1e-5a8d2f4b6c10',
  eventoId: '5f1d7c2a-8b3e-4a69-b0d4-2e9c6a1f7d38',
  historicoId: 'c7e1a9d3-5b2f-4c86-9e0a-4d6f8b2c1e57',
  codigo: 'SOL-000042',
  titulo: 'Acesso ao sistema de cobrança',
  descricao: 'Preciso de acesso de leitura ao módulo de cobrança para conciliar os boletos do mês.',
  comentario: 'Acesso liberado conforme a política de perfis de leitura.',
  justificativa: 'A aprovação considerou o perfil errado; precisa de nova análise.',
  ana: { id: '3e7b1c9a-2d4f-4a68-8b0e-6c1d3f5a7b92', nome: 'Ana Souza' },
  carla: { id: '8d2f4a6c-1e3b-4c75-9a0d-2b4e6f8a1c39', nome: 'Carla Mendes' },
  financeiro: { id: '1a3c5e7b-9d2f-4b46-8c0e-7f9a1b3d5e28', nome: 'Financeiro' },
  dataSolicitacao: '2026-10-02T13:45:00.000Z',
  decididoEm: '2026-10-03T10:12:00.000Z',
  enviadaEm: '2026-10-03T10:12:07.000Z',
  requestId: 'f3c1a2b4-6d8e-4f0a-9b1c-3e5d7f9a2b46',
} as const;
