// src/firebase/firebase.service.ts
import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private app: admin.app.App;

  constructor(
    private configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  onModuleInit() {
    try {
      // Initialize Firebase Admin SDK
      const serviceAccount = {
        projectId: this.configService.get<string>('FIREBASE_PROJECT_ID'),
        clientEmail: this.configService.get<string>('FIREBASE_CLIENT_EMAIL'),
        privateKey: this.configService.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
      };

      // Check if all required Firebase credentials are provided
      if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey || 
          serviceAccount.projectId === 'your-firebase-project-id') {
        this.logger.warn('Firebase credentials not configured. Firebase features will be disabled.', {
          context: 'FirebaseService',
        });
        return;
      }

      this.app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
        projectId: serviceAccount.projectId,
      });

      this.logger.info('Firebase Admin SDK initialized successfully', {
        context: 'FirebaseService',
        projectId: serviceAccount.projectId,
      });
    } catch (error) {
      this.logger.warn('Failed to initialize Firebase Admin SDK. Firebase features will be disabled.', {
        context: 'FirebaseService',
        error: error.message,
      });
      // Don't throw error, just log warning and continue without Firebase
    }
  }

  get auth(): admin.auth.Auth {
    if (!this.app) {
      throw new Error('Firebase not initialized. Please configure Firebase credentials.');
    }
    return admin.auth(this.app);
  }

  get firestore(): admin.firestore.Firestore {
    if (!this.app) {
      throw new Error('Firebase not initialized. Please configure Firebase credentials.');
    }
    return admin.firestore(this.app);
  }

  // Verify Firebase ID token
  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    try {
      const decodedToken = await this.auth.verifyIdToken(idToken, true);
      
      this.logger.info('Firebase token verified successfully', {
        context: 'FirebaseService',
        uid: decodedToken.uid,
        phone: decodedToken.phone_number,
      });
      
      return decodedToken;
    } catch (error) {
      this.logger.error('Firebase token verification failed', {
        context: 'FirebaseService',
        error: error.message,
        tokenPreview: idToken?.substring(0, 20) + '...',
      });
      throw new Error(`Invalid Firebase token: ${error.message}`);
    }
  }

  // Get user by phone number
  async getUserByPhone(phoneNumber: string): Promise<admin.auth.UserRecord | null> {
    try {
      const user = await this.auth.getUserByPhoneNumber(phoneNumber);
      
      this.logger.info('User found by phone number', {
        context: 'FirebaseService',
        phoneNumber,
        uid: user.uid,
      });
      
      return user;
    } catch (error) {
      this.logger.warn('User not found by phone number', {
        context: 'FirebaseService',
        phoneNumber,
        error: error.message,
      });
      return null;
    }
  }

  // Create custom token for user
  async createCustomToken(uid: string, customClaims?: object): Promise<string> {
    try {
      const customToken = await this.auth.createCustomToken(uid, customClaims);
      
      this.logger.info('Custom token created', {
        context: 'FirebaseService',
        uid,
        customClaims,
      });
      
      return customToken;
    } catch (error) {
      this.logger.error('Failed to create custom token', {
        context: 'FirebaseService',
        uid,
        error: error.message,
      });
      throw error;
    }
  }

  // Set custom claims (for role-based access)
  async setCustomUserClaims(uid: string, customClaims: object): Promise<void> {
    try {
      await this.auth.setCustomUserClaims(uid, customClaims);
      
      this.logger.info('Custom claims set successfully', {
        context: 'FirebaseService',
        uid,
        customClaims,
      });
    } catch (error) {
      this.logger.error('Failed to set custom claims', {
        context: 'FirebaseService',
        uid,
        error: error.message,
      });
      throw error;
    }
  }

  // Update user profile
  async updateUser(uid: string, properties: admin.auth.UpdateRequest): Promise<admin.auth.UserRecord> {
    try {
      const updatedUser = await this.auth.updateUser(uid, properties);
      
      this.logger.info('User updated successfully', {
        context: 'FirebaseService',
        uid,
        properties,
      });
      
      return updatedUser;
    } catch (error) {
      this.logger.error('Failed to update user', {
        context: 'FirebaseService',
        uid,
        error: error.message,
      });
      throw error;
    }
  }
}
