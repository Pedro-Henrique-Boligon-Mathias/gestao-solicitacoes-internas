import { Module } from '@nestjs/common';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaService } from './auditoria.service';
import { ConsultasAuditoria } from './infra/consultas-auditoria';

@Module({
  controllers: [AuditoriaController],
  providers: [AuditoriaService, ConsultasAuditoria],
})
export class AuditoriaModule {}
