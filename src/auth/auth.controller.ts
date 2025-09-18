// src/auth/auth.controller.ts - COMPLETE FIREBASE VERSION
import { Controller, Post, Get, Body, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AuthService, CompleteProfileDto } from './auth.service';
import { FirebaseService } from '../firebase/firebase.service';



interface VerifyFirebaseRequest {
  idToken: string;
  phoneNumber?: string;
  uid: string;
  name?: string;
  languagePref?: string;
  location?: string;
  gpsLat?: number;
  gpsLong?: number;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private firebaseService: FirebaseService,
  ) {}

  @Get('health')
  async healthCheck() {
    return {
      success: true,
      message: 'Firebase Auth service is running',
      timestamp: new Date().toISOString(),
      service: 'agricultural-ai-firebase-auth-service',
    };
  }

  @Get('debug')
  async getDebugInfo() {
    const debugInfo = this.authService.getDebugInfo();
    const appStats = await this.authService.getAppStats();
    
    return {
      success: true,
      debugTimestamp: new Date().toISOString(),
      ...debugInfo,
      ...appStats,
    };
  }

  // ===== FIREBASE AUTHENTICATION =====

  @Post('verify-firebase')
  async verifyFirebase(@Body() verifyFirebaseRequest: VerifyFirebaseRequest) {
    this.logger.log('🌐 Received verify-firebase request');
    this.logger.log('📤 Request body keys:', Object.keys(verifyFirebaseRequest));
    
    const { idToken, phoneNumber, uid, name, languagePref, location, gpsLat, gpsLong } = verifyFirebaseRequest;

    this.logger.log(`📋 Request details: UID=${uid}, phoneNumber=${phoneNumber}, hasIdToken=${!!idToken}`);

    if (!idToken || !uid) {
      this.logger.error('❌ Missing required fields: idToken or UID');
      throw new HttpException('Firebase ID token and UID are required', HttpStatus.BAD_REQUEST);
    }

    try {
      this.logger.log(`🔥 Processing Firebase authentication for UID: ${uid}`);

      const profileData: CompleteProfileDto = {
        name,
        languagePref: languagePref || 'hi-IN',
        location,
        gpsLat,
        gpsLong,
      };

      this.logger.log('🔄 Calling authService.verifyFirebaseToken...');
      const result = await this.authService.verifyFirebaseToken(idToken, profileData);

      this.logger.log(`✅ Firebase authentication successful for: ${result.user.phoneNumber}`);
      this.logger.log(`🎫 Generated JWT token: ${result.token ? 'YES' : 'NO'}`);

      const response = {
        success: true,
        message: 'Firebase authentication successful',
        user: {
          id: result.user.id,
          phoneNumber: result.user.phoneNumber,
          name: result.user.name,
          role: result.user.role,
          firebaseUID: result.firebaseUID,
          isNewUser: result.isNewUser,
        },
        session: {
          token: result.token,
          expires: result.expires
        }
      };

      this.logger.log('📤 Sending response with user ID:', result.user.id);
      return response;

    } catch (error) {
      this.logger.error('❌ Firebase authentication error:', error.message);
      this.logger.error('❌ Error stack:', error.stack);
      throw new HttpException(
        error.message || 'Firebase authentication failed',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }



  // ===== JWT TOKEN MANAGEMENT =====

  @Post('validate-token')
  async validateToken(@Body() validateRequest: { token: string }) {
    const { token } = validateRequest;

    if (!token) {
      throw new HttpException('JWT token is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.authService.validateJwtToken(token);
      
      return {
        success: true,
        valid: true,
        user: {
          id: result.user.id,
          phoneNumber: result.user.phoneNumber,
          name: result.user.name,
          role: result.user.role,
        },
        payload: result.payload,
      };
    } catch (error) {
      this.logger.error('❌ Token validation error:', error);
      throw new HttpException('Invalid or expired token', HttpStatus.UNAUTHORIZED);
    }
  }

  @Post('refresh-token')
  async refreshToken(@Body() refreshRequest: { token: string }) {
    const { token } = refreshRequest;

    if (!token) {
      throw new HttpException('JWT token is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.authService.refreshJwtToken(token);
      
      return {
        success: true,
        token: result.token,
        expires: result.expires,
      };
    } catch (error) {
      this.logger.error('❌ Token refresh error:', error);
      throw new HttpException('Token refresh failed', HttpStatus.UNAUTHORIZED);
    }
  }

  // Note: JWT tokens are stateless, so logout is handled client-side
  // by simply discarding the token. No server-side action needed.
  @Post('logout')
  async logout() {
    return {
      success: true,
      message: 'Logged out successfully. Please discard the JWT token on client side.',
    };
  }





  @Post('profile')
  async getUserProfile(@Body() profileRequest: { userId: string }) {
    const { userId } = profileRequest;

    if (!userId) {
      throw new HttpException('User ID is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const profile = await this.authService.getUserProfile(userId);
      
      return {
        success: true,
        profile,
      };
    } catch (error) {
      this.logger.error('❌ Profile fetch error:', error);
      throw new HttpException('Failed to get profile', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('update-profile')
  async updateProfile(@Body() updateRequest: { userId: string; profileData: CompleteProfileDto }) {
    const { userId, profileData } = updateRequest;

    if (!userId || !profileData) {
      throw new HttpException('User ID and profile data are required', HttpStatus.BAD_REQUEST);
    }

    try {
      const updatedProfile = await this.authService.updateUserProfile(userId, profileData);
      
      return {
        success: true,
        message: 'Profile updated successfully',
        profile: updatedProfile,
      };
    } catch (error) {
      this.logger.error('❌ Profile update error:', error);
      throw new HttpException('Failed to update profile', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('complete-profile')
  async completeProfile(@Body() completeProfileRequest: { 
    token: string;
    name: string;
    village?: string;
    district?: string;
    state?: string;
    farmSize?: number;
    cropTypes?: string[];
    language?: string;
    languagePref?: string;
    location?: string;
    gpsLat?: number;
    gpsLong?: number;
  }) {
    const { 
      token, 
      name, 
      village, 
      district, 
      state, 
      farmSize, 
      cropTypes, 
      language,
      languagePref,
      location,
      gpsLat,
      gpsLong 
    } = completeProfileRequest;

    if (!token) {
      throw new HttpException('JWT token is required', HttpStatus.BAD_REQUEST);
    }

    if (!name) {
      throw new HttpException('Name is required', HttpStatus.BAD_REQUEST);
    }

    try {
      // Validate JWT token and get user ID
      const tokenValidation = await this.authService.validateJwtToken(token);
      const userId = tokenValidation.user.id;
      
      this.logger.log(`📝 Profile completion request for user: ${userId}, name: ${name}`);
      
      // Prepare profile data for database update
       const locationString = location || `${village || ''}, ${district || ''}, ${state || ''}`.trim().replace(/^,\s*|,\s*$/g, '');
       const profileData: CompleteProfileDto = {
         name,
         languagePref: languagePref || language || 'hi-IN',
         location: locationString || undefined,
         gpsLat,
         gpsLong,
       };

      // Update user profile in database
      const updatedProfile = await this.authService.updateUserProfile(userId, profileData);
      
      return {
        success: true,
        message: 'Profile completed successfully',
        user: {
          id: userId,
          name: updatedProfile.name,
          phoneNumber: updatedProfile.phoneNumber,
          role: updatedProfile.role,
        },
        farmerProfile: {
          languagePref: updatedProfile.languagePref,
          location: updatedProfile.location,
          gpsLat: updatedProfile.gpsLat,
          gpsLong: updatedProfile.gpsLong,
          // Additional fields for frontend compatibility
          village: village || null,
          district: district || null,
          state: state || null,
          farmSize: farmSize || null,
          cropTypes: cropTypes || [],
          language: language || 'hindi'
        }
      };
    } catch (error) {
      this.logger.error('❌ Profile completion error:', error);
      throw new HttpException(
        error.message || 'Profile completion failed',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
