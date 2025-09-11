// src/auth/auth.controller.ts
import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  HttpStatus, 
  Get, 
  Headers,
  UseGuards,
  Request,
  Param,
  HttpException,
  Inject
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SendOtpDto, VerifyOtpDto, ResendOtpDto, SendSmsDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger
  ) {}

  @Post('send-whatsapp-otp')
  @HttpCode(HttpStatus.OK)
  async sendWhatsAppOtp(@Body() sendOtpDto: SendOtpDto) {
    this.logger.info(`📱 Sending WhatsApp OTP to: ${sendOtpDto.mobile}`, { context: 'AuthController', method: 'sendWhatsAppOtp', mobile: sendOtpDto.mobile });
    try {
      const result = await this.authService.sendOtp(sendOtpDto.mobile);
      this.logger.info(`✅ WhatsApp OTP sent successfully to: ${sendOtpDto.mobile}`, { context: 'AuthController', method: 'sendWhatsAppOtp', mobile: sendOtpDto.mobile });
      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to send WhatsApp OTP to: ${sendOtpDto.mobile}`, { context: 'AuthController', method: 'sendWhatsAppOtp', mobile: sendOtpDto.mobile, error: error.message });
      throw error;
    }
  }

  @Post('send-sms-otp')
  @HttpCode(HttpStatus.OK)
  async sendSmsOtp(@Body() sendOtpDto: SendOtpDto) {
    this.logger.info(`📱 Sending SMS OTP to: ${sendOtpDto.mobile}`, { context: 'AuthController', method: 'sendSmsOtp', mobile: sendOtpDto.mobile });
    try {
      const result = await this.authService.sendOtp(sendOtpDto.mobile);
      this.logger.info(`✅ SMS OTP sent successfully to: ${sendOtpDto.mobile}`, { context: 'AuthController', method: 'sendSmsOtp', mobile: sendOtpDto.mobile });
      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to send SMS OTP to: ${sendOtpDto.mobile}`, { context: 'AuthController', method: 'sendSmsOtp', mobile: sendOtpDto.mobile, error: error.message });
      throw error;
    }
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    this.logger.info(`🔐 Verifying OTP for: ${verifyOtpDto.mobile}`, { context: 'AuthController', method: 'verifyOtp', mobile: verifyOtpDto.mobile, otp: verifyOtpDto.otp });
    try {
      const result = await this.authService.verifyOtp(verifyOtpDto.mobile, verifyOtpDto.otp);
      this.logger.info(`✅ OTP verified successfully for: ${verifyOtpDto.mobile}`, { context: 'AuthController', method: 'verifyOtp', mobile: verifyOtpDto.mobile });
      return result;
    } catch (error) {
      this.logger.error(`❌ OTP verification failed for: ${verifyOtpDto.mobile}`, { context: 'AuthController', method: 'verifyOtp', mobile: verifyOtpDto.mobile, error: error.message });
      throw error;
    }
  }

  @Post('resend-whatsapp-otp')
  @HttpCode(HttpStatus.OK)
  async resendWhatsAppOtp(@Body() resendOtpDto: ResendOtpDto) {
    this.logger.info(`🔄 Resending WhatsApp OTP to: ${resendOtpDto.mobile}`, { context: 'AuthController', method: 'resendWhatsAppOtp', mobile: resendOtpDto.mobile });
    try {
      const result = await this.authService.resendOtp(resendOtpDto.mobile);
      this.logger.info(`✅ WhatsApp OTP resent successfully to: ${resendOtpDto.mobile}`, { context: 'AuthController', method: 'resendWhatsAppOtp', mobile: resendOtpDto.mobile });
      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to resend WhatsApp OTP to: ${resendOtpDto.mobile}`, { context: 'AuthController', method: 'resendWhatsAppOtp', mobile: resendOtpDto.mobile, error: error.message });
      throw error;
    }
  }

  @Post('resend-sms-otp')
  @HttpCode(HttpStatus.OK)
  async resendSmsOtp(@Body() resendOtpDto: ResendOtpDto) {
    this.logger.info(`🔄 Resending SMS OTP to: ${resendOtpDto.mobile}`, { context: 'AuthController', method: 'resendSmsOtp', mobile: resendOtpDto.mobile });
    try {
      const result = await this.authService.resendOtp(resendOtpDto.mobile);
      this.logger.info(`✅ SMS OTP resent successfully to: ${resendOtpDto.mobile}`, { context: 'AuthController', method: 'resendSmsOtp', mobile: resendOtpDto.mobile });
      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to resend SMS OTP to: ${resendOtpDto.mobile}`, { context: 'AuthController', method: 'resendSmsOtp', mobile: resendOtpDto.mobile, error: error.message });
      throw error;
    }
  }

  @Post('verify-token')
  @HttpCode(HttpStatus.OK)
  async verifyToken(@Body() body: { token: string }) {
    this.logger.info('🔍 Verifying JWT token', { context: 'AuthController', method: 'verifyToken' });
    
    if (!body.token) {
      this.logger.warn('❌ Token missing in request body', { context: 'AuthController', method: 'verifyToken' });
      throw new HttpException('Token is required', HttpStatus.BAD_REQUEST);
    }
    
    try {
      const result = await this.authService.verifyToken(body.token);
      this.logger.info('✅ JWT token verified successfully', { context: 'AuthController', method: 'verifyToken' });
      return result;
    } catch (error) {
      this.logger.error('❌ JWT token verification failed', { context: 'AuthController', method: 'verifyToken', error: error.message });
      throw error;
    }
  }

  // Protected route example
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req) {
    this.logger.info(`👤 Getting profile for user: ${req.user.mobile}`, { context: 'AuthController', method: 'getProfile', mobile: req.user.mobile });
    
    try {
      const profile = {
        success: true,
        user: {
          mobile: req.user.mobile,
          verified: req.user.verified,
          loginTime: new Date(req.user.iat * 1000).toISOString()
        }
      };
      
      this.logger.info(`✅ Profile retrieved successfully for: ${req.user.mobile}`, { context: 'AuthController', method: 'getProfile', mobile: req.user.mobile });
      return profile;
    } catch (error) {
      this.logger.error(`❌ Failed to get profile for: ${req.user.mobile}`, { context: 'AuthController', method: 'getProfile', mobile: req.user.mobile, error: error.message });
      throw error;
    }
  }

  // Debug endpoint - remove in production
  @Get('otp-status/:mobile')
  @HttpCode(HttpStatus.OK)
  async getOtpStatus(@Param('mobile') mobile: string) {
    this.logger.info(`🔍 Getting OTP status for: ${mobile}`, { context: 'AuthController', method: 'getOtpStatus', mobile });
    
    try {
      const result = await this.authService.getOtpStatus(mobile);
      this.logger.info(`✅ OTP status retrieved for: ${mobile}`, { context: 'AuthController', method: 'getOtpStatus', mobile, hasOtp: !!result });
      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to get OTP status for: ${mobile}`, { context: 'AuthController', method: 'getOtpStatus', mobile, error: error.message });
      throw error;
    }
  }

  // Send custom SMS for crop alerts
  @Post('send-sms')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async sendSms(@Body() sendSmsDto: SendSmsDto) {
    this.logger.info(`📨 Sending custom SMS to: ${sendSmsDto.mobile}`, { context: 'AuthController', method: 'sendSms', mobile: sendSmsDto.mobile, messageLength: sendSmsDto.message.length });
    
    try {
      const result = await this.authService.sendCustomSms(sendSmsDto.mobile, sendSmsDto.message);
      this.logger.info(`✅ Custom SMS sent successfully to: ${sendSmsDto.mobile}`, { context: 'AuthController', method: 'sendSms', mobile: sendSmsDto.mobile });
      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to send custom SMS to: ${sendSmsDto.mobile}`, { context: 'AuthController', method: 'sendSms', mobile: sendSmsDto.mobile, error: error.message });
      throw error;
    }
  }

  // Health check
  @Get('health')
  @HttpCode(HttpStatus.OK)
  async healthCheck() {
    this.logger.info('🏥 Health check requested', { context: 'AuthController', method: 'healthCheck' });
    
    try {
      const healthStatus = {
        success: true,
        message: 'Auth service is running',
        timestamp: new Date().toISOString()
      };
      
      this.logger.info('✅ Health check passed', { context: 'AuthController', method: 'healthCheck' });
      return healthStatus;
    } catch (error) {
      this.logger.error('❌ Health check failed', { context: 'AuthController', method: 'healthCheck', error: error.message });
      throw error;
    }
  }
}
