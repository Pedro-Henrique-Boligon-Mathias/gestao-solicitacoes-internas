import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { VerificadorBanco } from './verificador-banco';

@Module({
  controllers: [HealthController],
  providers: [VerificadorBanco],
})
export class HealthModule {}
