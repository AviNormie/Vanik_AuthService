// src/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret-key',
    });
  }

  async validate(payload: any) {
    if (!payload.mobile || !payload.verified) {
      throw new UnauthorizedException('Invalid token payload');
    }

    return {
      mobile: payload.mobile,
      verified: payload.verified,
      iat: payload.iat
    };
  }
}
