// src/auth/auth.service.ts - JWT VERSION
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import { JwtService } from './jwt.service';

export interface CompleteProfileDto {
  // Common fields
  name?: string;
  languagePref?: string;
  location?: string;
  gpsLat?: number;
  gpsLong?: number;
  
  // Farmer-specific fields
  village?: string;
  district?: string;
  state?: string;
  farmSize?: string;
  cropTypes?: string;
  experience?: string;
  landOwnership?: string; // 'OWNED' | 'LEASED' | 'SHARED'
  irrigationType?: string; // 'RAIN_FED' | 'IRRIGATED' | 'MIXED'
  
  // Retailer-specific fields
  businessName?: string;
  ownerName?: string;
  businessType?: string; // 'WHOLESALE' | 'RETAIL' | 'BOTH'
  address?: string;
  city?: string;
  pincode?: string;
  gstNumber?: string;
  licenseNumber?: string;
  specialization?: string;
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

      // Get user to determine role
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Update user name if provided
      if (profileData.name || profileData.ownerName) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { 
            name: profileData.name || profileData.ownerName,
            updatedAt: new Date()
          }
        });
      }

      if (user.role === 'FARMER') {
        // Handle farmer profile
        const existingFarmerProfile = await this.prisma.farmerProfile.findUnique({
          where: { userId }
        });

        const farmerProfileData = {
          name: profileData.name,
          village: profileData.village,
          state: profileData.state,
          farmSize: profileData.farmSize,
          cropTypes: profileData.cropTypes,
          experience: profileData.experience,
          landOwnership: profileData.landOwnership,
          irrigationType: profileData.irrigationType,
          languagePref: profileData.languagePref || 'hindi',
          location: profileData.location,
          gpsLat: profileData.gpsLat,
          gpsLong: profileData.gpsLong,
          updatedAt: new Date()
        };

        if (!existingFarmerProfile) {
          await this.prisma.farmerProfile.create({
            data: {
              id: this.generateId(),
              userId,
              ...farmerProfileData,
              createdAt: new Date()
            }
          });
        } else {
          await this.prisma.farmerProfile.update({
            where: { userId },
            data: farmerProfileData
          });
        }
      } else if (user.role === 'RETAILER') {
        // Handle retailer profile - use raw SQL since retailerProfile might not exist in generated types
        const existingRetailerProfile = await this.prisma.$queryRaw`
          SELECT * FROM app_auth."RetailerProfile" WHERE "userId" = ${userId} LIMIT 1
        ` as any[];

        const retailerProfileData = {
          businessName: profileData.businessName,
          ownerName: profileData.ownerName,
          businessType: profileData.businessType,
          address: profileData.address,
          city: profileData.city,
          state: profileData.state,
          pincode: profileData.pincode,
          gstNumber: profileData.gstNumber,
          licenseNumber: profileData.licenseNumber,
          experience: profileData.experience,
          specialization: profileData.specialization,
          languagePref: profileData.languagePref || 'hindi',
        };

        if (!existingRetailerProfile || existingRetailerProfile.length === 0) {
          const profileId = this.generateId();
          await this.prisma.$executeRaw`
            INSERT INTO app_auth."RetailerProfile" (
              id, "userId", "businessName", "ownerName", "businessType", 
              address, city, state, pincode, "gstNumber", "licenseNumber", 
              experience, specialization, "languagePref", "createdAt", "updatedAt"
            )
            VALUES (
              ${profileId}, ${userId}, ${retailerProfileData.businessName}, 
              ${retailerProfileData.ownerName}, ${retailerProfileData.businessType}, 
              ${retailerProfileData.address}, ${retailerProfileData.city}, 
              ${retailerProfileData.state}, ${retailerProfileData.pincode}, 
              ${retailerProfileData.gstNumber}, ${retailerProfileData.licenseNumber}, 
              ${retailerProfileData.experience}, ${retailerProfileData.specialization}, 
              ${retailerProfileData.languagePref}, NOW(), NOW()
            )
          `;
        } else {
          await this.prisma.$executeRaw`
            UPDATE app_auth."RetailerProfile" SET
              "businessName" = ${retailerProfileData.businessName},
              "ownerName" = ${retailerProfileData.ownerName},
              "businessType" = ${retailerProfileData.businessType},
              address = ${retailerProfileData.address},
              city = ${retailerProfileData.city},
              state = ${retailerProfileData.state},
              pincode = ${retailerProfileData.pincode},
              "gstNumber" = ${retailerProfileData.gstNumber},
              "licenseNumber" = ${retailerProfileData.licenseNumber},
              experience = ${retailerProfileData.experience},
              specialization = ${retailerProfileData.specialization},
              "languagePref" = ${retailerProfileData.languagePref},
              "updatedAt" = NOW()
            WHERE "userId" = ${userId}
          `;
        }
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

  /**
   * Get all users with their profile data
   */
  async getAllUsers() {
    try {
      this.logger.log('📋 Fetching all users from database');
      
      const users = await this.prisma.$queryRaw`
        SELECT 
          u.id,
          u."phoneNumber",
          u.name,
          u.role,
          u."createdAt",
          u."updatedAt",
          fp."languagePref",
          fp.location,
          fp."gpsLat",
          fp."gpsLong",
          cb.balance as credit_balance
        FROM app_auth."User" u
        LEFT JOIN app_auth."FarmerProfile" fp ON u.id = fp."userId"
        LEFT JOIN app_auth."CreditBalance" cb ON u.id = cb."userId"
        ORDER BY u."createdAt" DESC
      `;
      
      this.logger.log(`✅ Retrieved ${(users as any[]).length} users`);
      return users;
    } catch (error) {
      this.logger.error('❌ Error fetching all users:', error);
      throw new HttpException('Failed to fetch users', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Delete all users and related data (DANGEROUS - use with caution)
   */
  async deleteAllUsers() {
    try {
      this.logger.warn('⚠️ DANGER: Deleting ALL users and related data');
      
      // Delete in correct order to respect foreign key constraints
      await this.prisma.$executeRaw`DELETE FROM app_auth."FarmerProfile"`;
      await this.prisma.$executeRaw`DELETE FROM app_auth."RetailerProfile"`;
      await this.prisma.$executeRaw`DELETE FROM app_auth."CreditBalance"`;
      await this.prisma.$executeRaw`DELETE FROM app_auth."ActivityLog"`;
      await this.prisma.$executeRaw`DELETE FROM app_auth."User"`;
      
      this.logger.log('✅ All users and related data deleted successfully');
      return {
        success: true,
        message: 'All users and related data deleted successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('❌ Error deleting all users:', error);
      throw new HttpException('Failed to delete all users', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get user information by ID (works for both farmers and retailers)
   */
  async getUserById(userId: string): Promise<any> {
    this.logger.log(`🔍 Fetching user information for ID: ${userId}`);
    
    try {
      // First get the user to determine role
      const baseUser = await this.prisma.user.findUnique({
        where: { id: userId }
      });
      
      if (!baseUser) {
        this.logger.warn(`⚠️ User not found with ID: ${userId}`);
        return null;
      }
      
      let profileData = null;
      
      if (baseUser.role === 'FARMER') {
        // Fetch farmer profile with all fields
        const result = await this.prisma.$queryRaw`
          SELECT 
            u.id,
            u."phoneNumber",
            u.name,
            u.role,
            u."createdAt",
            u."updatedAt",
            fp.id as "profileId",
            fp.name as "farmerName",
            fp.village,
            fp.state,
            fp."farmSize",
            fp."cropTypes",
            fp.experience,
            fp."landOwnership",
            fp."irrigationType",
            fp."languagePref",
            fp.location,
            fp."gpsLat",
            fp."gpsLong",
            fp."createdAt" as "profileCreatedAt",
            fp."updatedAt" as "profileUpdatedAt",
            cb.id as "creditBalanceId",
            cb.balance as "creditBalance",
            cb.currency as "creditCurrency",
            al.id as "lastActivityId",
            al.action as "lastActivity",
            al."createdAt" as "lastActivityAt"
          FROM app_auth."User" u
          LEFT JOIN app_auth."FarmerProfile" fp ON u.id = fp."userId"
          LEFT JOIN app_auth."CreditBalance" cb ON u.id = cb."userId"
          LEFT JOIN app_auth."ActivityLog" al ON u.id = al."userId"
          WHERE u.id = ${userId}
          ORDER BY al."createdAt" DESC
          LIMIT 1
        `;
        profileData = (result as any[])[0];
      } else if (baseUser.role === 'RETAILER') {
        // Fetch retailer profile with all fields
        const result = await this.prisma.$queryRaw`
          SELECT 
            u.id,
            u."phoneNumber",
            u.name,
            u.role,
            u."createdAt",
            u."updatedAt",
            rp.id as "profileId",
            rp."businessName",
            rp."ownerName",
            rp."businessType",
            rp.address,
            rp.city,
            rp.state,
            rp.pincode,
            rp."gstNumber",
            rp."licenseNumber",
            rp.experience,
            rp.specialization,
            rp."languagePref",
            rp."createdAt" as "profileCreatedAt",
            rp."updatedAt" as "profileUpdatedAt",
            cb.id as "creditBalanceId",
            cb.balance as "creditBalance",
            cb.currency as "creditCurrency",
            al.id as "lastActivityId",
            al.action as "lastActivity",
            al."createdAt" as "lastActivityAt"
          FROM app_auth."User" u
          LEFT JOIN app_auth."RetailerProfile" rp ON u.id = rp."userId"
          LEFT JOIN app_auth."CreditBalance" cb ON u.id = cb."userId"
          LEFT JOIN app_auth."ActivityLog" al ON u.id = al."userId"
          WHERE u.id = ${userId}
          ORDER BY al."createdAt" DESC
          LIMIT 1
        `;
        profileData = (result as any[])[0];
      } else {
        // For users without specific role, just return basic info
        const result = await this.prisma.$queryRaw`
          SELECT 
            u.id,
            u."phoneNumber",
            u.name,
            u.role,
            u."createdAt",
            u."updatedAt",
            cb.id as "creditBalanceId",
            cb.balance as "creditBalance",
            cb.currency as "creditCurrency",
            al.id as "lastActivityId",
            al.action as "lastActivity",
            al."createdAt" as "lastActivityAt"
          FROM app_auth."User" u
          LEFT JOIN app_auth."CreditBalance" cb ON u.id = cb."userId"
          LEFT JOIN app_auth."ActivityLog" al ON u.id = al."userId"
          WHERE u.id = ${userId}
          ORDER BY al."createdAt" DESC
          LIMIT 1
        `;
        profileData = (result as any[])[0];
      }
      
      this.logger.log(`✅ User information retrieved successfully for ID: ${userId}`);
      return profileData;
    } catch (error) {
      this.logger.error(`❌ Error fetching user by ID ${userId}:`, error);
      throw error;
    }
  }

  async createTestUser(testUserData: {
    phoneNumber: string;
    name: string;
    village?: string;
    district?: string;
    state?: string;
    language?: string;
    role?: string;
    // Additional fields for comprehensive testing
    farmSize?: string;
    cropTypes?: string;
    experience?: string;
    landOwnership?: string;
    irrigationType?: string;
    businessName?: string;
    businessType?: string;
    address?: string;
    city?: string;
    pincode?: string;
    gstNumber?: string;
    licenseNumber?: string;
    specialization?: string;
  }): Promise<any> {
    this.logger.log('🧪 Creating test user for form data verification');
    
    try {
      const userRole = testUserData.role || 'FARMER';
      
      // Create user
      const user = await this.prisma.user.create({
        data: {
          phoneNumber: testUserData.phoneNumber,
          name: testUserData.name,
          role: userRole
        }
      });
      
      if (userRole === 'FARMER') {
        // Create farmer profile with comprehensive data - removed district field
        const locationString = [testUserData.village, testUserData.district, testUserData.state]
          .filter(Boolean)
          .join(', ');
        
        await this.prisma.farmerProfile.create({
           data: {
             userId: user.id,
             location: locationString || testUserData.village || null,
             state: testUserData.state || '',
             farmSize: testUserData.farmSize || '1-2 acres',
             cropTypes: testUserData.cropTypes || 'Rice, Wheat',
             experience: testUserData.experience || '5-10 years', 
             landOwnership: testUserData.landOwnership as 'OWNED' | 'LEASED' | 'SHARED' || 'OWNED',
             irrigationType: testUserData.irrigationType as 'RAIN_FED' | 'IRRIGATED' | 'MIXED' || 'IRRIGATED',
             languagePref: testUserData.language || 'hi-IN',
           },
         });
      } else if (userRole === 'RETAILER') {
        // Create retailer profile with comprehensive data using raw SQL
        const profileId = this.generateId();
        await this.prisma.$executeRaw`
          INSERT INTO app_auth."RetailerProfile" (
            id, "userId", "businessName", "ownerName", "businessType", 
            address, city, state, pincode, "gstNumber", "licenseNumber", 
            experience, specialization, "languagePref", "createdAt", "updatedAt"
          )
          VALUES (
            ${profileId}, ${user.id}, ${testUserData.businessName || 'Test Agro Business'}, 
            ${testUserData.name}, ${testUserData.businessType || 'RETAIL'}, 
            ${testUserData.address || 'Test Address'}, ${testUserData.city || 'Test City'}, 
            ${testUserData.state || 'Test State'}, ${testUserData.pincode || '123456'}, 
            ${testUserData.gstNumber || 'TEST123456789'}, ${testUserData.licenseNumber || 'LIC123456'}, 
            ${testUserData.experience || '3-5 years'}, ${testUserData.specialization || 'Seeds and Fertilizers'}, 
            ${testUserData.language || 'hindi'}, NOW(), NOW()
          )
        `;
      }
      
      // Create credit balance
      await this.prisma.creditBalance.create({
        data: {
          userId: user.id,
          balance: 0,
        },
      });
      
      this.logger.log(`✅ Test user created successfully with ID: ${user.id}`);
      return user;
    } catch (error) {
      this.logger.error('❌ Error creating test user:', error);
      throw error;
    }
  }
}
