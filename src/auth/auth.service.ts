// src/auth/auth.service.ts
import { Injectable, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Fast2SmsService } from '../sms/fast2sms.service';
import { RedisService } from '../redis/redis.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

interface OtpData {
  otp: string;
  expiresAt: number;
  verified: boolean;
  attempts: number;
  createdAt: number;
}

@Injectable()
export class AuthService {
  private readonly MAX_ATTEMPTS = 3;
  private readonly OTP_EXPIRY_MINUTES = 10;

  constructor(
    private jwtService: JwtService,
    private fast2smsService: Fast2SmsService,
    private redisService: RedisService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger
  ) {}

  async sendOtp(mobile: string) {
    const cleanMobile = mobile.replace(/^\+91|^91/, '').replace(/\s+/g, '');
    this.logger.info(`🚀 Starting OTP send process for: ${cleanMobile}`, { context: 'AuthService', method: 'sendOtp', mobile: cleanMobile });
    
    // Check if mobile number is valid (10 digits)
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      this.logger.warn(`❌ Invalid mobile number format: ${cleanMobile}`, { context: 'AuthService', method: 'sendOtp', mobile: cleanMobile });
      throw new HttpException('Invalid mobile number format', HttpStatus.BAD_REQUEST);
    }

    // Check if OTP was sent recently (prevent spam)
    const existingOtp = await this.redisService.getOtpData(cleanMobile);
    if (existingOtp && (Date.now() - existingOtp.createdAt) < 60000) { // 1 minute cooldown
      this.logger.warn(`⏰ OTP cooldown active for: ${cleanMobile}`, { context: 'AuthService', method: 'sendOtp', mobile: cleanMobile, cooldownRemaining: 60 - Math.floor((Date.now() - existingOtp.createdAt) / 1000) });
      throw new HttpException('Please wait 1 minute before requesting new OTP', HttpStatus.TOO_MANY_REQUESTS);
    }

    try {
      this.logger.info(`📱 Calling SMS service for: ${cleanMobile}`, { context: 'AuthService', method: 'sendOtp', mobile: cleanMobile });
      const result = await this.fast2smsService.sendOtp(cleanMobile);
      
      if (result.success) {
        // Store OTP with expiry in Redis
        const otpData = {
          otp: result.otp,
          expiresAt: Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000,
          verified: false,
          attempts: 0,
          createdAt: Date.now()
        };
        
        await this.redisService.setOtpData(cleanMobile, otpData);
        this.logger.info(`✅ OTP stored in Redis for: ${cleanMobile}`, { context: 'AuthService', method: 'sendOtp', mobile: cleanMobile, expiresAt: otpData.expiresAt });
        this.logger.debug(`🔐 OTP generated for ${cleanMobile}: ${result.otp}`, { context: 'AuthService', method: 'sendOtp', mobile: cleanMobile, otp: result.otp }); // Debug level for security
      } else {
        this.logger.error(`❌ SMS service failed for: ${cleanMobile}`, { context: 'AuthService', method: 'sendOtp', mobile: cleanMobile, smsResult: result });
      }
      
      const response = {
        success: result.success,
        message: result.message,
        mobile: cleanMobile,
        expiresIn: this.OTP_EXPIRY_MINUTES * 60 // seconds
      };
      
      this.logger.info(`📤 OTP send response for: ${cleanMobile}`, { context: 'AuthService', method: 'sendOtp', mobile: cleanMobile, success: result.success });
      return response;
    } catch (error) {
      this.logger.error(`💥 OTP send failed for: ${cleanMobile}`, { context: 'AuthService', method: 'sendOtp', mobile: cleanMobile, error: error.message, stack: error.stack });
      throw error;
    }
  }

  async verifyOtp(mobile: string, userOtp: string) {
    const cleanMobile = mobile.replace(/^\+91|^91/, '').replace(/\s+/g, '');
    this.logger.info(`🔐 Starting OTP verification for: ${cleanMobile}`, { context: 'AuthService', method: 'verifyOtp', mobile: cleanMobile, providedOtp: userOtp });
    
    const otpData = await this.redisService.getOtpData(cleanMobile);
    
    if (!otpData) {
      this.logger.warn(`❌ OTP not found for: ${cleanMobile}`, { context: 'AuthService', method: 'verifyOtp', mobile: cleanMobile });
      throw new HttpException('OTP not found. Please request a new OTP.', HttpStatus.BAD_REQUEST);
    }
    
    this.logger.info(`📋 OTP data retrieved for: ${cleanMobile}`, { context: 'AuthService', method: 'verifyOtp', mobile: cleanMobile, attempts: otpData.attempts, expiresAt: otpData.expiresAt, verified: otpData.verified });
    
    // Check expiry
    if (Date.now() > otpData.expiresAt) {
      this.logger.warn(`⏰ OTP expired for: ${cleanMobile}`, { context: 'AuthService', method: 'verifyOtp', mobile: cleanMobile, expiresAt: otpData.expiresAt, currentTime: Date.now() });
      await this.redisService.deleteOtp(cleanMobile);
      throw new HttpException('OTP has expired. Please request a new OTP.', HttpStatus.BAD_REQUEST);
    }
    
    // Check max attempts
    if (otpData.attempts >= this.MAX_ATTEMPTS) {
      this.logger.warn(`🚫 Max attempts exceeded for: ${cleanMobile}`, { context: 'AuthService', method: 'verifyOtp', mobile: cleanMobile, attempts: otpData.attempts, maxAttempts: this.MAX_ATTEMPTS });
      await this.redisService.deleteOtp(cleanMobile);
      throw new HttpException('Maximum verification attempts exceeded. Please request a new OTP.', HttpStatus.BAD_REQUEST);
    }
    
    // Increment attempts
    otpData.attempts++;
    await this.redisService.setOtpData(cleanMobile, otpData);
    this.logger.info(`📊 Incremented attempts for: ${cleanMobile}`, { context: 'AuthService', method: 'verifyOtp', mobile: cleanMobile, currentAttempts: otpData.attempts });
    
    // Verify OTP
    if (otpData.otp !== userOtp) {
      const remainingAttempts = this.MAX_ATTEMPTS - otpData.attempts;
      this.logger.warn(`❌ Invalid OTP for: ${cleanMobile}`, { context: 'AuthService', method: 'verifyOtp', mobile: cleanMobile, providedOtp: userOtp, expectedOtp: otpData.otp, remainingAttempts });
      throw new HttpException(
        `Invalid OTP. ${remainingAttempts} attempts remaining.`, 
        HttpStatus.BAD_REQUEST
      );
    }
    
    this.logger.info(`✅ OTP verified successfully for: ${cleanMobile}`, { context: 'AuthService', method: 'verifyOtp', mobile: cleanMobile });
    
    // Mark as verified and generate JWT
    otpData.verified = true;
    await this.redisService.setOtpData(cleanMobile, otpData);
    
    const payload = { 
      mobile: cleanMobile, 
      verified: true,
      iat: Math.floor(Date.now() / 1000)
    };
    const token = this.jwtService.sign(payload);
    
    this.logger.info(`🎫 JWT token generated for: ${cleanMobile}`, { context: 'AuthService', method: 'verifyOtp', mobile: cleanMobile, tokenPayload: payload });
    
    // Clean up OTP after successful verification
    setTimeout(async () => {
      await this.redisService.deleteOtp(cleanMobile);
      this.logger.info(`🧹 OTP cleaned up for: ${cleanMobile}`, { context: 'AuthService', method: 'verifyOtp', mobile: cleanMobile });
    }, 5000); // Clean after 5 seconds
    
    return {
      success: true,
      message: 'Authentication successful',
      access_token: token,
      mobile: cleanMobile,
      expires_in: 7 * 24 * 60 * 60 // 7 days in seconds
    };
  }

  async resendOtp(mobile: string) {
    const cleanMobile = mobile.replace(/^\+91|^91/, '').replace(/\s+/g, '');
    this.logger.info(`🔄 Resending OTP for: ${cleanMobile}`, { context: 'AuthService', method: 'resendOtp', mobile: cleanMobile });
    
    try {
      // Delete existing OTP
      await this.redisService.deleteOtp(cleanMobile);
      this.logger.info(`🗑️ Existing OTP deleted for: ${cleanMobile}`, { context: 'AuthService', method: 'resendOtp', mobile: cleanMobile });
      
      // Send new OTP
      const result = await this.sendOtp(cleanMobile);
      this.logger.info(`✅ OTP resent successfully for: ${cleanMobile}`, { context: 'AuthService', method: 'resendOtp', mobile: cleanMobile });
      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to resend OTP for: ${cleanMobile}`, { context: 'AuthService', method: 'resendOtp', mobile: cleanMobile, error: error.message });
      throw error;
    }
  }

  // For other microservices to verify tokens
  verifyToken(token: string) {
    this.logger.info('🔍 Verifying JWT token', { context: 'AuthService', method: 'verifyToken' });
    
    try {
      const payload = this.jwtService.verify(token);
      this.logger.info(`✅ Token verified successfully for: ${payload.mobile}`, { context: 'AuthService', method: 'verifyToken', mobile: payload.mobile, verified: payload.verified });
      return {
        valid: true,
        payload: payload
      };
    } catch (error) {
      this.logger.warn('❌ Token verification failed', { context: 'AuthService', method: 'verifyToken', error: error.message });
      throw new HttpException('Invalid or expired token', HttpStatus.UNAUTHORIZED);
    }
  }

  // Get OTP status (for debugging - remove in production)
  async getOtpStatus(mobile: string) {
    const cleanMobile = mobile.replace(/^\+91|^91/, '').replace(/\s+/g, '');
    this.logger.info(`🔍 Getting OTP status for: ${cleanMobile}`, { context: 'AuthService', method: 'getOtpStatus', mobile: cleanMobile });
    
    try {
      const otpData = await this.redisService.getOtpData(cleanMobile);
      
      if (!otpData) {
        this.logger.info(`📭 No OTP found for: ${cleanMobile}`, { context: 'AuthService', method: 'getOtpStatus', mobile: cleanMobile });
        return { exists: false };
      }
      
      this.logger.info(`📋 OTP status retrieved for: ${cleanMobile}`, { context: 'AuthService', method: 'getOtpStatus', mobile: cleanMobile, attempts: otpData.attempts, verified: otpData.verified, expired: Date.now() > otpData.expiresAt });
      
      return {
        exists: true,
        expired: Date.now() > otpData.expiresAt,
        verified: otpData.verified,
        attempts: otpData.attempts,
        timeRemaining: Math.max(0, Math.floor((otpData.expiresAt - Date.now()) / 1000))
      };
    } catch (error) {
      this.logger.error(`❌ Failed to get OTP status for: ${cleanMobile}`, { context: 'AuthService', method: 'getOtpStatus', mobile: cleanMobile, error: error.message });
      throw error;
    }
  }

  // Send custom SMS (for crop alerts, weather warnings, etc.)
  async sendCustomSms(mobile: string, message: string) {
    const cleanMobile = mobile.replace(/^\+91|^91/, '').replace(/\s+/g, '');
    this.logger.info(`📱 Sending custom SMS to: ${cleanMobile}`, { context: 'AuthService', method: 'sendCustomSms', mobile: cleanMobile, messageLength: message.length });
    
    try {
      const result = await this.fast2smsService.sendCustomSms(cleanMobile, message);
      this.logger.info(`✅ Custom SMS sent successfully to: ${cleanMobile}`, { context: 'AuthService', method: 'sendCustomSms', mobile: cleanMobile });
      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to send custom SMS to: ${cleanMobile}`, { context: 'AuthService', method: 'sendCustomSms', mobile: cleanMobile, error: error.message });
      throw error;
    }
  }
}
