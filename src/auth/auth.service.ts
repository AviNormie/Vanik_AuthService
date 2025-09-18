// src/auth/auth.service.ts - EXPORT FIXED VERSION
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// In-memory OTP storage
const otpStore = new Map<string, { otp: string; expiresAt: Date }>();

export interface CompleteProfileDto {
  name?: string;
  languagePref?: string;
  location?: string;
  gpsLat?: number;
  gpsLong?: number;
}

export interface OTPDebugInfo {
  phoneNumber: string;
  otp: string;
  expiresAt: Date;
  isExpired: boolean;
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
      
      console.log(`🔑 OTP for ${phoneNumber}: ${otp}`);
      this.logger.log(`📱 OTP sent to ${phoneNumber}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send OTP to ${phoneNumber}:`, error);
      throw new HttpException('Failed to send OTP', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async verifyOTP(phoneNumber: string, otp: string): Promise<boolean> {
    try {
      const storedOTP = otpStore.get(phoneNumber);
      
      if (!storedOTP) {
        this.logger.warn(`❌ No OTP found for: ${phoneNumber}`);
        return false;
      }

      if (new Date() > storedOTP.expiresAt) {
        this.logger.warn(`⏰ OTP expired for: ${phoneNumber}`);
        otpStore.delete(phoneNumber);
        return false;
      }

      if (storedOTP.otp !== otp) {
        this.logger.warn(`❌ Invalid OTP for: ${phoneNumber}. Expected: ${storedOTP.otp}, Got: ${otp}`);
        return false;
      }

      otpStore.delete(phoneNumber);
      this.logger.log(`✅ OTP verified successfully for: ${phoneNumber}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ OTP verification error for ${phoneNumber}:`, error);
      return false;
    }
  }

  // ===== USER METHODS =====
  async createOrUpdateUser(phoneNumber: string, profileData?: CompleteProfileDto) {
    try {
      this.logger.log(`👤 Creating/updating user: ${phoneNumber}`);

      const existingUser = await this.prisma.$queryRaw`
        SELECT * FROM "User" WHERE "phoneNumber" = ${phoneNumber} LIMIT 1
      ` as any[];

      let user: any;
      let isNewUser = false;

      if (!existingUser || existingUser.length === 0) {
        isNewUser = true;
        const userId = this.generateId();
        
        await this.prisma.$executeRaw`
          INSERT INTO "User" (id, "phoneNumber", name, role, "createdAt", "updatedAt")
          VALUES (${userId}, ${phoneNumber}, ${profileData?.name || null}, 'FARMER', NOW(), NOW())
        `;

        const creditId = this.generateId();
        await this.prisma.$executeRaw`
          INSERT INTO "CreditBalance" (id, "userId", balance, currency)
          VALUES (${creditId}, ${userId}, 100, 'CREDITS')
        `;

        if (profileData && (profileData.name || profileData.location)) {
          const profileId = this.generateId();
          await this.prisma.$executeRaw`
            INSERT INTO "FarmerProfile" (id, "userId", "languagePref", location, "gpsLat", "gpsLong", "createdAt", "updatedAt")
            VALUES (${profileId}, ${userId}, ${profileData.languagePref || 'hi-IN'}, ${profileData.location || null}, ${profileData.gpsLat || null}, ${profileData.gpsLong || null}, NOW(), NOW())
          `;
        }

        const logId = this.generateId();
        await this.prisma.$executeRaw`
          INSERT INTO "ActivityLog" (id, "userId", action, metadata, "createdAt")
          VALUES (${logId}, ${userId}, 'USER_REGISTERED', '{"source": "OTP_VERIFICATION"}', NOW())
        `;

        user = { 
          id: userId, 
          phoneNumber, 
          name: profileData?.name || null, 
          role: 'FARMER',
          isNewUser: true 
        };
        this.logger.log(`✅ New user created: ${phoneNumber}`);
      } else {
        user = existingUser[0];
        user.isNewUser = false;
        this.logger.log(`✅ Existing user found: ${phoneNumber}`);
      }

      return { user, isNewUser };
    } catch (error) {
      this.logger.error(`❌ Failed to create/update user ${phoneNumber}:`, error);
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
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await this.prisma.$executeRaw`
        INSERT INTO "Session" (id, "userId", "sessionToken", expires, "createdAt")
        VALUES (${sessionId}, ${userId}, ${sessionToken}, ${expiresAt}, NOW())
      `;

      this.logger.log(`🔑 Session created for user: ${userId}`);

      return {
        id: sessionId,
        sessionToken,
        expires: expiresAt,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to create session for user ${userId}:`, error);
      throw new HttpException('Session creation failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async validateSession(sessionToken: string) {
    try {
      const sessions = await this.prisma.$queryRaw`
        SELECT s.*, u.* FROM "Session" s 
        JOIN "User" u ON s."userId" = u.id 
        WHERE s."sessionToken" = ${sessionToken} AND s.expires > NOW()
        LIMIT 1
      ` as any[];

      if (!sessions || sessions.length === 0) {
        return null;
      }

      return sessions[0];
    } catch (error) {
      this.logger.error('❌ Session validation failed:', error);
      return null;
    }
  }

  async logout(sessionToken: string): Promise<boolean> {
    try {
      await this.prisma.$executeRaw`
        DELETE FROM "Session" WHERE "sessionToken" = ${sessionToken}
      `;
      this.logger.log(`🚪 User logged out successfully`);
      return true;
    } catch (error) {
      this.logger.error('❌ Logout failed:', error);
      return false;
    }
  }

  // ===== PROFILE METHODS =====
  async getUserProfile(userId: string) {
    try {
      const users = await this.prisma.$queryRaw`
        SELECT u.*, fp.* FROM "User" u 
        LEFT JOIN "FarmerProfile" fp ON u.id = fp."userId"
        WHERE u.id = ${userId}
        LIMIT 1
      ` as any[];

      if (!users || users.length === 0) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      return users[0];
    } catch (error) {
      this.logger.error(`❌ Failed to get user profile ${userId}:`, error);
      throw error;
    }
  }

  async updateUserProfile(userId: string, profileData: CompleteProfileDto) {
    try {
      this.logger.log(`📝 Updating profile for user: ${userId}`);

      if (profileData.name) {
        await this.prisma.$executeRaw`
          UPDATE "User" SET name = ${profileData.name}, "updatedAt" = NOW()
          WHERE id = ${userId}
        `;
      }

      const existingProfile = await this.prisma.$queryRaw`
        SELECT * FROM "FarmerProfile" WHERE "userId" = ${userId} LIMIT 1
      ` as any[];

      if (!existingProfile || existingProfile.length === 0) {
        const profileId = this.generateId();
        await this.prisma.$executeRaw`
          INSERT INTO "FarmerProfile" (id, "userId", "languagePref", location, "gpsLat", "gpsLong", "createdAt", "updatedAt")
          VALUES (${profileId}, ${userId}, ${profileData.languagePref || 'hi-IN'}, ${profileData.location || null}, ${profileData.gpsLat || null}, ${profileData.gpsLong || null}, NOW(), NOW())
        `;
      } else {
        await this.prisma.$executeRaw`
          UPDATE "FarmerProfile" 
          SET "languagePref" = ${profileData.languagePref || 'hi-IN'},
              location = ${profileData.location || null},
              "gpsLat" = ${profileData.gpsLat || null},
              "gpsLong" = ${profileData.gpsLong || null},
              "updatedAt" = NOW()
          WHERE "userId" = ${userId}
        `;
      }

      this.logger.log(`✅ Profile updated for user: ${userId}`);
      return await this.getUserProfile(userId);
    } catch (error) {
      this.logger.error(`❌ Failed to update profile for user ${userId}:`, error);
      throw new HttpException('Profile update failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ===== CREDIT METHODS =====
  async hasSufficientCredits(userId: string, requiredAmount: number): Promise<boolean> {
    try {
      const credits = await this.prisma.$queryRaw`
        SELECT balance FROM "CreditBalance" WHERE "userId" = ${userId}
        LIMIT 1
      ` as any[];

      if (!credits || credits.length === 0) {
        return false;
      }

      return credits[0].balance >= requiredAmount;
    } catch (error) {
      this.logger.error(`❌ Failed to check credits for user ${userId}:`, error);
      return false;
    }
  }

  async updateCredits(userId: string, amount: number): Promise<boolean> {
    try {
      await this.prisma.$executeRaw`
        UPDATE "CreditBalance" 
        SET balance = balance + ${amount}
        WHERE "userId" = ${userId}
      `;
      
      this.logger.log(`💰 Credits updated for user ${userId}: ${amount > 0 ? '+' : ''}${amount}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to update credits for user ${userId}:`, error);
      return false;
    }
  }

  // ===== UTILITY METHODS =====
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2);
    return `clx${timestamp}${randomPart}`;
  }

  cleanupExpiredOTPs(): void {
    const now = new Date();
    let cleanedCount = 0;
    
    for (const [phoneNumber, otpData] of otpStore.entries()) {
      if (now > otpData.expiresAt) {
        otpStore.delete(phoneNumber);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      this.logger.log(`🧹 Cleaned up ${cleanedCount} expired OTPs`);
    }
  }

  // ===== DEBUG METHODS =====
  getDebugInfo() {
    const otps: any[] = [];
    
    for (const [phoneNumber, otpData] of otpStore.entries()) {
      otps.push({
        phoneNumber,
        otp: otpData.otp,
        expiresAt: otpData.expiresAt,
        isExpired: new Date() > otpData.expiresAt
      });
    }
    
    return {
      activeOTPs: otps.length,
      otps: otps
    };
  }

  async getAppStats() {
    try {
      const totalUsers = await this.prisma.$queryRaw`SELECT COUNT(*) as count FROM "User"` as any[];
      const activeSessions = await this.prisma.$queryRaw`SELECT COUNT(*) as count FROM "Session" WHERE expires > NOW()` as any[];
      const totalCredits = await this.prisma.$queryRaw`SELECT SUM(balance) as total FROM "CreditBalance"` as any[];

      return {
        totalUsers: Number(totalUsers[0]?.count || 0),
        activeSessions: Number(activeSessions[0]?.count || 0),
        totalCreditsIssued: Number(totalCredits[0]?.total || 0),
      };
    } catch (error) {
      this.logger.error('❌ Failed to get app stats:', error);
      return {
        totalUsers: 0,
        activeSessions: 0,
        totalCreditsIssued: 0,
      };
    }
  }

  // ===== ADDITIONAL HELPER METHODS =====
  async getAllUsers(limit: number = 50) {
    try {
      const users = await this.prisma.$queryRaw`
        SELECT u.*, fp.location, fp."languagePref", cb.balance as credits
        FROM "User" u 
        LEFT JOIN "FarmerProfile" fp ON u.id = fp."userId"
        LEFT JOIN "CreditBalance" cb ON u.id = cb."userId"
        ORDER BY u."createdAt" DESC
        LIMIT ${limit}
      ` as any[];

      return users;
    } catch (error) {
      this.logger.error('❌ Failed to get all users:', error);
      return [];
    }
  }

  async deleteUser(userId: string): Promise<boolean> {
    try {
      await this.prisma.$executeRaw`DELETE FROM "ActivityLog" WHERE "userId" = ${userId}`;
      await this.prisma.$executeRaw`DELETE FROM "Session" WHERE "userId" = ${userId}`;
      await this.prisma.$executeRaw`DELETE FROM "FarmerProfile" WHERE "userId" = ${userId}`;
      await this.prisma.$executeRaw`DELETE FROM "CreditBalance" WHERE "userId" = ${userId}`;
      await this.prisma.$executeRaw`DELETE FROM "User" WHERE id = ${userId}`;

      this.logger.log(`🗑️ User deleted: ${userId}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to delete user ${userId}:`, error);
      return false;
    }
  }
}
