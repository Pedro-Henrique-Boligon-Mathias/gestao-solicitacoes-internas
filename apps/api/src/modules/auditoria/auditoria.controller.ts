import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { Cargos } from '../../common/decorators/cargos.decorator';
import { ApiProblema } from '../../openapi/respostas';
import { IntegridadeDto } from './auditoria.dto';
import { AuditoriaService } from './auditoria.service';

@ApiTags('auditoria')
@ApiBearerAuth('bearer')
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get('integridade')
  @Cargos('ADMIN')
  @ApiOperation({
    operationId: 'integridadeHistorico',
    summary:
      'Recalcula a corrente de hash do histórico de todas as solicitações e aponta as divergências',
  })
  @ApiOkResponse({ type: IntegridadeDto, description: 'Resultado da verificação' })
  @ApiProblema(401, 'Sem token, token inválido ou sessão encerrada (NAO_AUTENTICADO)')
  @ApiProblema(403, 'Não é administrador (ACESSO_NEGADO)')
  @ZodSerializerDto(IntegridadeDto)
  integridade(): Promise<IntegridadeDto> {
    return this.auditoria.verificarIntegridade();
  }
}
