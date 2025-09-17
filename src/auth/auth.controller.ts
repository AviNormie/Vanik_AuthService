// src/auth/auth.controller.ts
import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  HttpStatus, 
  Get,
  UseGuards,
  Request,
  Headers,
  Inject,
  HttpException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { AuthService } from './auth.service';
import { VerifyTokenDto, CompleteProfileDto, PhoneAuthDto } from './dto/auth.dto';
import { FirebaseAuthGuard } from './guards/firebase-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  @Post('verify-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify Firebase ID token' })
  @ApiBody({ 
    type: VerifyTokenDto,
    description: 'Firebase ID token received from frontend authentication'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Token verified successfully',
    schema: {
      example: {
        success: true,
        message: 'Authentication successful',
        user: {
          uid: 'firebase-user-uid',
          phone: '+919876543210',
          verified: true,
          hasProfile: false
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Invalid token' })
  async verifyToken(@Body() verifyTokenDto: VerifyTokenDto) {
    this.logger.info('Token verification request received', {
      context: 'AuthController',
      method: 'verifyToken',
    });
    
    return this.authService.verifyFirebaseToken(verifyTokenDto.idToken);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify Firebase token from Authorization header' })
  @ApiBearerAuth('firebase-auth')
  @ApiResponse({ 
    status: 200, 
    description: 'Token verified successfully' 
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing token' })
  async verify(@Headers('authorization') authHeader: string) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('Token verification failed - no token provided', {
        context: 'AuthController',
        method: 'verify',
      });
      throw new HttpException('No token provided', HttpStatus.BAD_REQUEST);
    }

    const idToken = authHeader.split(' ')[1];
    
    this.logger.info('Header token verification request received', {
      context: 'AuthController',
      method: 'verify',
    });
    
    return this.authService.verifyFirebaseToken(idToken);
  }

  @Post('complete-profile')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete farmer profile (Protected)' })
  @ApiBearerAuth('firebase-auth')
  @ApiBody({ 
    type: CompleteProfileDto,
    description: 'Farmer profile information'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Profile completed successfully',
    schema: {
      example: {
        success: true,
        message: 'Profile completed successfully',
        farmer: {
          name: 'राम कुमार',
          village: 'बागपत',
          district: 'मेरठ',
          cropTypes: ['धान', 'गेहूँ']
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Farmer not found' })
  async completeProfile(@Request() req, @Body() profileData: CompleteProfileDto) {
    this.logger.info('Profile completion request received', {
      context: 'AuthController',
      method: 'completeProfile',
      firebaseUid: req.user.uid,
      village: profileData.village,
    });
    
    return this.authService.completeProfile(req.user.uid, profileData);
  }

  @Get('profile')
  @UseGuards(FirebaseAuthGuard)
  @ApiOperation({ summary: 'Get current farmer profile (Protected)' })
  @ApiBearerAuth('firebase-auth')
  @ApiResponse({ 
    status: 200, 
    description: 'Farmer profile retrieved successfully' 
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Farmer not found' })
  async getProfile(@Request() req) {
    this.logger.info('Profile fetch request received', {
      context: 'AuthController',
      method: 'getProfile',
      firebaseUid: req.user.uid,
    });
    
    return this.authService.getFarmerProfile(req.user.uid);
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ 
    status: 200, 
    description: 'Service health status',
    schema: {
      example: {
        success: true,
        message: 'Auth service is running',
        timestamp: '2025-09-17T18:02:00.000Z',
        firebase: 'connected'
      }
    }
  })
  healthCheck() {
    this.logger.info('Health check request received', {
      context: 'AuthController',
      method: 'healthCheck',
    });
    
    return {
      success: true,
      message: '🌾 Agricultural Platform Auth Service is running',
      timestamp: new Date().toISOString(),
      firebase: 'connected'
    };
  }

  @Get('farmer-dashboard')
  @UseGuards(FirebaseAuthGuard)
  @ApiOperation({ summary: 'Farmer dashboard data (Protected)' })
  @ApiBearerAuth('firebase-auth')
  @ApiResponse({ 
    status: 200, 
    description: 'Dashboard data retrieved successfully' 
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getFarmerDashboard(@Request() req) {
    this.logger.info('Dashboard request received', {
      context: 'AuthController',
      method: 'getFarmerDashboard',
      firebaseUid: req.user.uid,
      phone: req.user.phone,
    });
    
    return {
      success: true,
      message: `नमस्ते! Welcome ${req.user.phone}! 🌾`,
      user: req.user,
      timestamp: new Date().toISOString(),
      features: [
        'Crop Disease Detection',
        'Weather Alerts',
        'Market Prices',
        'Expert Consultation'
      ]
    };
  }
}
