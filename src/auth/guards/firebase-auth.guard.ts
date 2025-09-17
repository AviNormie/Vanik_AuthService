// src/auth/guards/firebase-auth.guard.ts
import { Injectable, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { FirebaseService } from '../../firebase/firebase.service'; // Fixed import

@Injectable()
export class FirebaseAuthGuard extends AuthGuard('firebase-custom') {
  constructor(
    private firebaseService: FirebaseService, // Fixed service name
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    this.logger.info('Firebase auth guard triggered', {
      context: 'FirebaseAuthGuard',
      hasAuthHeader: !!authHeader,
      route: request.route?.path,
      method: request.method,
    });

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('Authentication failed - no token provided', {
        context: 'FirebaseAuthGuard',
        route: request.route?.path,
      });
      throw new UnauthorizedException('No token provided');
    }

    const idToken = authHeader.split(' ')[1];

    try {
      const decodedToken = await this.firebaseService.verifyIdToken(idToken);
      
      // Attach user info to request
      request.user = {
        uid: decodedToken.uid,
        phone: decodedToken.phone_number,
        email: decodedToken.email,
        verified: decodedToken.phone_number_verified || decodedToken.email_verified,
        customClaims: decodedToken.customClaims || {},
        firebaseToken: decodedToken,
      };

      this.logger.info('Authentication successful', {
        context: 'FirebaseAuthGuard',
        uid: decodedToken.uid,
        phone: decodedToken.phone_number,
        route: request.route?.path,
      });

      return true;
    } catch (error) {
      this.logger.error('Authentication failed', {
        context: 'FirebaseAuthGuard',
        error: error.message,
        route: request.route?.path,
      });
      
      throw new UnauthorizedException(`Authentication failed: ${error.message}`);
    }
  }
}
