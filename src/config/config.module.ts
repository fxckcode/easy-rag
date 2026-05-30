import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { CONFIG_TOKEN } from './config.constants';
import { ConfigService } from './config.service';

@Global()
@Module({
  imports: [NestConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' })],
  providers: [
    ConfigService,
    {
      provide: CONFIG_TOKEN,
      useFactory: () => ConfigService.parse(process.env),
    },
  ],
  exports: [ConfigService],
})
export class ConfigModule {}
