// Solicitações de demonstração do seed: 40 pedidos com histórico coerente com o status atual.
// Tudo é determinístico (ids fixos derivados da posição) e as datas são relativas ao momento da
// primeira execução. Rodar de novo não insere nem altera nada.
import type {
  Prioridade,
  Prisma,
  PrismaClient,
  StatusSolicitacao,
  TipoEvento,
} from '../src/generated/prisma/client';

export type Apelido = 'ana' | 'bruno' | 'camila' | 'carla' | 'rafael' | 'diego';

/** Um passo do histórico depois da criação. A reabertura é sempre do Diego (administrador). */
type Passo = { analise: Apelido } | { aprova: Apelido } | { rejeita: Apelido } | { reabre: true };

interface Modelo {
  solicitante: Apelido;
  prioridade: Prioridade;
  /** Há quantos dias foi aberta (até 58, para ficar nos últimos 60 dias). */
  dias: number;
  titulo: string;
  descricao: string;
  passos: Passo[];
}

const A = (analista: Apelido): Passo => ({ analise: analista });
const OK = (decisor: Apelido): Passo => ({ aprova: decisor });
const NAO = (decisor: Apelido): Passo => ({ rejeita: decisor });
const REABRE: Passo = { reabre: true };

// Distribuição: 10 ABERTA, 7 EM_ANALISE, 15 APROVADA e 8 REJEITADA, com as três prioridades em
// cada status. Três foram reabertas pelo Diego. Ninguém analisa nem decide a própria (RN-07), e a
// decisão é do analista responsável ou do Diego (RN-05).
const MODELOS: Modelo[] = [
  // ABERTA
  {
    solicitante: 'ana',
    prioridade: 'ALTA',
    dias: 2,
    titulo: 'Acesso ao sistema de cobrança para conciliação',
    descricao:
      'Preciso de acesso de leitura ao módulo de cobrança para conciliar os boletos do fechamento mensal. Sem ele, a conciliação para.',
    passos: [],
  },
  {
    solicitante: 'bruno',
    prioridade: 'ALTA',
    dias: 1,
    titulo: 'Folha de pagamento não calcula horas extras',
    descricao:
      'Desde a última atualização, a folha não soma as horas extras lançadas no ponto. O fechamento da folha é na sexta-feira.',
    passos: [],
  },
  {
    solicitante: 'camila',
    prioridade: 'MEDIA',
    dias: 3,
    titulo: 'Atualizar a tabela de preços no CRM',
    descricao:
      'A nova tabela de preços entrou em vigor e o CRM ainda mostra os valores antigos nas propostas. Hoje corrigimos à mão.',
    passos: [],
  },
  {
    solicitante: 'ana',
    prioridade: 'BAIXA',
    dias: 6,
    titulo: 'Relatório de despesas com filtro por centro de custo',
    descricao:
      'Seria útil filtrar o relatório de despesas por centro de custo, para não precisar exportar e montar a planilha à parte.',
    passos: [],
  },
  {
    solicitante: 'bruno',
    prioridade: 'MEDIA',
    dias: 4,
    titulo: 'Cadastro de novos colaboradores no portal de benefícios',
    descricao:
      'Os admitidos deste mês não aparecem no portal de benefícios. Eles conseguem usar o vale-refeição, mas não o plano de saúde.',
    passos: [],
  },
  {
    solicitante: 'camila',
    prioridade: 'BAIXA',
    dias: 9,
    titulo: 'Modelo de proposta comercial com a nova identidade visual',
    descricao:
      'O modelo de proposta ainda usa a marca antiga. Gostaríamos de um modelo atualizado no gerador de documentos.',
    passos: [],
  },
  {
    solicitante: 'carla',
    prioridade: 'MEDIA',
    dias: 5,
    titulo: 'Licença adicional da ferramenta de diagramas',
    descricao:
      'O time de análise cresceu e falta uma licença da ferramenta de diagramas para documentar os fluxos dos processos.',
    passos: [],
  },
  {
    solicitante: 'rafael',
    prioridade: 'ALTA',
    dias: 2,
    titulo: 'Notebook com tela quebrada',
    descricao:
      'A tela do notebook trincou e não liga mais. Estou usando um monitor emprestado, mas não consigo trabalhar fora da mesa.',
    passos: [],
  },
  {
    solicitante: 'camila',
    prioridade: 'ALTA',
    dias: 3,
    titulo: 'Integração do site com o CRM parou',
    descricao:
      'Os contatos do formulário do site deixaram de chegar ao CRM desde ontem. Estamos perdendo oportunidades de venda.',
    passos: [],
  },
  {
    solicitante: 'bruno',
    prioridade: 'MEDIA',
    dias: 30,
    titulo: 'Acesso ao módulo de férias para os gestores',
    descricao:
      'Os gestores precisam aprovar as férias da equipe pelo sistema, sem mandar e-mail para o RH. Hoje o fluxo é todo manual.',
    passos: [A('carla'), OK('carla'), REABRE],
  },
  // EM_ANALISE
  {
    solicitante: 'ana',
    prioridade: 'ALTA',
    dias: 4,
    titulo: 'Erro ao gerar a remessa bancária',
    descricao:
      'O arquivo de remessa sai com o layout antigo e o banco recusa. Os pagamentos a fornecedores desta semana estão parados.',
    passos: [A('carla')],
  },
  {
    solicitante: 'bruno',
    prioridade: 'MEDIA',
    dias: 7,
    titulo: 'Relatório de absenteísmo por área',
    descricao:
      'Precisamos de um relatório mensal de faltas e atestados por área, para acompanhar os indicadores de saúde ocupacional.',
    passos: [A('rafael')],
  },
  {
    solicitante: 'camila',
    prioridade: 'BAIXA',
    dias: 8,
    titulo: 'Campo de segmento no cadastro de clientes',
    descricao:
      'Gostaríamos de um campo de segmento no cadastro de clientes, para separar varejo e atacado nos relatórios de vendas.',
    passos: [A('carla')],
  },
  {
    solicitante: 'ana',
    prioridade: 'MEDIA',
    dias: 10,
    titulo: 'Permissão para lançar notas fiscais de serviço',
    descricao:
      'Assumi os lançamentos de notas de serviço e preciso da permissão no sistema fiscal. Hoje dependo de um colega para lançar.',
    passos: [A('rafael')],
  },
  {
    solicitante: 'carla',
    prioridade: 'ALTA',
    dias: 3,
    titulo: 'VPN desconecta a cada poucos minutos',
    descricao:
      'A VPN cai várias vezes por hora quando trabalho de casa, e perco o que estava fazendo nos sistemas internos.',
    passos: [A('rafael')],
  },
  {
    solicitante: 'rafael',
    prioridade: 'BAIXA',
    dias: 6,
    titulo: 'Segundo monitor para a estação de trabalho',
    descricao:
      'Um segundo monitor ajudaria a comparar documentos e sistemas lado a lado durante as análises de solicitações.',
    passos: [A('carla')],
  },
  {
    solicitante: 'camila',
    prioridade: 'MEDIA',
    dias: 25,
    titulo: 'Desconto progressivo no sistema de pedidos',
    descricao:
      'O sistema de pedidos precisa aplicar o desconto progressivo por volume definido pela diretoria comercial neste trimestre.',
    passos: [A('rafael'), NAO('rafael'), REABRE, A('carla')],
  },
  // APROVADA
  {
    solicitante: 'ana',
    prioridade: 'ALTA',
    dias: 12,
    titulo: 'Liberação de acesso ao internet banking da empresa',
    descricao:
      'Preciso do acesso de operador ao internet banking para agendar os pagamentos enquanto a titular da função está de férias.',
    passos: [A('carla'), OK('carla')],
  },
  {
    solicitante: 'ana',
    prioridade: 'MEDIA',
    dias: 15,
    titulo: 'Planilha de fluxo de caixa no drive compartilhado',
    descricao:
      'Peço uma pasta no drive compartilhado com permissão para o time financeiro, para centralizar a planilha de fluxo de caixa.',
    passos: [A('rafael'), OK('rafael')],
  },
  {
    solicitante: 'ana',
    prioridade: 'BAIXA',
    dias: 20,
    titulo: 'Troca do teclado com teclas falhando',
    descricao:
      'Algumas teclas do teclado falham e preciso digitar duas vezes. Um teclado novo resolve, não precisa ser nenhum modelo especial.',
    passos: [A('carla'), OK('diego')],
  },
  {
    solicitante: 'bruno',
    prioridade: 'ALTA',
    dias: 14,
    titulo: 'Bloqueio de acesso de colaborador desligado',
    descricao:
      'Um colaborador foi desligado hoje e o acesso dele aos sistemas e ao e-mail precisa ser bloqueado imediatamente.',
    passos: [A('rafael'), OK('rafael')],
  },
  {
    solicitante: 'bruno',
    prioridade: 'MEDIA',
    dias: 18,
    titulo: 'Sala de treinamento com projetor funcionando',
    descricao:
      'O projetor da sala de treinamento não reconhece os notebooks. A integração dos novos colaboradores é na próxima semana.',
    passos: [A('carla'), OK('carla')],
  },
  {
    solicitante: 'bruno',
    prioridade: 'BAIXA',
    dias: 27,
    titulo: 'Pesquisa de clima no formulário interno',
    descricao:
      'Gostaríamos de publicar a pesquisa de clima no formulário interno, com respostas anônimas e acesso restrito ao RH.',
    passos: [A('rafael'), OK('rafael')],
  },
  {
    solicitante: 'camila',
    prioridade: 'ALTA',
    dias: 16,
    titulo: 'Acesso ao CRM para o novo representante',
    descricao:
      'O novo representante comercial começa amanhã e precisa de usuário no CRM com a carteira da região Sul.',
    passos: [A('carla'), OK('carla')],
  },
  {
    solicitante: 'camila',
    prioridade: 'MEDIA',
    dias: 22,
    titulo: 'Celular corporativo para visitas a clientes',
    descricao:
      'Faço visitas diárias a clientes e preciso de um celular corporativo com o aplicativo do CRM e o pacote de dados.',
    passos: [A('rafael'), OK('diego')],
  },
  {
    solicitante: 'camila',
    prioridade: 'BAIXA',
    dias: 35,
    titulo: 'Assinatura de e-mail padronizada',
    descricao:
      'O time comercial usa assinaturas diferentes. Pedimos um modelo único de assinatura de e-mail com a identidade visual.',
    passos: [A('carla'), OK('carla')],
  },
  {
    solicitante: 'carla',
    prioridade: 'MEDIA',
    dias: 24,
    titulo: 'Acesso de leitura ao banco de relatórios',
    descricao:
      'Para conferir os números do painel de solicitações, preciso de acesso de leitura ao banco de relatórios.',
    passos: [A('rafael'), OK('rafael')],
  },
  {
    solicitante: 'rafael',
    prioridade: 'ALTA',
    dias: 19,
    titulo: 'Renovação do certificado digital da empresa',
    descricao:
      'O certificado digital usado na emissão de notas vence em cinco dias. Sem a renovação, a emissão de notas para.',
    passos: [A('carla'), OK('diego')],
  },
  {
    solicitante: 'ana',
    prioridade: 'MEDIA',
    dias: 40,
    titulo: 'Conta de acesso ao portal de um fornecedor',
    descricao:
      'O fornecedor de material de escritório passou a enviar as faturas só pelo portal. Preciso de um usuário para baixá-las.',
    passos: [A('carla'), OK('carla')],
  },
  {
    solicitante: 'bruno',
    prioridade: 'ALTA',
    dias: 45,
    titulo: 'Correção do cálculo do vale-transporte',
    descricao:
      'O desconto do vale-transporte está passando dos 6% do salário para alguns colaboradores, o que contraria a legislação.',
    passos: [A('rafael'), OK('rafael')],
  },
  {
    solicitante: 'camila',
    prioridade: 'MEDIA',
    dias: 50,
    titulo: 'Relatório de comissões por vendedor',
    descricao:
      'Precisamos de um relatório mensal de comissões por vendedor, com as metas e o percentual atingido.',
    passos: [A('carla'), OK('carla')],
  },
  {
    solicitante: 'ana',
    prioridade: 'ALTA',
    dias: 55,
    titulo: 'Solicitação de acesso ao sistema de contas a pagar',
    descricao:
      'Com a mudança de função, passo a aprovar pagamentos e preciso do perfil de aprovadora no sistema de contas a pagar.',
    passos: [A('rafael'), NAO('rafael'), REABRE, A('carla'), OK('carla')],
  },
  // REJEITADA
  {
    solicitante: 'bruno',
    prioridade: 'BAIXA',
    dias: 11,
    titulo: 'Papel de parede personalizado nos computadores',
    descricao:
      'Sugestão de um papel de parede com os valores da empresa em todos os computadores, para reforçar a cultura.',
    passos: [A('carla'), NAO('carla')],
  },
  {
    solicitante: 'camila',
    prioridade: 'ALTA',
    dias: 13,
    titulo: 'Instalar extensão de navegador para captura de contatos',
    descricao:
      'Uma extensão gratuita captura contatos de redes sociais direto para planilhas. Ajudaria muito na prospecção.',
    passos: [A('rafael'), NAO('rafael')],
  },
  {
    solicitante: 'ana',
    prioridade: 'MEDIA',
    dias: 17,
    titulo: 'Acesso de administrador no computador',
    descricao:
      'Peço acesso de administrador no meu computador para instalar sozinha os programas de que preciso no dia a dia.',
    passos: [A('carla'), NAO('diego')],
  },
  {
    solicitante: 'carla',
    prioridade: 'BAIXA',
    dias: 21,
    titulo: 'Cadeira ergonômica para a sala de análise',
    descricao:
      'As cadeiras da sala de análise não têm regulagem de altura. Uma cadeira ergonômica ajudaria em jornadas longas.',
    passos: [A('rafael'), NAO('rafael')],
  },
  {
    solicitante: 'rafael',
    prioridade: 'MEDIA',
    dias: 28,
    titulo: 'Assinatura de um serviço de música para o escritório',
    descricao:
      'Uma assinatura de serviço de música para tocar no escritório deixaria o ambiente mais agradável durante o dia.',
    passos: [A('carla'), NAO('carla')],
  },
  {
    solicitante: 'bruno',
    prioridade: 'ALTA',
    dias: 33,
    titulo: 'Exportar a base de colaboradores para uma planilha pessoal',
    descricao:
      'Preciso exportar a base completa de colaboradores, com CPF e salário, para uma planilha no meu computador.',
    passos: [A('rafael'), NAO('diego')],
  },
  {
    solicitante: 'ana',
    prioridade: 'BAIXA',
    dias: 42,
    titulo: 'Segundo monitor ultrawide',
    descricao:
      'Um monitor ultrawide facilitaria a análise das planilhas grandes de conciliação bancária.',
    passos: [A('carla'), NAO('carla')],
  },
  {
    solicitante: 'carla',
    prioridade: 'ALTA',
    dias: 58,
    titulo: 'Liberar o acesso remoto sem VPN',
    descricao:
      'Peço para liberar o acesso remoto aos sistemas internos sem VPN, porque a conexão cai com frequência.',
    passos: [A('rafael'), NAO('diego')],
  },
];

const COMENTARIOS_APROVACAO = [
  'Aprovado. O acesso foi liberado conforme a política de perfis.',
  'Aprovado. O pedido está alinhado à necessidade da área e ao orçamento.',
  'Aprovado. O time de suporte vai entrar em contato para agendar a entrega.',
];

const COMENTARIOS_REJEICAO = [
  'Rejeitado. O pedido contraria a política de segurança da informação.',
  'Rejeitado. Não há orçamento previsto para este item neste semestre.',
  'Rejeitado. A necessidade já é atendida pela ferramenta padrão da empresa.',
];

const JUSTIFICATIVAS_REABERTURA = [
  'A decisão considerou informações desatualizadas; precisa de nova análise.',
  'A área apresentou novos documentos que mudam o contexto do pedido.',
];

const DIA = 24 * 60 * 60 * 1000;
const HORA = 60 * 60 * 1000;

/** Ids fixos, no formato UUID v4, derivados da posição da solicitação e do evento. */
function idDaSolicitacao(indice: number): string {
  return `5011c17a-0000-4000-8000-${String(indice + 1).padStart(12, '0')}`;
}

function idDoEvento(indice: number, ordem: number): string {
  return `5011c17a-0000-4000-8001-${String((indice + 1) * 100 + ordem).padStart(12, '0')}`;
}

function escolher<T>(lista: readonly T[], indice: number): T {
  return lista[indice % lista.length]!;
}

interface Pessoa {
  id: string;
  nome: string;
  areaId: string;
}

/** Monta a solicitação e o histórico a partir do roteiro, aplicando a máquina de estados. */
function montar(
  modelo: Modelo,
  indice: number,
  pessoas: Record<Apelido, Pessoa>,
  agora: number,
): {
  solicitacao: Prisma.SolicitacaoUncheckedCreateInput;
  eventos: Prisma.SolicitacaoHistoricoCreateManyInput[];
} {
  const id = idDaSolicitacao(indice);
  const solicitante = pessoas[modelo.solicitante];
  // Abre num horário variado do dia indicado; os passos se espalham até meio dia antes de agora
  const aberturaEm = agora - modelo.dias * DIA + ((indice * 37) % 8) * HORA;
  const intervalo = Math.floor(((modelo.dias - 0.5) * DIA) / (modelo.passos.length + 1));

  let status: StatusSolicitacao = 'ABERTA';
  let analista: Pessoa | null = null;
  let decisao: { comentario: string; em: Date; por: Pessoa } | null = null;

  const eventos: Prisma.SolicitacaoHistoricoCreateManyInput[] = [
    {
      id: idDoEvento(indice, 0),
      solicitacaoId: id,
      tipo: 'CRIADA',
      statusNovo: 'ABERTA',
      autorId: solicitante.id,
      criadoEm: new Date(aberturaEm),
    },
  ];

  for (const [posicao, passo] of modelo.passos.entries()) {
    const em = new Date(aberturaEm + (posicao + 1) * intervalo);
    const anterior = status;
    let tipo: TipoEvento;
    let autor: Pessoa;
    let comentario: string | null = null;
    let dados: Prisma.InputJsonObject | undefined;

    if ('analise' in passo) {
      if (status !== 'ABERTA') throw new Error(`Seed: análise fora de ABERTA (${id}).`);
      autor = pessoas[passo.analise];
      analista = autor;
      status = 'EM_ANALISE';
      tipo = 'ANALISE_INICIADA';
    } else if ('reabre' in passo) {
      if (!decisao || !analista || (status !== 'APROVADA' && status !== 'REJEITADA')) {
        throw new Error(`Seed: reabertura de uma solicitação não decidida (${id}).`);
      }
      autor = pessoas.diego;
      comentario = escolher(JUSTIFICATIVAS_REABERTURA, indice);
      dados = {
        decisaoAnterior: {
          resultado: status,
          comentario: decisao.comentario,
          decididoEm: decisao.em.toISOString(),
          decididoPor: { id: decisao.por.id, nome: decisao.por.nome },
          analista: { id: analista.id, nome: analista.nome },
        },
      };
      status = 'ABERTA';
      analista = null;
      decisao = null;
      tipo = 'REABERTA';
    } else {
      if (status !== 'EM_ANALISE') throw new Error(`Seed: decisão fora de EM_ANALISE (${id}).`);
      const aprova = 'aprova' in passo;
      autor = pessoas[aprova ? passo.aprova : passo.rejeita];
      comentario = aprova
        ? escolher(COMENTARIOS_APROVACAO, indice)
        : escolher(COMENTARIOS_REJEICAO, indice);
      status = aprova ? 'APROVADA' : 'REJEITADA';
      decisao = { comentario, em, por: autor };
      tipo = status;
    }

    if (autor.id === solicitante.id) {
      throw new Error(`Seed: segregação de funções violada (${id}).`);
    }
    eventos.push({
      id: idDoEvento(indice, posicao + 1),
      solicitacaoId: id,
      tipo,
      statusAnterior: anterior,
      statusNovo: status,
      comentario,
      autorId: autor.id,
      ...(dados ? { dados } : {}),
      criadoEm: em,
    });
  }

  return {
    solicitacao: {
      id,
      titulo: modelo.titulo,
      descricao: modelo.descricao,
      prioridade: modelo.prioridade,
      status,
      solicitanteId: solicitante.id,
      areaId: solicitante.areaId,
      analistaId: analista?.id ?? null,
      dataSolicitacao: new Date(aberturaEm),
      decisaoComentario: decisao?.comentario ?? null,
      decididoEm: decisao?.em ?? null,
      decididoPorId: decisao?.por.id ?? null,
      versao: 1 + modelo.passos.length,
      atualizadoEm: eventos[eventos.length - 1]!.criadoEm,
    },
    eventos,
  };
}

/**
 * Insere as 40 solicitações e o histórico de cada uma. As que já existem ficam intactas: as datas
 * calculadas agora não sobrescrevem as da primeira vez, e a sequência do código não anda.
 */
export async function semearSolicitacoes(
  prisma: PrismaClient,
  emails: Record<Apelido, string>,
): Promise<number> {
  const usuarios = await prisma.usuario.findMany({
    where: { email: { in: Object.values(emails) } },
    select: { id: true, nome: true, email: true, areaId: true },
  });
  const pessoas = Object.fromEntries(
    (Object.entries(emails) as [Apelido, string][]).map(([apelido, email]) => {
      const usuario = usuarios.find((candidato) => candidato.email === email);
      if (!usuario) throw new Error(`Seed: usuário ${email} não encontrado.`);
      return [apelido, { id: usuario.id, nome: usuario.nome, areaId: usuario.areaId }];
    }),
  ) as Record<Apelido, Pessoa>;

  const agora = Date.now();
  const montadas = MODELOS.map((modelo, indice) => montar(modelo, indice, pessoas, agora));

  // Só o que ainda não existe, da mais antiga para a mais nova: o código (sequência) cresce com a
  // data, e rodar de novo não chama nextval (um INSERT ignorado por conflito também gastaria um)
  const existentes = new Set(
    (
      await prisma.solicitacao.findMany({
        where: { id: { in: montadas.map(({ solicitacao }) => solicitacao.id!) } },
        select: { id: true },
      })
    ).map(({ id }) => id),
  );
  const faltantes = montadas
    .filter(({ solicitacao }) => !existentes.has(solicitacao.id!))
    .sort(
      (a, b) =>
        (a.solicitacao.dataSolicitacao as Date).getTime() -
        (b.solicitacao.dataSolicitacao as Date).getTime(),
    );
  if (faltantes.length === 0) return MODELOS.length;

  await prisma.$transaction(async (tx) => {
    // Uma por vez, para a ordem dos códigos não depender da ordem de avaliação de um INSERT múltiplo
    for (const { solicitacao } of faltantes) {
      await tx.solicitacao.create({ data: solicitacao, select: { id: true } });
    }
    await tx.solicitacaoHistorico.createMany({
      data: faltantes.flatMap(({ eventos }) => eventos),
      skipDuplicates: true,
    });
  });
  return MODELOS.length;
}
