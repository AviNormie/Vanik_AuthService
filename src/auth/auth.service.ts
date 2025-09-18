// src/auth/auth.service.ts - COMPLETE FIREBASE VERSION
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';

export interface CompleteProfileDto {
  name?: string;
  languagePref?: string;
  location?: string;
  gpsLat?: number;
  gpsLong?: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private firebaseService: FirebaseService,
  ) {}

  // ===== FIREBASE AUTHENTICATION METHODS =====

  /**
   * Verify Firebase ID token and create/update user in database
   */
  async verifyFirebaseToken(idToken: string, profileData?: CompleteProfileDto) {
    try {
      this.logger.log(`🔥 Starting Firebase token verification`);

      // 1. Verify Firebase ID token
      const decodedToken = await this.firebaseService.verifyIdToken(idToken);
      
      if (!decodedToken.phone_number) {
        throw new HttpException('Phone number not found in Firebase token', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`✅ Firebase token verified for phone: ${decodedToken.phone_number}`);

      // 2. Create or update user in database
      const { user, isNewUser } = await this.createOrUpdateFirebaseUser(
        decodedToken.phone_number,
        decodedToken.uid,
        profileData
      );

      // 3. Create session
      const session = await this.createSession(user.id);

      // 4. Log successful authentication
      await this.logActivity(user.id, 'FIREBASE_LOGIN', {
        source: 'FIREBASE_AUTH',
        firebaseUID: decodedToken.uid,
        isNewUser,
      });

      return {
        user,
        session,
        isNewUser,
        firebaseUID: decodedToken.uid,
      };

    } catch (error) {
      this.logger.error(`❌ Firebase token verification failed:`, error);
      throw new HttpException(
        error.message || 'Firebase authentication failed',
        error.status || HttpStatus.UNAUTHORIZED
      );
    }
  }

  /**
   * Create or update user from Firebase authentication
   */
  async createOrUpdateFirebaseUser(phoneNumber: string, firebaseUID: string, profileData?: CompleteProfileDto) {
    try {
      this.logger.log(`👤 Creating/updating Firebase user: ${phoneNumber}, UID: ${firebaseUID}`);

      // Check if user exists by phone number
      const existingUser = await this.prisma.$queryRaw`
        SELECT * FROM app_auth."User" 
        WHERE "phoneNumber" = ${phoneNumber}
        LIMIT 1
      ` as any[];

      let user: any;
      let isNewUser = false;

      if (!existingUser || existingUser.length === 0) {
        // Create new user
        isNewUser = true;
        const userId = this.generateId();
        
        // Insert user
        await this.prisma.$executeRaw`
          INSERT INTO app_auth."User" (id, "phoneNumber", name, role, "createdAt", "updatedAt")
          VALUES (${userId}, ${phoneNumber}, ${profileData?.name || null}, 'FARMER', NOW(), NOW())
        `;

        // Create credit balance
        const creditId = this.generateId();
        await this.prisma.$executeRaw`
          INSERT INTO app_auth."CreditBalance" (id, "userId", balance, currency)
          VALUES (${creditId}, ${userId}, 100, 'CREDITS')
        `;

        // Create farmer profile if data provided
        if (profileData && (profileData.name || profileData.location)) {
          const profileId = this.generateId();
          await this.prisma.$executeRaw`
            INSERT INTO app_auth."FarmerProfile" (id, "userId", "languagePref", location, "gpsLat", "gpsLong", "createdAt", "updatedAt")
            VALUES (${profileId}, ${userId}, ${profileData.languagePref || 'hi-IN'}, ${profileData.location || null}, ${profileData.gpsLat || null}, ${profileData.gpsLong || null}, NOW(), NOW())
          `;
        }

        user = { 
          id: userId, 
          phoneNumber, 
          name: profileData?.name || null, 
          role: 'FARMER',
          firebaseUID,
          isNewUser: true 
        };
        
        this.logger.log(`✅ New Firebase user created: ${phoneNumber}`);
      } else {
        // Update existing user
        user = existingUser[0];
        user.firebaseUID = firebaseUID;
        user.isNewUser = false;
        
        // Update name if provided and not already set
        if (profileData?.name && !user.name) {
          await this.prisma.$executeRaw`
            UPDATE app_auth."User" SET name = ${profileData.name}, "updatedAt" = NOW()
            WHERE id = ${user.id}
          `;
          user.name = profileData.name;
        }
        
        this.logger.log(`✅ Existing Firebase user found: ${phoneNumber}`);
      }

      return { user, isNewUser };
    } catch (error) {
      this.logger.error(`❌ Failed to create/update Firebase user ${phoneNumber}:`, error);
      throw new HttpException('Firebase user creation/update failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  generateSessionToken(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  async createSession(userId: string) {
    try {
      const sessionToken = this.generateSessionToken();
      const sessionId = this.generateId();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await this.prisma.$executeRaw`
        INSERT INTO app_auth."Session" (id, "userId", "sessionToken", expires, "createdAt")
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
        SELECT s.*, u.* FROM app_auth."Session" s 
        JOIN app_auth."User" u ON s."userId" = u.id 
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
        DELETE FROM app_auth."Session" WHERE "sessionToken" = ${sessionToken}
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
        SELECT u.*, fp.* FROM app_auth."User" u 
        LEFT JOIN app_auth."FarmerProfile" fp ON u.id = fp."userId"
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
          UPDATE app_auth."User" SET name = ${profileData.name}, "updatedAt" = NOW()
          WHERE id = ${userId}
        `;
      }

      const existingProfile = await this.prisma.$queryRaw`
        SELECT * FROM app_auth."FarmerProfile" WHERE "userId" = ${userId} LIMIT 1
      ` as any[];

      if (!existingProfile || existingProfile.length === 0) {
        const profileId = this.generateId();
        await this.prisma.$executeRaw`
          INSERT INTO app_auth."FarmerProfile" (id, "userId", "languagePref", location, "gpsLat", "gpsLong", "createdAt", "updatedAt")
          VALUES (${profileId}, ${userId}, ${profileData.languagePref || 'hi-IN'}, ${profileData.location || null}, ${profileData.gpsLat || null}, ${profileData.gpsLong || null}, NOW(), NOW())
        `;
      } else {
        await this.prisma.$executeRaw`
          UPDATE app_auth."FarmerProfile" 
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

  // ===== UTILITY METHODS =====

  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2);
    return `clx${timestamp}${randomPart}`;
  }

  async logActivity(userId: string, action: string, metadata?: any) {
    try {
      const logId = this.generateId();
      await this.prisma.$executeRaw`
        INSERT INTO app_auth."ActivityLog" (id, "userId", action, metadata, "createdAt")
        VALUES (${logId}, ${userId}, ${action}, ${JSON.stringify(metadata)}, NOW())
      `;
    } catch (error) {
      this.logger.error(`❌ Failed to log activity for user ${userId}:`, error);
    }
  }

  async hasSufficientCredits(userId: string, requiredAmount: number): Promise<boolean> {
    try {
      const credits = await this.prisma.$queryRaw`
        SELECT balance FROM app_auth."CreditBalance" WHERE "userId" = ${userId}
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

  // ===== DEBUG METHODS =====

  getDebugInfo() {
    return {
      timestamp: new Date().toISOString(),
      service: 'Firebase + OTP Auth Service',
    };
  }

  async getAppStats() {
    try {
      const totalUsers = await this.prisma.$queryRaw`SELECT COUNT(*) as count FROM app_auth."User"` as any[];
      const activeSessions = await this.prisma.$queryRaw`SELECT COUNT(*) as count FROM app_auth."Session" WHERE expires > NOW()` as any[];
      const totalCredits = await this.prisma.$queryRaw`SELECT SUM(balance) as total FROM app_auth."CreditBalance"` as any[];

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
}
