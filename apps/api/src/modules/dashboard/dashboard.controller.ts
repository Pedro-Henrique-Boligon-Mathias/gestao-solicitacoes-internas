import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import type { UsuarioAutenticado } from '../../common/context/usuario-autenticado';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { ApiProblema } from '../../openapi/respostas';
import { ResumoDto } from './dashboard.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth('bearer')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('resumo')
  @ApiOperation({
    operationId: 'resumoDashboard',
    summary: 'Totais por status e prioridade no escopo do usuário',
  })
  @ApiOkResponse({ type: ResumoDto, description: 'Indicadores' })
  @ApiProblema(401, 'Sem token, token inválido ou sessão encerrada (NAO_AUTENTICADO)')
  @ZodSerializerDto(ResumoDto)
  resumo(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<ResumoDto> {
    return this.dashboard.resumo(usuario.cargo);
  }
}
