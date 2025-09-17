// src/app.module.ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WinstonModule } from 'nest-winston';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FirebaseModule } from './firebase/firebase.module'
import { FarmersModule } from './farmers/farmers.module';
import * as winston from 'winston';
import { join } from 'path';
import { mkdirSync } from 'fs';

// Ensure logs directory exists
try {
  mkdirSync('logs', { recursive: true });
} catch (error) {
  // Directory already exists
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, context }) => {
              return `${timestamp} [${context}] ${level}: ${message}`;
            }),
          ),
        }),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      ],
    }),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'agricultural_platform.db',
      entities: [join(__dirname, '**', '*.entity.{ts,js}')],
      synchronize: true, // Only for development
      logging: true, // Log SQL queries
    }),
    FirebaseModule,
    AuthModule,
    FarmersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
