// src/auth/dto/auth.dto.ts
import { IsPhoneNumber, IsNotEmpty, IsOptional, IsString, IsArray, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyTokenDto {
  @ApiProperty({
    description: 'Firebase ID token received from frontend authentication',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjY...',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}

export class CompleteProfileDto {
  @ApiProperty({
    description: 'Farmer name',
    example: 'राम कुमार (Ram Kumar)',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Village name',
    example: 'बागपत (Bagpat)',
    required: false,
  })
  @IsString()
  @IsOptional()
  village?: string;

  @ApiProperty({
    description: 'District name',
    example: 'मेरठ (Meerut)',
    required: false,
  })
  @IsString()
  @IsOptional()
  district?: string;

  @ApiProperty({
    description: 'State name',
    example: 'उत्तर प्रदेश (Uttar Pradesh)',
    required: false,
  })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({
    description: 'Types of crops grown',
    example: ['धान (Rice)', 'गेहूँ (Wheat)', 'मक्का (Corn)'],
    required: false,
    type: [String],
  })
  @IsArray()
  @IsOptional()
  cropTypes?: string[];

  @ApiProperty({
    description: 'Farm size in acres',
    example: 5.5,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  farmSize?: number;

  @ApiProperty({
    description: 'Preferred language',
    example: 'hindi',
    enum: ['hindi', 'english', 'punjabi', 'marathi', 'tamil', 'telugu', 'bengali'],
    required: false,
  })
  @IsString()
  @IsOptional()
  language?: string;
}

export class PhoneAuthDto {
  @ApiProperty({
    description: 'Indian mobile number',
    example: '+919876543210',
  })
  @IsPhoneNumber('IN', { message: 'Please provide a valid Indian mobile number' })
  @IsNotEmpty()
  phoneNumber: string;
}
