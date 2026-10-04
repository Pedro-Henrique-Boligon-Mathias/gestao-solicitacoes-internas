import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import type { UsuarioAutenticado } from '../../common/context/usuario-autenticado';
import { Cargos } from '../../common/decorators/cargos.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { ApiProblema } from '../../openapi/respostas';
import { ConsultaResumoDto, ResumoDto } from './dashboard.dto';
import { DashboardService } from './dashboard.service';
import { ConsultaGestaoDto, GestaoDto } from './gestao.dto';
import { GestaoService } from './gestao.service';

@ApiTags('dashboard')
@ApiBearerAuth('bearer')
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly gestao: GestaoService,
  ) {}

  @Get('resumo')
  @ApiOperation({
    operationId: 'resumoDashboard',
    summary: 'Totais por status e prioridade no escopo do usuário, no período escolhido',
  })
  @ApiOkResponse({ type: ResumoDto, description: 'Indicadores' })
  @ApiProblema(400, 'Período inválido (DADOS_INVALIDOS)')
  @ApiProblema(401, 'Sem token, token inválido ou sessão encerrada (NAO_AUTENTICADO)')
  @ZodSerializerDto(ResumoDto)
  resumo(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query() consulta: ConsultaResumoDto,
  ): Promise<ResumoDto> {
    return this.dashboard.resumo(usuario.cargo, consulta.periodo);
  }

  @Get('gestao')
  @Cargos('ADMIN')
  @ApiOperation({
    operationId: 'gestaoDashboard',
    summary:
      'Painel de gestão do administrador: entrada e saída, por área, por analista e integrações com falha',
  })
  @ApiOkResponse({ type: GestaoDto, description: 'Painel de gestão' })
  @ApiProblema(400, 'Período inválido (DADOS_INVALIDOS)')
  @ApiProblema(401, 'Sem token, token inválido ou sessão encerrada (NAO_AUTENTICADO)')
  @ApiProblema(403, 'Não é administrador (ACESSO_NEGADO)')
  @ZodSerializerDto(GestaoDto)
  painelDeGestao(@Query() consulta: ConsultaGestaoDto): Promise<GestaoDto> {
    return this.gestao.painel(consulta.periodo);
  }
}
