// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtService } from './jwt.service';
import { FirebaseModule } from '../firebase/firebase.module'; 
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-super-secret-jwt-key-change-in-production',
        signOptions: { 
          expiresIn: '7d',
          issuer: 'agro-auth-service',
          audience: 'agro-frontend'
        },
      }),
    }),
    FirebaseModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtService,
    PrismaService
  ],
  exports: [AuthService, JwtService, PrismaService],
})
export class AuthModule {}
