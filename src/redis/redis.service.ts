// src/redis/redis.service.ts
import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

interface OtpData {
  otp: string;
  expiresAt: number;
  verified: boolean;
  attempts: number;
  createdAt: number;
}

@Injectable()
export class RedisService {
  private redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  async setOtpData(mobile: string, otpData: OtpData) {
    await this.redis.setex(
      `otp:${mobile}`, 
      600, // 10 minutes TTL
      JSON.stringify(otpData)
    );
  }

  async getOtpData(mobile: string): Promise<OtpData | null> {
    const data = await this.redis.get(`otp:${mobile}`);
    return data ? JSON.parse(data) : null;
  }

  async deleteOtp(mobile: string) {
    await this.redis.del(`otp:${mobile}`);
  }

  // For blacklisting tokens
  async blacklistToken(token: string, expiryTime: number) {
    await this.redis.setex(`blacklist:${token}`, expiryTime, '1');
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    return await this.redis.exists(`blacklist:${token}`) === 1;
  }
}
