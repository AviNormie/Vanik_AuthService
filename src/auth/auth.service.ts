// src/auth/auth.service.ts
import { Injectable, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { FirebaseService } from '../firebase/firebase.service'; // Fixed import
import { Farmer } from '../farmers/entities/farmer.entity';
import { UserSession } from './entities/user-session.entity';
import { CompleteProfileDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private firebaseService: FirebaseService, // Fixed service name
    private jwtService: JwtService,
    @InjectRepository(Farmer)
    private farmerRepository: Repository<Farmer>,
    @InjectRepository(UserSession)
    private sessionRepository: Repository<UserSession>,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  // Verify Firebase ID token and handle user creation/update
  async verifyFirebaseToken(idToken: string, deviceInfo?: string, ipAddress?: string) {
    try {
      this.logger.info('Starting token verification process', {
        context: 'AuthService',
        method: 'verifyFirebaseToken',
      });

      const decodedToken = await this.firebaseService.verifyIdToken(idToken);
      
      // Find or create farmer
      let farmer = await this.farmerRepository.findOne({
        where: { firebaseUid: decodedToken.uid }
      });

      if (!farmer && decodedToken.phone_number) {
        // Create new farmer profile
        farmer = this.farmerRepository.create({
          firebaseUid: decodedToken.uid,
          phoneNumber: decodedToken.phone_number,
          lastLoginAt: new Date(),
        });
        farmer = await this.farmerRepository.save(farmer);
        
        this.logger.info('New farmer created', {
          context: 'AuthService',
          firebaseUid: decodedToken.uid,
          phoneNumber: decodedToken.phone_number,
        });
      } else if (farmer) {
        // Update last login
        farmer.lastLoginAt = new Date();
        await this.farmerRepository.save(farmer);
        
        this.logger.info('Existing farmer login updated', {
          context: 'AuthService',
          firebaseUid: decodedToken.uid,
          phoneNumber: decodedToken.phone_number,
        });
      }

      // Generate JWT token
      const jwtPayload = {
        sub: decodedToken.uid,
        firebaseUid: decodedToken.uid,
        phone: decodedToken.phone_number,
        email: decodedToken.email,
        role: 'farmer',
        hasProfile: !!farmer?.name,
        village: farmer?.village,
        language: farmer?.language || 'hindi',
      };

      const jwtToken = this.jwtService.sign(jwtPayload);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

      // Save session to database
      const session = this.sessionRepository.create({
        firebaseUid: decodedToken.uid,
        jwtToken,
        deviceInfo: deviceInfo || 'Unknown Device',
        ipAddress: ipAddress || 'Unknown IP',
        expiresAt,
        isActive: true,
      });
      await this.sessionRepository.save(session);

      this.logger.info('JWT session created', {
        context: 'AuthService',
        firebaseUid: decodedToken.uid,
        sessionId: session.id,
      });

      return {
        success: true,
        message: 'Authentication successful',
        accessToken: jwtToken,
        tokenType: 'Bearer',
        expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
        user: {
          uid: decodedToken.uid,
          phone: decodedToken.phone_number,
          email: decodedToken.email,
          verified: decodedToken.phone_number_verified || decodedToken.email_verified,
          hasProfile: !!farmer?.name,
        },
        farmer: farmer ? {
          firebaseUid: farmer.firebaseUid,
          phoneNumber: farmer.phoneNumber,
          name: farmer.name,
          village: farmer.village,
          district: farmer.district,
          cropTypes: farmer.cropTypes ? JSON.parse(farmer.cropTypes) : [],
          farmSize: farmer.farmSize,
          language: farmer.language,
        } : null,
      };
    } catch (error) {
      this.logger.error('Token verification failed', {
        context: 'AuthService',
        method: 'verifyFirebaseToken',
        error: error.message,
      });
      
      throw new HttpException(
        `Authentication failed: ${error.message}`,
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  // Complete farmer profile
  async completeProfile(firebaseUid: string, profileData: CompleteProfileDto) {
    try {
      this.logger.info('Starting profile completion', {
        context: 'AuthService',
        method: 'completeProfile',
        firebaseUid,
        village: profileData.village,
      });

      const farmer = await this.farmerRepository.findOne({
        where: { firebaseUid }
      });

      if (!farmer) {
        this.logger.error('Farmer not found for profile completion', {
          context: 'AuthService',
          firebaseUid,
        });
        throw new HttpException('Farmer not found', HttpStatus.NOT_FOUND);
      }

      // Update farmer profile
      farmer.name = profileData.name;
      farmer.village = profileData.village ?? farmer.village;
      farmer.district = profileData.district ?? farmer.district;
      farmer.state = profileData.state ?? farmer.state;
      farmer.cropTypes = profileData.cropTypes ? JSON.stringify(profileData.cropTypes) : farmer.cropTypes;
      farmer.farmSize = profileData.farmSize ?? farmer.farmSize;
      farmer.language = profileData.language || 'hindi';

      const updatedFarmer = await this.farmerRepository.save(farmer);

      // Update Firebase custom claims
      await this.firebaseService.setCustomUserClaims(firebaseUid, {
        hasProfile: true,
        farmerType: 'registered',
        village: profileData.village,
        language: profileData.language || 'hindi',
      });

      this.logger.info('Profile completed successfully', {
        context: 'AuthService',
        firebaseUid,
        name: profileData.name,
        village: profileData.village,
      });

      return {
        success: true,
        message: 'Profile completed successfully',
        farmer: {
          firebaseUid: updatedFarmer.firebaseUid,
          phoneNumber: updatedFarmer.phoneNumber,
          name: updatedFarmer.name,
          village: updatedFarmer.village,
          district: updatedFarmer.district,
          state: updatedFarmer.state,
          cropTypes: updatedFarmer.cropTypes ? JSON.parse(updatedFarmer.cropTypes) : [],
          farmSize: updatedFarmer.farmSize,
          language: updatedFarmer.language,
        }
      };
    } catch (error) {
      this.logger.error('Profile completion failed', {
        context: 'AuthService',
        method: 'completeProfile',
        firebaseUid,
        error: error.message,
      });
      
      throw new HttpException(
        `Profile update failed: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // Get farmer profile
  async getFarmerProfile(firebaseUid: string) {
    try {
      this.logger.info('Fetching farmer profile', {
        context: 'AuthService',
        method: 'getFarmerProfile',
        firebaseUid,
      });

      const farmer = await this.farmerRepository.findOne({
        where: { firebaseUid }
      });

      if (!farmer) {
        this.logger.error('Farmer profile not found', {
          context: 'AuthService',
          firebaseUid,
        });
        throw new HttpException('Farmer not found', HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        farmer: {
          firebaseUid: farmer.firebaseUid,
          phoneNumber: farmer.phoneNumber,
          name: farmer.name,
          village: farmer.village,
          district: farmer.district,
          state: farmer.state,
          cropTypes: farmer.cropTypes ? JSON.parse(farmer.cropTypes) : [],
          farmSize: farmer.farmSize,
          language: farmer.language,
          lastLoginAt: farmer.lastLoginAt,
          createdAt: farmer.createdAt,
        }
      };
    } catch (error) {
      this.logger.error('Failed to fetch farmer profile', {
        context: 'AuthService',
        method: 'getFarmerProfile',
        firebaseUid,
        error: error.message,
      });
      throw error;
    }
  }

  // Generate custom JWT for internal services (optional)
  async generateInternalJWT(firebaseUid: string) {
    try {
      this.logger.info('Generating custom token', {
        context: 'AuthService',
        method: 'generateInternalJWT',
        firebaseUid,
      });

      const farmer = await this.farmerRepository.findOne({
        where: { firebaseUid }
      });

      if (!farmer) {
        throw new HttpException('Farmer not found', HttpStatus.NOT_FOUND);
      }

      // Create custom token with farmer data
      const customClaims = {
        role: 'farmer',
        hasProfile: !!farmer.name,
        village: farmer.village,
        language: farmer.language || 'hindi',
        farmerId: farmer.firebaseUid,
      };

      const customToken = await this.firebaseService.createCustomToken(firebaseUid, customClaims);

      return {
        success: true,
        customToken,
        expiresIn: 3600, // 1 hour
      };
    } catch (error) {
      this.logger.error('Failed to generate custom token', {
        context: 'AuthService',
        method: 'generateInternalJWT',
        firebaseUid,
        error: error.message,
      });
      throw error;
    }
  }

  // Validate JWT session
  async validateSession(jwtToken: string): Promise<UserSession | null> {
    try {
      const session = await this.sessionRepository.findOne({
        where: { 
          jwtToken,
          isActive: true
        },
        relations: ['farmer']
      });

      if (!session) {
        return null;
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        await this.invalidateSession(session.id);
        return null;
      }

      return session;
    } catch (error) {
      this.logger.error('Session validation failed', {
        context: 'AuthService',
        method: 'validateSession',
        error: error.message,
      });
      return null;
    }
  }

  // Invalidate a specific session
  async invalidateSession(sessionId: string): Promise<void> {
    try {
      await this.sessionRepository.update(
        { id: sessionId },
        { isActive: false }
      );

      this.logger.info('Session invalidated', {
        context: 'AuthService',
        method: 'invalidateSession',
        sessionId,
      });
    } catch (error) {
      this.logger.error('Failed to invalidate session', {
        context: 'AuthService',
        method: 'invalidateSession',
        sessionId,
        error: error.message,
      });
      throw error;
    }
  }

  // Invalidate all sessions for a user
  async invalidateAllUserSessions(firebaseUid: string): Promise<void> {
    try {
      await this.sessionRepository.update(
        { firebaseUid, isActive: true },
        { isActive: false }
      );

      this.logger.info('All user sessions invalidated', {
        context: 'AuthService',
        method: 'invalidateAllUserSessions',
        firebaseUid,
      });
    } catch (error) {
      this.logger.error('Failed to invalidate user sessions', {
        context: 'AuthService',
        method: 'invalidateAllUserSessions',
        firebaseUid,
        error: error.message,
      });
      throw error;
    }
  }

  // Get active sessions for a user
  async getUserSessions(firebaseUid: string): Promise<UserSession[]> {
    try {
      return await this.sessionRepository.find({
        where: { 
          firebaseUid,
          isActive: true
        },
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      this.logger.error('Failed to get user sessions', {
        context: 'AuthService',
        method: 'getUserSessions',
        firebaseUid,
        error: error.message,
      });
      throw error;
    }
  }
}
