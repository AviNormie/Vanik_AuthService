// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { FirebaseAuthGuard } from './guards/firebase-auth.guard';
import { Farmer } from '../farmers/entities/farmer.entity';
import { UserSession } from './entities/user-session.entity';
import { FirebaseModule } from '../firebase/firebase.module'; // Import FirebaseModule

@Module({
  imports: [
    TypeOrmModule.forFeature([Farmer, UserSession]),
    PassportModule.register({ defaultStrategy: 'firebase-custom' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'agricultural-platform-secret',
        signOptions: { 
          expiresIn: '7d',
          issuer: 'agricultural-platform'
        },
      }),
    }),
    FirebaseModule, // Make sure FirebaseModule is imported
  ],
  controllers: [AuthController],
  providers: [
    AuthService, 
    FirebaseAuthGuard
  ],
  exports: [AuthService, FirebaseAuthGuard],
})
export class AuthModule {}
