// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Use Winston logger
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Enable CORS for frontend
  app.enableCors({
    origin: ['https://your-frontend-domain.vercel.app', 'http://localhost:3000'],
    credentials: true,
  });

  // Enable validation pipes
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Agricultural Platform API - Firebase Phone Authentication')
    .setDescription('API for Firebase-based phone number authentication with OTP verification for Indian farmers')
    .setVersion('1.0')
    .addTag('auth', 'Authentication endpoints')
    .addTag('farmers', 'Farmer management endpoints')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Firebase ID Token',
        name: 'Firebase Authentication',
        description: 'Enter Firebase ID Token',
        in: 'header',
      },
      'firebase-auth',
    )
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🌾 Agricultural Platform API is running on: http://localhost:${port}`);
  console.log(`📚 Swagger UI is available at: http://localhost:${port}/api`);
  console.log(`🔥 Firebase Authentication enabled`);
}

// For Vercel serverless deployment
if (process.env.NODE_ENV !== 'production') {
  bootstrap();
}

// Export for Vercel
export default async (req: any, res: any) => {
  if (!global.__app) {
    const app = await NestFactory.create(AppModule);
    
    app.enableCors({
      origin: true,
      credentials: true,
    });
    
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));

    await app.init();
    global.__app = app.getHttpAdapter().getInstance();
  }

  return global.__app(req, res);
};
