import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RespostaProntidao } from '@solicitacoes/contracts';
import type { Response } from 'express';
import { VerificadorBanco } from './verificador-banco';

@ApiTags('saúde')
@Controller('health')
export class HealthController {
  constructor(private readonly banco: VerificadorBanco) {}

  @Get('live')
  @ApiOperation({ summary: 'O processo está de pé (liveness)' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'A API consegue atender, com banco acessível (readiness)' })
  async ready(@Res({ passthrough: true }) resposta: Response): Promise<RespostaProntidao> {
    const database = await this.banco.verificar();
    const pronta = database === 'up';
    resposta.status(pronta ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: pronta ? 'ok' : 'error', details: { database: { status: database } } };
  }
}
