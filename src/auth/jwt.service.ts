// src/auth/jwt.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';
import { SignOptions } from 'jsonwebtoken';

export interface JwtPayload {
  sub: string; // user ID
  phoneNumber: string;
  role: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtService {
  private readonly logger = new Logger(JwtService.name);
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
  private readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d' as string;

  constructor(private nestJwtService: NestJwtService) {}

  /**
   * Generate JWT token for user
   */
  generateToken(userId: string, phoneNumber: string, role: string = 'FARMER'): string {
    const payload: JwtPayload = {
      sub: userId,
      phoneNumber,
      role,
    };

    this.logger.log(`🔑 Generating JWT token for user: ${userId}`);

    const options: SignOptions = {
      expiresIn: '7d',
      issuer: 'agro-auth-service',
      audience: 'agro-frontend',
    };

    return jwt.sign(payload, this.JWT_SECRET, options);
  }

  /**
   * Verify and decode JWT token
   */
  verifyToken(token: string): JwtPayload {
    try {
      this.logger.log(`🔍 Verifying JWT token`);
      
      const decoded = jwt.verify(token, this.JWT_SECRET, {
        issuer: 'agro-auth-service',
        audience: 'agro-frontend',
      }) as JwtPayload;

      this.logger.log(`✅ JWT token verified for user: ${decoded.sub}`);
      return decoded;
    } catch (error) {
      this.logger.error(`❌ JWT token verification failed:`, error.message);
      throw new Error(`Invalid token: ${error.message}`);
    }
  }

  /**
   * Decode JWT token without verification (for debugging)
   */
  decodeToken(token: string): JwtPayload | null {
    try {
      return jwt.decode(token) as JwtPayload;
    } catch (error) {
      this.logger.error(`❌ JWT token decode failed:`, error.message);
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) return true;
      
      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp < currentTime;
    } catch (error) {
      return true;
    }
  }

  /**
   * Get token expiration date
   */
  getTokenExpiration(token: string): Date | null {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) return null;
      
      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  /**
   * Refresh token (generate new token with same payload)
   */
  refreshToken(oldToken: string): string {
    try {
      const decoded = this.verifyToken(oldToken);
      return this.generateToken(decoded.sub, decoded.phoneNumber, decoded.role);
    } catch (error) {
      throw new Error(`Cannot refresh token: ${error.message}`);
    }
  }
}