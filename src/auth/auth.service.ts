// src/auth/auth.service.ts - DEPLOYMENT READY VERSION
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// In-memory OTP storage (use Redis in production)
const otpStore = new Map<string, { otp: string; expiresAt: Date }>();

interface CompleteProfileDto {
  name?: string;
  languagePref?: string;
  location?: string;
  gpsLat?: number;
  gpsLong?: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private prisma: PrismaService) {}

  // ===== OTP METHODS =====
  async sendOTP(phoneNumber: string): Promise<void> {
    try {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      
      otpStore.set(phoneNumber, { otp, expiresAt });
      
      // For hackathon: Log OTP (in production: send SMS)
      console.log(`🔑 OTP for ${phoneNumber}: ${otp}`);
      this.logger.log(`OTP sent to ${phoneNumber}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP to ${phoneNumber}:`, error);
      throw new HttpException('Failed to send OTP', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async verifyOTP(phoneNumber: string, otp: string): Promise<boolean> {
    try {
      const storedOTP = otpStore.get(phoneNumber);
      
      if (!storedOTP) {
        this.logger.warn(`No OTP found for: ${phoneNumber}`);
        return false;
      }

      if (new Date() > storedOTP.expiresAt) {
        this.logger.warn(`OTP expired for: ${phoneNumber}`);
        otpStore.delete(phoneNumber);
        return false;
      }

      if (storedOTP.otp !== otp) {
        this.logger.warn(`Invalid OTP for: ${phoneNumber}`);
        return false;
      }

      otpStore.delete(phoneNumber);
      this.logger.log(`OTP verified successfully for: ${phoneNumber}`);
      return true;
    } catch (error) {
      this.logger.error(`OTP verification error for ${phoneNumber}:`, error);
      return false;
    }
  }

  // ===== USER METHODS =====
  async createOrUpdateUser(phoneNumber: string, profileData?: CompleteProfileDto) {
    try {
      this.logger.log(`Creating/updating user: ${phoneNumber}`);

      // Use direct Prisma queries to avoid type issues
      const existingUser = await this.prisma.$queryRaw`
        SELECT * FROM "User" WHERE "phoneNumber" = ${phoneNumber}
      `;

      let user;
      let isNewUser = false;

      if (!existingUser || (existingUser as any[]).length === 0) {
        // Create new user
        isNewUser = true;
        const userId = this.generateId();
        
        await this.prisma.$executeRaw`
          INSERT INTO "User" (id, "phoneNumber", name, role, "createdAt", "updatedAt")
          VALUES (${userId}, ${phoneNumber}, ${profileData?.name || null}, 'FARMER', NOW(), NOW())
        `;

        // Create credit balance
        const creditId = this.generateId();
        await this.prisma.$executeRaw`
          INSERT INTO "CreditBalance" (id, "userId", balance, currency)
          VALUES (${creditId}, ${userId}, 100, 'CREDITS')
        `;

        // Create farmer profile if data provided
        if (profileData) {
          const profileId = this.generateId();
          await this.prisma.$executeRaw`
            INSERT INTO "FarmerProfile" (id, "userId", "languagePref", location, "gpsLat", "gpsLong", "createdAt", "updatedAt")
            VALUES (${profileId}, ${userId}, ${profileData.languagePref || 'hi-IN'}, ${profileData.location || null}, ${profileData.gpsLat || null}, ${profileData.gpsLong || null}, NOW(), NOW())
          `;
        }

        // Log activity
        const logId = this.generateId();
        await this.prisma.$executeRaw`
          INSERT INTO "ActivityLog" (id, "userId", action, metadata, "createdAt")
          VALUES (${logId}, ${userId}, 'USER_REGISTERED', '{"source": "OTP_VERIFICATION"}', NOW())
        `;

        user = { id: userId, phoneNumber, name: profileData?.name || null, isNewUser: true };
        this.logger.log(`New user created: ${phoneNumber}`);
      } else {
        user = (existingUser as any[])[0];
        user.isNewUser = false;
        this.logger.log(`Existing user found: ${phoneNumber}`);
      }

      return { user, isNewUser };
    } catch (error) {
      this.logger.error(`Failed to create/update user ${phoneNumber}:`, error);
      throw new HttpException('User creation/update failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ===== SESSION METHODS =====
  generateSessionToken(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  async createSession(userId: string) {
    try {
      const sessionToken = this.generateSessionToken();
      const sessionId = this.generateId();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await this.prisma.$executeRaw`
        INSERT INTO "Session" (id, "userId", "sessionToken", expires, "createdAt")
        VALUES (${sessionId}, ${userId}, ${sessionToken}, ${expiresAt}, NOW())
      `;

      return {
        id: sessionId,
        sessionToken,
        expires: expiresAt,
      };
    } catch (error) {
      this.logger.error(`Failed to create session for user ${userId}:`, error);
      throw new HttpException('Session creation failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async validateSession(sessionToken: string) {
    try {
      const sessions = await this.prisma.$queryRaw`
        SELECT s.*, u.* FROM "Session" s 
        JOIN "User" u ON s."userId" = u.id 
        WHERE s."sessionToken" = ${sessionToken} AND s.expires > NOW()
      `;

      if (!sessions || (sessions as any[]).length === 0) {
        return null;
      }

      return (sessions as any[])[0];
    } catch (error) {
      this.logger.error('Session validation failed:', error);
      return null;
    }
  }

  async logout(sessionToken: string): Promise<boolean> {
    try {
      await this.prisma.$executeRaw`
        DELETE FROM "Session" WHERE "sessionToken" = ${sessionToken}
      `;
      return true;
    } catch (error) {
      this.logger.error('Logout failed:', error);
      return false;
    }
  }

  // ===== UTILITY METHODS =====
  private generateId(): string {
    // Simple ID generation (use proper UUID in production)
    return 'clx' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  cleanupExpiredOTPs(): void {
    const now = new Date();
    for (const [phoneNumber, otpData] of otpStore.entries()) {
      if (now > otpData.expiresAt) {
        otpStore.delete(phoneNumber);
      }
    }
    this.logger.log('Cleaned up expired OTPs');
  }

  // ===== DUMMY METHODS FOR COMPATIBILITY =====
  async getUserProfile(userId: string) {
    try {
      const users = await this.prisma.$queryRaw`
        SELECT u.*, fp.* FROM "User" u 
        LEFT JOIN "FarmerProfile" fp ON u.id = fp."userId"
        WHERE u.id = ${userId}
      `;

      if (!users || (users as any[]).length === 0) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      return (users as any[])[0];
    } catch (error) {
      this.logger.error(`Failed to get user profile ${userId}:`, error);
      throw error;
    }
  }

  async hasSufficientCredits(userId: string, requiredAmount: number): Promise<boolean> {
    try {
      const credits = await this.prisma.$queryRaw`
        SELECT balance FROM "CreditBalance" WHERE "userId" = ${userId}
      `;

      if (!credits || (credits as any[]).length === 0) {
        return false;
      }

      return (credits as any[])[0].balance >= requiredAmount;
    } catch (error) {
      this.logger.error(`Failed to check credits for user ${userId}:`, error);
      return false;
    }
  }
}
