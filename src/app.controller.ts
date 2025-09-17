// src/app.controller.ts
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { AppService } from './app.service';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  @Get()
  @ApiOperation({ summary: 'API root endpoint' })
  @ApiResponse({ 
    status: 200, 
    description: 'Welcome message',
    schema: {
      example: {
        message: 'Hello World! NestJS Auth Service is running successfully!',
        version: '1.0.0',
        documentation: '/api'
      }
    }
  })
  getHello(): string { // Changed return type to string
    this.logger.info('Root endpoint accessed', {
      context: 'AppController',
      method: 'getHello',
    });
    
    // Return just the message string to match the test
    return 'Hello World! NestJS Auth Service is running successfully!';
  }

  // Add a separate endpoint for detailed info
  @Get('info')
  @ApiOperation({ summary: 'API information endpoint' })
  @ApiResponse({ 
    status: 200, 
    description: 'Detailed API information'
  })
  getInfo(): object {
    this.logger.info('Info endpoint accessed', {
      context: 'AppController',
      method: 'getInfo',
    });
    
    return {
      message: 'Hello World! NestJS Auth Service is running successfully!',
      version: '1.0.0',
      documentation: '/api',
      status: 'running',
      timestamp: new Date().toISOString()
    };
  }
}
