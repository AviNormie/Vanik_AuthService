import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Injectable()
export class AppService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  getHello(): string {
    this.logger.info('Hello endpoint called', { context: 'AppService' });
    return 'Hello World! NestJS Auth Service is running successfully!';
  }

  getHealth(): object {
    this.logger.info('Health check endpoint called', { context: 'AppService' });
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'Auth Service SIH',
      version: '1.0.0',
    };
  }
}
