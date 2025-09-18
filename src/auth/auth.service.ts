// src/auth/auth.service.ts
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

// In-memory OTP storage for hackathon (use Redis in production)
const otpStore = new Map<string, { otp: string; expiresAt: Date }>();

interface CompleteProfileDto {
  name: string;
  languagePref?: string;
  location?: string;
  gpsLat?: number;
  gpsLong?: number;
  landHoldings?: {
    sizeAcre?: number;
    irrigation?: string;
    location?: string;
  }[];
  crops?: {
    cropType: string;
    variety?: string;
    season?: string;
    stage?: 'PLANNING' | 'SOWN' | 'VEGETATIVE' | 'FLOWERING' | 'FRUITING' | 'HARVEST' | 'POSTHARVEST';
  }[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService?: JwtService,
  ) {}

  // ===== OTP AUTHENTICATION METHODS =====

  /**
   * Send OTP to phone number
   */
  async sendOTP(phoneNumber: string): Promise<void> {
    try {
      this.logger.log(`📱 Sending OTP to: ${phoneNumber}`);

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Store OTP in memory (use Redis in production)
      otpStore.set(phoneNumber, { otp, expiresAt });

      // For hackathon: Log the OTP (in production: send via SMS)
      console.log(`🔑 OTP for ${phoneNumber}: ${otp} (expires in 5 minutes)`);
      
      // TODO: Integrate with SMS service
      // await this.smsService.sendSMS(phoneNumber, `Your agricultural AI assistant OTP: ${otp}. Valid for 5 minutes.`);

      this.logger.log(`✅ OTP sent successfully to ${phoneNumber}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send OTP to ${phoneNumber}:`, error);
      throw new HttpException('Failed to send OTP', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Verify OTP and return validation result
   */
  async verifyOTP(phoneNumber: string, otp: string): Promise<boolean> {
    try {
      this.logger.log(`🔍 Verifying OTP for: ${phoneNumber}`);

      const storedOTP = otpStore.get(phoneNumber);

      if (!storedOTP) {
        this.logger.warn(`❌ No OTP found for: ${phoneNumber}`);
        return false;
      }

      // Check if OTP is expired
      if (new Date() > storedOTP.expiresAt) {
        this.logger.warn(`⏰ OTP expired for: ${phoneNumber}`);
        otpStore.delete(phoneNumber);
        return false;
      }

      // Check if OTP matches
      if (storedOTP.otp !== otp) {
        this.logger.warn(`❌ Invalid OTP for: ${phoneNumber}`);
        return false;
      }

      // OTP is valid - clean up
      otpStore.delete(phoneNumber);
      this.logger.log(`✅ OTP verified successfully for: ${phoneNumber}`);
      return true;

    } catch (error) {
      this.logger.error(`❌ OTP verification error for ${phoneNumber}:`, error);
      return false;
    }
  }

  // ===== USER MANAGEMENT METHODS =====

  /**
   * Create or update user after successful OTP verification
   */
  async createOrUpdateUser(phoneNumber: string, profileData?: CompleteProfileDto) {
    try {
      this.logger.log(`👤 Creating/updating user: ${phoneNumber}`);

      // Check if user exists
      let user = await this.prisma.user.findUnique({
        where: { phoneNumber },
        include: {
          farmerProfile: {
            include: {
              landHoldings: true,
              crops: true,
            }
          },
          credits: true,
        }
      });

      let isNewUser = false;

      if (!user) {
        // Create new user
        isNewUser = true;
        user = await this.prisma.user.create({
          data: {
            phoneNumber,
            name: profileData?.name || null,
            role: 'FARMER',
            // Create farmer profile if data provided
            farmerProfile: profileData ? {
              create: {
                languagePref: profileData.languagePref || 'hi-IN',
                location: profileData.location || null,
                gpsLat: profileData.gpsLat || null,
                gpsLong: profileData.gpsLong || null,
                landHoldings: profileData.landHoldings ? {
                  create: profileData.landHoldings
                } : undefined,
                crops: profileData.crops ? {
                  create: profileData.crops
                } : undefined,
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
            farmerProfile: {
              include: {
                landHoldings: true,
                crops: true,
              }
            },
            credits: true,
          }
        });

        // Log user registration
        await this.prisma.activityLog.create({
          data: {
            userId: user.id,
            action: 'USER_REGISTERED',
            metadata: {
              source: 'OTP_VERIFICATION',
              phoneNumber,
              hasProfile: !!profileData?.name,
              landCount: profileData?.landHoldings?.length || 0,
              cropCount: profileData?.crops?.length || 0,
            }
          }
        });

        this.logger.log(`✅ New user created: ${phoneNumber}`);
      } else {
        // Update existing user if new data provided
        if (profileData?.name && !user.name) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { 
              name: profileData.name,
              farmerProfile: user.farmerProfile ? {
                update: {
                  languagePref: profileData.languagePref,
                  location: profileData.location,
                  gpsLat: profileData.gpsLat,
                  gpsLong: profileData.gpsLong,
                }
              } : {
                create: {
                  languagePref: profileData.languagePref || 'hi-IN',
                  location: profileData.location || null,
                  gpsLat: profileData.gpsLat || null,
                  gpsLong: profileData.gpsLong || null,
                }
              }
            },
            include: {
              farmerProfile: {
                include: {
                  landHoldings: true,
                  crops: true,
                }
              },
              credits: true,
            }
          });
        }

        this.logger.log(`✅ Existing user updated: ${phoneNumber}`);
      }

      return { user, isNewUser };
    } catch (error) {
      this.logger.error(`❌ Failed to create/update user ${phoneNumber}:`, error);
      throw new HttpException('User creation/update failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Complete user profile with additional information
   */
  async completeProfile(userId: string, profileData: CompleteProfileDto) {
    try {
      this.logger.log(`📝 Completing profile for user: ${userId}`);

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { farmerProfile: true }
      });

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Update user name
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          name: profileData.name,
          farmerProfile: user.farmerProfile ? {
            update: {
              languagePref: profileData.languagePref,
              location: profileData.location,
              gpsLat: profileData.gpsLat,
              gpsLong: profileData.gpsLong,
            }
          } : {
            create: {
              languagePref: profileData.languagePref || 'hi-IN',
              location: profileData.location || null,
              gpsLat: profileData.gpsLat || null,
              gpsLong: profileData.gpsLong || null,
            }
          }
        },
        include: {
          farmerProfile: {
            include: {
              landHoldings: true,
              crops: true,
            }
          },
          credits: true,
        }
      });

      // Add land holdings if provided
      if (profileData.landHoldings && profileData.landHoldings.length > 0) {
        await Promise.all(
          profileData.landHoldings.map(land =>
            this.prisma.landHolding.create({
              data: {
                farmerId: updatedUser.farmerProfile!.id,
                ...land,
              }
            })
          )
        );
      }

      // Add crops if provided
      if (profileData.crops && profileData.crops.length > 0) {
        await Promise.all(
          profileData.crops.map(crop =>
            this.prisma.cropRecord.create({
              data: {
                farmerId: updatedUser.farmerProfile!.id,
                ...crop,
              }
            })
          )
        );
      }

      // Log profile completion
      await this.prisma.activityLog.create({
        data: {
          userId,
          action: 'PROFILE_COMPLETED',
          metadata: {
            landCount: profileData.landHoldings?.length || 0,
            cropCount: profileData.crops?.length || 0,
          }
        }
      });

      this.logger.log(`✅ Profile completed for user: ${userId}`);
      return updatedUser;

    } catch (error) {
      this.logger.error(`❌ Profile completion failed for user ${userId}:`, error);
      throw new HttpException('Profile completion failed', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          farmerProfile: {
            include: {
              landHoldings: true,
              crops: true,
              soilTests: {
                take: 5,
                orderBy: { createdAt: 'desc' }
              },
              queries: {
                take: 10,
                orderBy: { createdAt: 'desc' }
              },
            }
          },
          credits: true,
          activityLogs: {
            take: 20,
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      return user;
    } catch (error) {
      this.logger.error(`❌ Failed to get user profile ${userId}:`, error);
      throw error;
    }
  }

  // ===== SESSION MANAGEMENT METHODS =====

  /**
   * Generate session token
   */
  generateSessionToken(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  /**
   * Create user session
   */
  async createSession(userId: string, deviceInfo?: string, ipAddress?: string) {
    try {
      const sessionToken = this.generateSessionToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const session = await this.prisma.session.create({
        data: {
          userId,
          sessionToken,
          expires: expiresAt,
        }
      });

      // Log session creation
      await this.prisma.activityLog.create({
        data: {
          userId,
          action: 'SESSION_CREATED',
          metadata: {
            sessionId: session.id,
            deviceInfo,
            ipAddress,
          }
        }
      });

      return session;
    } catch (error) {
      this.logger.error(`❌ Failed to create session for user ${userId}:`, error);
      throw new HttpException('Session creation failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Validate session token
   */
  async validateSession(sessionToken: string) {
    try {
      const session = await this.prisma.session.findUnique({
        where: { sessionToken },
        include: {
          user: {
            include: {
              farmerProfile: true,
              credits: true,
            }
          }
        }
      });

      if (!session) {
        return null;
      }

      // Check if session is expired
      if (new Date() > session.expires) {
        // Clean up expired session
        await this.prisma.session.delete({
          where: { id: session.id }
        });
        return null;
      }

      return session;
    } catch (error) {
      this.logger.error('❌ Session validation failed:', error);
      return null;
    }
  }

  /**
   * Invalidate session (logout)
   */
  async logout(sessionToken: string): Promise<boolean> {
    try {
      const session = await this.prisma.session.findUnique({
        where: { sessionToken }
      });

      if (session) {
        await this.prisma.session.delete({
          where: { sessionToken }
        });

        // Log logout
        await this.prisma.activityLog.create({
          data: {
            userId: session.userId,
            action: 'USER_LOGOUT',
            metadata: {
              sessionId: session.id,
            }
          }
        });

        this.logger.log(`✅ User logged out successfully`);
      }

      return true;
    } catch (error) {
      this.logger.error('❌ Logout failed:', error);
      return false;
    }
  }

  /**
   * Get user sessions
   */
  async getUserSessions(userId: string) {
    try {
      return await this.prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      this.logger.error(`❌ Failed to get user sessions for ${userId}:`, error);
      throw error;
    }
  }

  // ===== FARMER QUERY METHODS =====

  /**
   * Save farmer query for AI context
   */
  async saveFarmerQuery(userId: string, queryText: string, answerText?: string, metadata?: any) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { farmerProfile: true }
      });

      if (!user?.farmerProfile) {
        throw new HttpException('Farmer profile not found', HttpStatus.NOT_FOUND);
      }

      const query = await this.prisma.farmerQuery.create({
        data: {
          farmerId: user.farmerProfile.id,
          queryText,
          answerText,
          language: user.farmerProfile.languagePref || 'hi-IN',
          source: 'text',
          metadata,
        }
      });

      return query;
    } catch (error) {
      this.logger.error(`❌ Failed to save farmer query for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get farmer query history
   */
  async getFarmerQueries(userId: string, limit: number = 20) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { farmerProfile: true }
      });

      if (!user?.farmerProfile) {
        throw new HttpException('Farmer profile not found', HttpStatus.NOT_FOUND);
      }

      return await this.prisma.farmerQuery.findMany({
        where: { farmerId: user.farmerProfile.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    } catch (error) {
      this.logger.error(`❌ Failed to get farmer queries for user ${userId}:`, error);
      throw error;
    }
  }

  // ===== CREDIT MANAGEMENT =====

  /**
   * Add credits to user account
   */
  async addCredits(userId: string, amount: number, description?: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { credits: true }
      });

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Update credit balance
      const updatedCredits = await this.prisma.creditBalance.update({
        where: { userId },
        data: {
          balance: { increment: amount },
          transactions: {
            create: {
              amount,
              type: amount > 0 ? 'RECHARGE' : 'PURCHASE',
              description: description || `Credits ${amount > 0 ? 'added' : 'deducted'}`,
            }
          }
        },
        include: { transactions: true }
      });

      this.logger.log(`💰 Credits updated for user ${userId}: ${amount}`);
      return updatedCredits;
    } catch (error) {
      this.logger.error(`❌ Failed to add credits for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Check if user has sufficient credits
   */
  async hasSufficientCredits(userId: string, requiredAmount: number): Promise<boolean> {
    try {
      const credits = await this.prisma.creditBalance.findUnique({
        where: { userId }
      });

      return credits ? credits.balance >= requiredAmount : false;
    } catch (error) {
      this.logger.error(`❌ Failed to check credits for user ${userId}:`, error);
      return false;
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Clean up expired OTPs (call this periodically)
   */
  cleanupExpiredOTPs(): void {
    const now = new Date();
    for (const [phoneNumber, otpData] of otpStore.entries()) {
      if (now > otpData.expiresAt) {
        otpStore.delete(phoneNumber);
      }
    }
    this.logger.log(`🧹 Cleaned up expired OTPs`);
  }

  /**
   * Get application statistics
   */
  async getAppStats() {
    try {
      const totalUsers = await this.prisma.user.count();
      const activeSessions = await this.prisma.session.count({
        where: {
          expires: { gt: new Date() }
        }
      });
      const totalQueries = await this.prisma.farmerQuery.count();
      const totalCreditsIssued = await this.prisma.creditBalance.aggregate({
        _sum: { balance: true }
      });

      return {
        totalUsers,
        activeSessions,
        totalQueries,
        totalCreditsIssued: totalCreditsIssued._sum.balance || 0,
      };
    } catch (error) {
      this.logger.error('❌ Failed to get app stats:', error);
      throw error;
    }
  }
}
