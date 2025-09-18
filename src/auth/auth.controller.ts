// src/auth/auth.controller.ts - COMPLETE FIREBASE VERSION
import { Controller, Post, Get, Body, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AuthService, CompleteProfileDto } from './auth.service';
import { FirebaseService } from '../firebase/firebase.service';

interface SendOTPRequest {
  phoneNumber: string;
}

interface VerifyOTPRequest {
  phoneNumber: string;
  otp: string;
  name?: string;
  languagePref?: string;
  location?: string;
  gpsLat?: number;
  gpsLong?: number;
}

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
    const { idToken, phoneNumber, uid, name, languagePref, location, gpsLat, gpsLong } = verifyFirebaseRequest;

    if (!idToken || !uid) {
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

      const result = await this.authService.verifyFirebaseToken(idToken, profileData);

      this.logger.log(`✅ Firebase authentication successful for: ${result.user.phoneNumber}`);

      return {
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
          token: result.session.sessionToken,
          expires: result.session.expires,
        }
      };

    } catch (error) {
      this.logger.error('❌ Firebase authentication error:', error);
      throw new HttpException(
        error.message || 'Firebase authentication failed',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // ===== FALLBACK OTP AUTHENTICATION =====

  @Post('send-otp')
  async sendOTP(@Body() sendOTPRequest: SendOTPRequest) {
    const { phoneNumber } = sendOTPRequest;

    if (!phoneNumber) {
      throw new HttpException('Phone number is required', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.authService.sendOTP(phoneNumber);
      
      this.logger.log(`📱 OTP sent to: ${phoneNumber}`);
      
      return {
        success: true,
        message: 'OTP sent successfully (fallback method)',
      };
    } catch (error) {
      this.logger.error(`❌ Failed to send OTP to ${phoneNumber}:`, error);
      throw new HttpException('Failed to send OTP', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('verify-otp')
  async verifyOTP(@Body() verifyOTPRequest: VerifyOTPRequest) {
    const { phoneNumber, otp, name, languagePref, location, gpsLat, gpsLong } = verifyOTPRequest;

    if (!phoneNumber || !otp) {
      throw new HttpException('Phone number and OTP are required', HttpStatus.BAD_REQUEST);
    }

    try {
      const isValidOTP = await this.authService.verifyOTP(phoneNumber, otp);
      
      if (!isValidOTP) {
        throw new HttpException('Invalid or expired OTP', HttpStatus.UNAUTHORIZED);
      }

      const profileData: CompleteProfileDto = {
        name,
        languagePref: languagePref || 'hi-IN',
        location,
        gpsLat,
        gpsLong,
      };

      const { user, isNewUser } = await this.authService.createOrUpdateUser(phoneNumber, profileData);
      const session = await this.authService.createSession(user.id);

      return {
        success: true,
        message: 'OTP verification successful (fallback method)',
        user: {
          id: user.id,
          phoneNumber: user.phoneNumber,
          name: user.name,
          role: user.role,
          isNewUser,
        },
        session: {
          token: session.sessionToken,
          expires: session.expires,
        }
      };

    } catch (error) {
      this.logger.error('❌ OTP verification error:', error);
      throw new HttpException(
        error.message || 'OTP verification failed',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // ===== SESSION MANAGEMENT =====

  @Post('logout')
  async logout(@Body() logoutRequest: { sessionToken: string }) {
    const { sessionToken } = logoutRequest;

    if (!sessionToken) {
      throw new HttpException('Session token is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const success = await this.authService.logout(sessionToken);
      
      return {
        success,
        message: success ? 'Logged out successfully' : 'Logout failed',
      };
    } catch (error) {
      this.logger.error('❌ Logout error:', error);
      throw new HttpException('Logout failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('validate-session')
  async validateSession(@Body() validateRequest: { sessionToken: string }) {
    const { sessionToken } = validateRequest;

    if (!sessionToken) {
      throw new HttpException('Session token is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const session = await this.authService.validateSession(sessionToken);
      
      if (!session) {
        throw new HttpException('Invalid or expired session', HttpStatus.UNAUTHORIZED);
      }

      return {
        success: true,
        valid: true,
        user: {
          id: session.id,
          phoneNumber: session.phoneNumber,
          name: session.name,
        }
      };
    } catch (error) {
      return {
        success: false,
        valid: false,
        message: 'Session validation failed',
      };
    }
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
}
