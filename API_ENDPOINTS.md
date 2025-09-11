# Auth Service API Documentation

## Base URL
```
http://localhost:3000
```

## Environment Variables Required
```bash
# Add these to your .env file
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key
FAST2SMS_API_KEY=your-fast2sms-api-key
```

## API Endpoints

### 1. Send WhatsApp OTP
**POST** `/auth/send-whatsapp-otp`

**Request Body:**
```json
{
  "mobile": "9876543210"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully via WhatsApp",
  "mobile": "9876543210",
  "expiresIn": "10 minutes"
}
```

---

### 2. Send SMS OTP
**POST** `/auth/send-sms-otp`

**Request Body:**
```json
{
  "mobile": "9876543210"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully via SMS",
  "mobile": "9876543210",
  "expiresIn": "10 minutes"
}
```

---

### 3. Verify OTP
**POST** `/auth/verify-otp`

**Request Body:**
```json
{
  "mobile": "9876543210",
  "otp": "123456"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "mobile": "9876543210",
    "verified": true
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Invalid OTP",
  "attemptsRemaining": 2
}
```

---

### 4. Resend WhatsApp OTP
**POST** `/auth/resend-whatsapp-otp`

**Request Body:**
```json
{
  "mobile": "9876543210"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP resent successfully via WhatsApp",
  "mobile": "9876543210",
  "expiresIn": "10 minutes"
}
```

---

### 5. Resend SMS OTP
**POST** `/auth/resend-sms-otp`

**Request Body:**
```json
{
  "mobile": "9876543210"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP resent successfully via SMS",
  "mobile": "9876543210",
  "expiresIn": "10 minutes"
}
```

---

### 6. Verify JWT Token
**POST** `/auth/verify-token`

**Request Body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Success Response:**
```json
{
  "valid": true,
  "payload": {
    "mobile": "9876543210",
    "verified": true,
    "iat": 1703123456,
    "exp": 1703209856
  }
}
```

**Error Response:**
```json
{
  "statusCode": 401,
  "message": "Invalid or expired token"
}
```

---

### 7. Get User Profile
**GET** `/auth/profile`

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "mobile": "9876543210",
  "verified": true,
  "iat": 1703123456,
  "exp": 1703209856
}
```

---

### 8. Get OTP Status (Debug Only)
**GET** `/auth/otp-status/{mobile}`

**Example:** `/auth/otp-status/9876543210`

**Response:**
```json
{
  "exists": true,
  "expired": false,
  "verified": false,
  "attempts": 1,
  "timeRemaining": 547
}
```

**No OTP Response:**
```json
{
  "exists": false
}
```

---

### 9. Send Custom SMS
**POST** `/auth/send-sms`

**Request Body:**
```json
{
  "mobile": "9876543210",
  "message": "🌾 Weather Alert: Heavy rainfall expected in your area. Please take necessary precautions for your crops."
}
```

**Response:**
```json
{
  "success": true,
  "message": "SMS sent successfully",
  "mobile": "9876543210"
}
```

---

### 10. Health Check
**GET** `/auth/health`

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "services": {
    "redis": "connected",
    "sms": "available"
  }
}
```

## Testing with Postman

### 1. Import Collection
1. Open Postman
2. Click "Import" button
3. Select the `postman-collection.json` file
4. The collection will be imported with all endpoints

### 2. Set Variables
The collection includes these variables:
- `baseUrl`: http://localhost:3000
- `mobile`: 9876543210 (change to your test number)
- `jwt_token`: (automatically set after OTP verification)

### 3. Testing Flow
1. **Start the server:** `npm run start:dev`
2. **Send OTP:** Use "Send WhatsApp OTP" or "Send SMS OTP"
3. **Check OTP:** Use "Get OTP Status" to see the generated OTP (debug only)
4. **Verify OTP:** Use "Verify OTP" with the correct OTP
5. **Test Protected Routes:** Use "Get User Profile" with the JWT token
6. **Test Other Features:** Try resend, custom SMS, health check

### 4. Common Test Scenarios

#### Successful OTP Flow
```bash
1. POST /auth/send-sms-otp → Get OTP
2. GET /auth/otp-status/{mobile} → Check OTP (debug)
3. POST /auth/verify-otp → Get JWT token
4. GET /auth/profile → Access protected route
```

#### Error Scenarios
```bash
1. Invalid OTP → 400 Bad Request
2. Expired OTP → 400 Bad Request
3. Too many attempts → 429 Too Many Requests
4. Invalid JWT → 401 Unauthorized
5. Missing mobile → 400 Bad Request
```

## Winston Logging

The service now includes comprehensive Winston logging:

### Log Levels
- **INFO**: Successful operations, API calls
- **WARN**: Invalid attempts, expired OTPs
- **ERROR**: Failures, exceptions
- **DEBUG**: Detailed debugging information

### Log Format
```json
{
  "level": "info",
  "message": "🔐 OTP sent successfully via SMS for: 9876543210",
  "context": "AuthService",
  "method": "sendOtp",
  "mobile": "9876543210",
  "channel": "SMS",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Log Files
- **Combined logs:** `logs/combined.log`
- **Error logs:** `logs/error.log`
- **Console output:** Formatted for development

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 400 | Invalid mobile number | Mobile number format is incorrect |
| 400 | Invalid OTP | OTP is incorrect or malformed |
| 400 | OTP expired | OTP has exceeded 10-minute limit |
| 429 | Too many attempts | Maximum 3 OTP attempts exceeded |
| 429 | Please wait before requesting new OTP | Cooldown period active |
| 401 | Invalid or expired token | JWT token is invalid |
| 500 | Internal server error | Server-side error occurred |

## Rate Limiting

- **OTP Generation:** 1 request per 60 seconds per mobile
- **OTP Verification:** 3 attempts per OTP
- **OTP Expiry:** 10 minutes

## Security Features

- ✅ Mobile number validation and sanitization
- ✅ OTP expiry (10 minutes)
- ✅ Maximum attempt limits (3 attempts)
- ✅ Rate limiting for OTP generation
- ✅ JWT token authentication
- ✅ Redis-based session management
- ✅ Comprehensive logging for audit trails
- ✅ Input validation and sanitization

## Production Considerations

1. **Remove Debug Endpoints:** Remove `/auth/otp-status` endpoint
2. **Environment Variables:** Use secure values for JWT_SECRET
3. **Rate Limiting:** Implement additional rate limiting
4. **HTTPS:** Use HTTPS in production
5. **Log Rotation:** Configure log rotation for Winston
6. **Monitoring:** Set up monitoring and alerting
7. **Redis Security:** Secure Redis with authentication
8. **SMS Provider:** Configure production SMS provider settings

## Troubleshooting

### Common Issues

1. **Redis Connection Error**
   ```bash
   # Check Redis is running
   redis-cli ping
   # Should return: PONG
   ```

2. **SMS Not Sending**
   - Check FAST2SMS_API_KEY in .env
   - Verify API key has sufficient balance
   - Check mobile number format

3. **JWT Token Issues**
   - Verify JWT_SECRET is set
   - Check token expiry
   - Ensure Bearer token format

4. **OTP Not Working**
   - Check OTP expiry (10 minutes)
   - Verify attempt count (max 3)
   - Check mobile number format

### Debug Commands

```bash
# Check logs
tail -f logs/combined.log

# Check Redis data
redis-cli
> KEYS otp:*
> GET otp:9876543210

# Test API health
curl http://localhost:3000/auth/health
```