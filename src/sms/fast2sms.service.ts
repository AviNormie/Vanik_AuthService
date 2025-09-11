// src/sms/fast2sms.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class Fast2SmsService {
  private readonly apiKey: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('FAST2SMS_API_KEY') || '';
  }

  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendOtp(mobile: string): Promise<{ success: boolean; otp: string; message: string }> {
    try {
      const otp = this.generateOTP();
      
      const response = await axios.post('https://www.fast2sms.com/dev/bulkV2', {
        route: 'q', // Quick SMS route - no DLT needed
        message: `Your agricultural platform OTP is ${otp}. Valid for 10 minutes. Do not share with anyone.`,
        language: 'english',
        flash: 0,
        numbers: mobile
      }, {
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      console.log('Fast2SMS Response:', response.data);

      if (response.data.return === true) {
        return {
          success: true,
          otp: otp,
          message: 'OTP sent successfully'
        };
      }

      throw new Error(response.data.message || 'SMS delivery failed');
    } catch (error) {
      console.error('Fast2SMS Error:', error.response?.data || error.message);
      throw new HttpException(
        `OTP send failed: ${error.response?.data?.message || error.message}`, 
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async sendCustomSms(mobile: string, message: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.post('https://www.fast2sms.com/dev/bulkV2', {
        route: 'q',
        message: message,
        language: 'english',
        flash: 0,
        numbers: mobile
      }, {
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.return === true) {
        return {
          success: true,
          message: 'SMS sent successfully'
        };
      }

      throw new Error(response.data.message || 'SMS delivery failed');
    } catch (error) {
      throw new HttpException(
        `SMS send failed: ${error.response?.data?.message || error.message}`, 
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
