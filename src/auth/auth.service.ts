// src/auth/auth.service.ts - JWT VERSION
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import { JwtService } from './jwt.service';

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
    private jwtService: JwtService,
  ) {}

  // ===== FIREBASE AUTHENTICATION METHODS =====

  /**
   * Verify Firebase ID token and create/update user in database
   */
  async verifyFirebaseToken(idToken: string, profileData?: CompleteProfileDto) {
    try {
      this.logger.log(`🔥 Starting Firebase token verification`);
      this.logger.log(`🎫 Token length: ${idToken?.length || 0}`);

      // 1. Verify Firebase ID token
      this.logger.log('🔄 Calling Firebase verifyIdToken...');
      const decodedToken = await this.firebaseService.verifyIdToken(idToken);
      
      this.logger.log('✅ Firebase token decoded successfully');
      this.logger.log(`📱 Decoded token phone: ${decodedToken.phone_number}`);
      this.logger.log(`🆔 Decoded token UID: ${decodedToken.uid}`);
      
      if (!decodedToken.phone_number) {
        this.logger.error('❌ No phone number in Firebase token');
        throw new HttpException('Phone number not found in Firebase token', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`✅ Firebase token verified for phone: ${decodedToken.phone_number}`);

      // 2. Create or update user in database
      this.logger.log('🔄 Creating/updating user in database...');
      const { user, isNewUser } = await this.createOrUpdateFirebaseUser(
        decodedToken.phone_number,
        decodedToken.uid,
        profileData
      );

      this.logger.log(`👤 User ${isNewUser ? 'created' : 'updated'}: ${user.id}`);

      // 3. Generate JWT token
      this.logger.log('🔄 Generating JWT token...');
      const jwtToken = this.jwtService.generateToken(user.id, user.phoneNumber, user.role);
      const tokenExpiration = this.jwtService.getTokenExpiration(jwtToken);

      this.logger.log(`🎫 JWT token generated: ${jwtToken ? 'YES' : 'NO'}`);
      this.logger.log(`⏰ Token expires: ${tokenExpiration}`);

      // 4. Log successful authentication
      this.logger.log('🔄 Logging activity...');
      await this.logActivity(user.id, 'FIREBASE_LOGIN', {
        source: 'FIREBASE_AUTH',
        firebaseUID: decodedToken.uid,
        isNewUser,
      });

      const result = {
        user,
        token: jwtToken,
        expires: tokenExpiration,
        isNewUser,
        firebaseUID: decodedToken.uid,
      };

      this.logger.log('✅ Firebase authentication completed successfully');
      return result;

    } catch (error) {
      this.logger.error(`❌ Firebase token verification failed:`, error.message);
      this.logger.error(`❌ Error details:`, error);
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


  /**
   * Validate JWT token and return user data
   */
  async validateJwtToken(token: string) {
    try {
      this.logger.log(`🔍 Validating JWT token`);
      
      // Verify and decode the JWT token
      const payload = this.jwtService.verifyToken(token);
      
      // Get user from database
      const users = await this.prisma.$queryRaw`
        SELECT * FROM app_auth."User" 
        WHERE id = ${payload.sub}
        LIMIT 1
      ` as any[];

      if (!users || users.length === 0) {
        throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
      }

      const user = users[0];
      this.logger.log(`✅ JWT token validated for user: ${user.phoneNumber}`);
      
      return {
        user,
        payload,
      };
    } catch (error) {
      this.logger.error(`❌ JWT token validation failed:`, error);
      throw new HttpException(
        error.message || 'Invalid token',
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  /**
   * Refresh JWT token
   */
  async refreshJwtToken(oldToken: string) {
    try {
      this.logger.log(`🔄 Refreshing JWT token`);
      
      const newToken = this.jwtService.refreshToken(oldToken);
      const tokenExpiration = this.jwtService.getTokenExpiration(newToken);
      
      return {
        token: newToken,
        expires: tokenExpiration,
      };
    } catch (error) {
      this.logger.error(`❌ JWT token refresh failed:`, error);
      throw new HttpException(
        'Token refresh failed',
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  // ===== PROFILE METHODS =====

  async getUserProfile(userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      const farmerProfile = await this.prisma.farmerProfile.findUnique({
        where: { userId }
      });

      // Combine user and farmer profile data
      return {
        ...user,
        ...farmerProfile
      };
    } catch (error) {
      this.logger.error(`❌ Failed to get user profile ${userId}:`, error);
      throw error;
    }
  }

  async updateUserProfile(userId: string, profileData: CompleteProfileDto) {
    try {
      this.logger.log(`📝 Updating profile for user: ${userId}`);

      // Update user name if provided
      if (profileData.name) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { 
            name: profileData.name,
            updatedAt: new Date()
          }
        });
      }

      // Check if farmer profile exists
      const existingProfile = await this.prisma.farmerProfile.findUnique({
        where: { userId }
      });

      const farmerProfileData = {
        languagePref: profileData.languagePref || 'hi-IN',
        location: profileData.location || null,
        gpsLat: profileData.gpsLat || null,
        gpsLong: profileData.gpsLong || null,
        updatedAt: new Date()
      };

      if (!existingProfile) {
        // Create new farmer profile
        await this.prisma.farmerProfile.create({
          data: {
            id: this.generateId(),
            userId,
            ...farmerProfileData,
            createdAt: new Date()
          }
        });
      } else {
        // Update existing farmer profile
        await this.prisma.farmerProfile.update({
          where: { userId },
          data: farmerProfileData
        });
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
      // Use Prisma client instead of raw SQL for proper JSON handling
      await this.prisma.activityLog.create({
        data: {
          id: logId,
          userId,
          action,
          metadata,
          createdAt: new Date(),
        },
      });
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
      const totalCredits = await this.prisma.$queryRaw`SELECT SUM(balance) as total FROM app_auth."CreditBalance"` as any[];

      return {
        totalUsers: Number(totalUsers[0]?.count || 0),
        totalCreditsIssued: Number(totalCredits[0]?.total || 0),
      };
    } catch (error) {
      this.logger.error('❌ Failed to get app stats:', error);
      return {
        totalUsers: 0,
        totalCreditsIssued: 0,
      };
    }
  }
}
