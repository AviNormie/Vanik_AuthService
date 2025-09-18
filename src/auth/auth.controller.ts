// src/auth/auth.controller.ts
import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

interface SendOTPRequest {
  phoneNumber: string;
}

interface VerifyOTPRequest {
  phoneNumber: string;
  otp: string;
  // Optional user profile data   
  name?: string;
  languagePref?: string;
  location?: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private prisma: PrismaService,
  ) {}

  @Post('send-otp')
  async sendOTP(@Body() sendOTPRequest: SendOTPRequest) {
    const { phoneNumber } = sendOTPRequest;

    if (!phoneNumber) {
      throw new HttpException('Phone number is required', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.authService.sendOTP(phoneNumber);
      return {
        success: true,
        message: 'OTP sent successfully',
      };
    } catch (error) {
      throw new HttpException('Failed to send OTP', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('verify-otp')
  async verifyOTP(@Body() verifyOTPRequest: VerifyOTPRequest) {
    const { phoneNumber, otp, name, languagePref, location } = verifyOTPRequest;

    if (!phoneNumber || !otp) {
      throw new HttpException('Phone number and OTP are required', HttpStatus.BAD_REQUEST);
    }

    try {
      // 1. Verify OTP
      const isValidOTP = await this.authService.verifyOTP(phoneNumber, otp);
      
      if (!isValidOTP) {
        throw new HttpException('Invalid or expired OTP', HttpStatus.UNAUTHORIZED);
      }

      // 2. Check if user exists
      let user = await this.prisma.user.findUnique({
        where: { phoneNumber },
        include: {
          farmerProfile: true,
          credits: true,
        }
      });

      // 3. Create new user if doesn't exist
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            phoneNumber,
            name: name || null,
            role: 'FARMER',
            // Create farmer profile if additional data provided
            farmerProfile: (name || languagePref || location) ? {
              create: {
                languagePref: languagePref || 'hi-IN',
                location: location || null,
              }
            } : undefined,
            // Give welcome credits
            credits: {
              create: {
                balance: 100,
                currency: 'CREDITS',
              }
            }
          },
          include: {
            farmerProfile: true,
            credits: true,
          }
        });

        // Log new user registration
        await this.prisma.activityLog.create({
          data: {
            userId: user.id,
            action: 'USER_REGISTERED',
            metadata: {
              source: 'OTP_VERIFICATION',
              phoneNumber,
            }
          }
        });

        console.log(`✅ New user created: ${phoneNumber}`);
      } else {
        // Update existing user if new data provided
        if (name && !user.name) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { name },
            include: {
              farmerProfile: true,
              credits: true,
            }
          });
        }

        console.log(`✅ Existing user logged in: ${phoneNumber}`);
      }

      // 4. Create session
      const session = await this.prisma.session.create({
        data: {
          userId: user.id,
          sessionToken: this.generateSessionToken(),
          expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        }
      });

      // 5. Log successful login
      await this.prisma.activityLog.create({
        data: {
          userId: user.id,
          action: 'USER_LOGIN',
          metadata: {
            source: 'OTP_VERIFICATION',
            sessionId: session.id,
          }
        }
      });

      // 6. Return user data with session
      return {
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          phoneNumber: user.phoneNumber,
          name: user.name,
          role: user.role,
          profile: user.farmerProfile,
          credits: user.credits?.balance || 0,
          isNewUser: !user.name,
        },
        session: {
          token: session.sessionToken,
          expires: session.expires,
        }
      };

    } catch (error) {
      console.error('❌ OTP verification error:', error);
      throw new HttpException(
        error.message || 'OTP verification failed',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private generateSessionToken(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}
