import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodSerializerDto } from 'nestjs-zod';
import type { UsuarioAutenticado } from '../../../common/context/usuario-autenticado';
import { UsuarioAtual } from '../../../common/decorators/usuario-atual.decorator';
import { ApiProblema } from '../../../openapi/respostas';
import { SolicitacoesService, type Executor } from '../application/solicitacoes.service';
import { paraEvento, paraPagina, paraSolicitacao } from './mapeamento';
import {
  ConsultaListaDto,
  CriarSolicitacaoDto,
  DecisaoDto,
  EditarSolicitacaoDto,
  EventoHistoricoDto,
  PaginaSolicitacoesDto,
  ReaberturaDto,
  SolicitacaoDto,
} from './solicitacoes.dto';

const NAO_AUTENTICADO = 'Sem token, token inválido ou sessão encerrada (NAO_AUTENTICADO)';
const NAO_ENCONTRADA =
  'Não existe, foi excluída ou não é visível para o usuário (SOLICITACAO_NAO_ENCONTRADA)';
const CORPO_INVALIDO = 'Corpo inválido ou com campos não aceitos (DADOS_INVALIDOS)';

function executor(usuario: UsuarioAutenticado): Executor {
  return { id: usuario.id, cargo: usuario.cargo, areaId: usuario.areaId };
}

/**
 * Solicitações. Todas as rotas exigem login; a visibilidade (o solicitante só vê as próprias) e as
 * regras de cada ação ficam nos casos de uso e na política de domínio, não em `@Cargos()`, para
 * que uma solicitação invisível responda 404 antes de qualquer 403.
 */
@ApiTags('solicitações')
@ApiBearerAuth('bearer')
@Controller('solicitacoes')
export class SolicitacoesController {
  constructor(private readonly solicitacoes: SolicitacoesService) {}

  @Get()
  @ApiOperation({
    operationId: 'listarSolicitacoes',
    summary: 'Lista com busca, filtros, ordenação e paginação (escopo do usuário)',
  })
  @ApiOkResponse({ type: PaginaSolicitacoesDto, description: 'Página de solicitações' })
  @ApiProblema(400, 'Parâmetros inválidos (DADOS_INVALIDOS)')
  @ApiProblema(401, NAO_AUTENTICADO)
  @ZodSerializerDto(PaginaSolicitacoesDto)
  async listar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query() consulta: ConsultaListaDto,
  ): Promise<PaginaSolicitacoesDto> {
    return paraPagina(await this.solicitacoes.listar(executor(usuario), consulta));
  }

  @Post()
  @ApiOperation({ operationId: 'criarSolicitacao', summary: 'Abre uma solicitação (nasce ABERTA)' })
  @ApiCreatedResponse({
    type: SolicitacaoDto,
    description: 'Criada; o header Location aponta para ela',
    headers: { Location: { description: '/api/v1/solicitacoes/{id}', schema: { type: 'string' } } },
  })
  @ApiProblema(400, CORPO_INVALIDO)
  @ApiProblema(401, NAO_AUTENTICADO)
  @ZodSerializerDto(SolicitacaoDto)
  async criar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() corpo: CriarSolicitacaoDto,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<SolicitacaoDto> {
    const criada = await this.solicitacoes.criar(executor(usuario), corpo);
    resposta.location(`/api/v1/solicitacoes/${criada.id}`);
    return paraSolicitacao(criada);
  }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    operationId: 'detalharSolicitacao',
    summary: 'Detalhe, com as ações permitidas ao usuário atual',
  })
  @ApiOkResponse({ type: SolicitacaoDto, description: 'Solicitação' })
  @ApiProblema(401, NAO_AUTENTICADO)
  @ApiProblema(404, NAO_ENCONTRADA)
  @ZodSerializerDto(SolicitacaoDto)
  async detalhar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<SolicitacaoDto> {
    return paraSolicitacao(await this.solicitacoes.detalhar(executor(usuario), id));
  }

  @Patch(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    operationId: 'editarSolicitacao',
    summary: 'Edita título, descrição e prioridade (dono com ABERTA ou administrador sem decisão)',
  })
  @ApiOkResponse({ type: SolicitacaoDto, description: 'Solicitação atualizada' })
  @ApiProblema(400, CORPO_INVALIDO)
  @ApiProblema(401, NAO_AUTENTICADO)
  @ApiProblema(403, 'Não é o dono nem administrador (ACESSO_NEGADO)')
  @ApiProblema(404, NAO_ENCONTRADA)
  @ApiProblema(
    409,
    'Status não permite edição (EDICAO_BLOQUEADA) ou versão desatualizada (CONFLITO_DE_VERSAO)',
  )
  @ZodSerializerDto(SolicitacaoDto)
  async editar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() corpo: EditarSolicitacaoDto,
  ): Promise<SolicitacaoDto> {
    return paraSolicitacao(await this.solicitacoes.editar(executor(usuario), id, corpo));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    operationId: 'excluirSolicitacao',
    summary: 'Exclusão lógica (dono com ABERTA ou administrador sem decisão)',
  })
  @ApiNoContentResponse({ description: 'Excluída' })
  @ApiProblema(401, NAO_AUTENTICADO)
  @ApiProblema(403, 'Não é o dono nem administrador (ACESSO_NEGADO)')
  @ApiProblema(404, NAO_ENCONTRADA)
  @ApiProblema(409, 'Status não permite exclusão (EDICAO_BLOQUEADA)')
  async excluir(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<void> {
    await this.solicitacoes.excluir(executor(usuario), id);
  }

  @Post(':id/analise')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    operationId: 'iniciarAnalise',
    summary: 'Inicia a análise (ABERTA → EM_ANALISE); quem inicia vira o responsável',
  })
  @ApiOkResponse({ type: SolicitacaoDto, description: 'Solicitação em análise' })
  @ApiProblema(401, NAO_AUTENTICADO)
  @ApiProblema(
    403,
    'Cargo sem permissão (ACESSO_NEGADO) ou a própria solicitação (SEGREGACAO_DE_FUNCOES)',
  )
  @ApiProblema(404, NAO_ENCONTRADA)
  @ApiProblema(409, 'A solicitação não está ABERTA (TRANSICAO_INVALIDA)')
  @ZodSerializerDto(SolicitacaoDto)
  async iniciarAnalise(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<SolicitacaoDto> {
    return paraSolicitacao(await this.solicitacoes.iniciarAnalise(executor(usuario), id));
  }

  @Post(':id/decisao')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    operationId: 'decidirSolicitacao',
    summary: 'Aprova ou rejeita com comentário (analista responsável ou administrador)',
  })
  @ApiOkResponse({ type: SolicitacaoDto, description: 'Solicitação decidida' })
  @ApiProblema(400, CORPO_INVALIDO)
  @ApiProblema(401, NAO_AUTENTICADO)
  @ApiProblema(
    403,
    'Cargo sem permissão ou não é o responsável (ACESSO_NEGADO), ou a própria solicitação (SEGREGACAO_DE_FUNCOES)',
  )
  @ApiProblema(404, NAO_ENCONTRADA)
  @ApiProblema(409, 'A solicitação não está EM_ANALISE (TRANSICAO_INVALIDA)')
  @ZodSerializerDto(SolicitacaoDto)
  async decidir(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() corpo: DecisaoDto,
  ): Promise<SolicitacaoDto> {
    return paraSolicitacao(await this.solicitacoes.decidir(executor(usuario), id, corpo));
  }

  @Post(':id/reabertura')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    operationId: 'reabrirSolicitacao',
    summary: 'Reabre uma decidida (→ ABERTA) com justificativa (administrador)',
  })
  @ApiOkResponse({ type: SolicitacaoDto, description: 'Solicitação reaberta' })
  @ApiProblema(400, CORPO_INVALIDO)
  @ApiProblema(401, NAO_AUTENTICADO)
  @ApiProblema(
    403,
    'Não é administrador (ACESSO_NEGADO) ou a própria solicitação (SEGREGACAO_DE_FUNCOES)',
  )
  @ApiProblema(404, NAO_ENCONTRADA)
  @ApiProblema(409, 'A solicitação não está APROVADA nem REJEITADA (TRANSICAO_INVALIDA)')
  @ZodSerializerDto(SolicitacaoDto)
  async reabrir(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() corpo: ReaberturaDto,
  ): Promise<SolicitacaoDto> {
    return paraSolicitacao(
      await this.solicitacoes.reabrir(executor(usuario), id, corpo.justificativa),
    );
  }

  @Get(':id/historico')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    operationId: 'historicoSolicitacao',
    summary: 'Linha do tempo, do evento mais antigo para o mais recente',
  })
  @ApiOkResponse({ type: EventoHistoricoDto, isArray: true, description: 'Eventos' })
  @ApiProblema(401, NAO_AUTENTICADO)
  @ApiProblema(404, NAO_ENCONTRADA)
  @ZodSerializerDto([EventoHistoricoDto])
  async historico(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<EventoHistoricoDto[]> {
    return (await this.solicitacoes.historico(executor(usuario), id)).map(paraEvento);
  }
}
