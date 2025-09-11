// src/auth/dto/auth.dto.ts
import { IsPhoneNumber, IsNotEmpty, Length, IsOptional, IsString } from 'class-validator';

export class SendOtpDto {
  @IsPhoneNumber('IN', { message: 'Please provide a valid Indian mobile number' })
  @IsNotEmpty()
  mobile: string;
}

export class VerifyOtpDto {
  @IsPhoneNumber('IN', { message: 'Please provide a valid Indian mobile number' })
  @IsNotEmpty()
  mobile: string;

  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;
}

export class ResendOtpDto {
  @IsPhoneNumber('IN', { message: 'Please provide a valid Indian mobile number' })
  @IsNotEmpty()
  mobile: string;
}

export class SendSmsDto {
  @IsPhoneNumber('IN', { message: 'Please provide a valid Indian mobile number' })
  @IsNotEmpty()
  mobile: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
