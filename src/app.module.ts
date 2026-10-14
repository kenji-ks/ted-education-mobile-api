
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { createRateLimitConfig } from './common/config/rate-limit.config';
import { AppLoggerService } from './common/logging/logger.service';
import { EducationModule } from './education/education.module';
import { HealthModule } from './health/health.module';
import { ObserveModule } from './observe';
import { ResourcesModule } from './resources/resources.module';
import { TreatmentsModule } from './treatments/treatments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env.local',
    }),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createRateLimitConfig,
    }),

    ObserveModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        appKey: config.getOrThrow<string>('OBSERVE_APP_KEY'),
        appSecret: config.getOrThrow<string>('OBSERVE_APP_SECRET'),
        serviceId: 'ted-education-mobile-api',
      }),
    }),

    HealthModule,
    EducationModule,
    TreatmentsModule,
    ResourcesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AppLoggerService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
