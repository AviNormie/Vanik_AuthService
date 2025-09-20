# Auth Service SIH

A NestJS-based authentication service for the Agricultural Platform, featuring Firebase phone authentication and JWT token management.

## 🚀 Live Service

**Service URL:** https://auth-service-sih-o57bewdwya-uc.a.run.app

## 🛠️ Tech Stack

- **Framework:** NestJS
- **Database:** PostgreSQL
- **Authentication:** Firebase Auth + JWT
- **Deployment:** Google Cloud Run
- **CI/CD:** GitHub Actions

## 📋 Prerequisites

- Node.js 18+
- Docker
- Google Cloud SDK
- Firebase project with Authentication enabled

## 🚀 Quick Start

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Auth_Service_SIH
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   FIREBASE_PROJECT_ID=your-firebase-project-id
   FIREBASE_CLIENT_EMAIL=your-firebase-client-email
   FIREBASE_PRIVATE_KEY="your-firebase-private-key"
   JWT_SECRET=your-super-secure-jwt-secret
   NODE_ENV=development
   PORT=3000
   ```

4. **Run the application**
   ```bash
   # Development mode
   npm run start:dev
   
   # Production mode
   npm run build
   npm run start:prod
   ```

5. **Access the API**
   - API: http://localhost:3000
   - Swagger Documentation: http://localhost:3000/api

## 🐳 Docker

### Build and Run Locally

```bash
# Build the Docker image
docker build --platform linux/amd64 -t auth-service-sih .

# Run the container
docker run -p 3000:3000 \
  -e FIREBASE_PROJECT_ID=your-project-id \
  -e FIREBASE_CLIENT_EMAIL=your-client-email \
  -e FIREBASE_PRIVATE_KEY="your-private-key" \
  -e JWT_SECRET=your-jwt-secret \
  -e NODE_ENV=production \
  auth-service-sih
```

## ☁️ Google Cloud Run Deployment

### Manual Deployment

1. **Build and push to Google Container Registry**
   ```bash
   # Configure Docker for GCR
   gcloud auth configure-docker
   
   # Build and tag
   docker build --platform linux/amd64 -t gcr.io/agro-ai-service-20250918/auth-service-sih:latest .
   
   # Push to GCR
   docker push gcr.io/agro-ai-service-20250918/auth-service-sih:latest
   ```

2. **Deploy to Cloud Run**
   ```bash
   gcloud run deploy auth-service-sih \
     --image gcr.io/agro-ai-service-20250918/auth-service-sih:latest \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --port 3000 \
     --memory 512Mi \
     --cpu 1 \
     --max-instances 10 \
     --set-env-vars="FIREBASE_PROJECT_ID=your-project-id,FIREBASE_CLIENT_EMAIL=your-client-email,FIREBASE_PRIVATE_KEY=your-private-key,JWT_SECRET=your-jwt-secret,NODE_ENV=production"
   ```

## 🔧 GitHub Actions CI/CD Setup

### Required Repository Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

1. **GCP_SA_KEY**
   - Description: Google Cloud Service Account JSON key
   - How to get:
     ```bash
     # Create a service account
     gcloud iam service-accounts create github-actions-sa \
       --display-name="GitHub Actions Service Account"
     
     # Grant necessary permissions
     gcloud projects add-iam-policy-binding agro-ai-service-20250918 \
       --member="serviceAccount:github-actions-sa@agro-ai-service-20250918.iam.gserviceaccount.com" \
       --role="roles/run.admin"
     
     gcloud projects add-iam-policy-binding agro-ai-service-20250918 \
       --member="serviceAccount:github-actions-sa@agro-ai-service-20250918.iam.gserviceaccount.com" \
       --role="roles/storage.admin"
     
     gcloud projects add-iam-policy-binding agro-ai-service-20250918 \
       --member="serviceAccount:github-actions-sa@agro-ai-service-20250918.iam.gserviceaccount.com" \
       --role="roles/iam.serviceAccountUser"
     
     # Create and download the key
     gcloud iam service-accounts keys create github-actions-key.json \
       --iam-account=github-actions-sa@agro-ai-service-20250918.iam.gserviceaccount.com
     ```

2. **FIREBASE_PROJECT_ID**
   - Value: `campus-cupid-multiverse`

3. **FIREBASE_CLIENT_EMAIL**
   - Value: `firebase-adminsdk-fbsvc@campus-cupid-multiverse.iam.gserviceaccount.com`

4. **FIREBASE_PRIVATE_KEY**
   - Value: Your Firebase private key (the entire key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)

5. **JWT_SECRET**
   - Value: A secure random string for JWT signing

### Environment Variables in Google Cloud

Set these environment variables in your Cloud Run service:

```bash
# Set environment variables
gcloud run services update auth-service-sih \
  --region=us-central1 \
  --set-env-vars="FIREBASE_PROJECT_ID=campus-cupid-multiverse,FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@campus-cupid-multiverse.iam.gserviceaccount.com,FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDKyxRyuxGU5ZXR\nrIoaSF7zskkt4+AyABj3hUUyP79r70TpngJQG8+zQut+uuYaqw/B+k9S3nisVhZv\nt+vo5F7R4584v1BbJP7+dZS7bg4lPJduf96EniOvMk8Awb9TnAbbObtQNWgclukQ\n7MYxngwf9Ic8/ng7lhR5oViwyoeurlV0Ta//nOi59jZ2EHLeImJyAlodfkbKD4wW\nFDSjjPcGRQRer64nWRxuByIrJMTrLzXKOg8blajFRgjCuz2eLyi1AWpR2A1j0c4R\n1W75+teGG3kywS1KVh94TEmZI9UraCY/i4inA3JskWoYF8kKjLUsqAxWvKAZK7Qe\nQvwRi8v5AgMBAAECggEAAWmS2zl+Wnq3zFraTL2ZC9f/qfGau3lGcz2XgSjkia2/\nj9Gef+XMQt6g7iaCxIN1z0K/fJQbjQQm+j6bz7ahU6W5ylyoUiueIfasgQhTP7et\n+kAq2LS3nN8+Yadg8HzVC+SChlf4BeTPG2zNUDgeT3bhOXanCkHqh9dDkiylgb0P\nluQJRjBRjZvTDFeqLMH0ZAz3VlfES3cYHU6/WvM0Vp5/5W0xgeniqFaMFvCtxpS3\nypu2fo9tDzkb0xiiy6+ZDHhXb8WpBrqbo5KrJc2kqiwaH0+KG0jho4avO52vk4oV\n4h7Vg0sQCR2k7xDKSmTj0ZMANdOzCIlwRSpJqoq+IQKBgQD5VFG+SsxQ5r/gxyWe\nVFODcHUuNK91AvI+kNoek2p3pWtMrporl7JU2+gJGpTIfLfVgfSfYsxJkgJCcMHL\nFvCDsE2bEEYLlsaAIPY7XjxzX4b9MUoMnXjfHp0DcsM96tvzTT70NiEj9iTXcxWr\nU9i4sJV9TO8OcZ3ohA6EcqMrWQKBgQDQOAfKMzxIGrWw29Yjl5tKFhKjOmdnotyE\n/WrUSD8uBe7FYUs4AfSjaRqzoyKrLBlIw4lfWAs3E1yqeRia+szmYUE8v9GERZKV\no4q4J/RUz4crTThbu9LjcMnwio4xT4o1kz4c97oms7yd8brMRsLuDYFRc28+VdXL\nBfyYuf2xoQKBgQCPzIfQvocUaeFknLcfl/cKqcOLwKspS2e3mgeS9ubC1s8JzPHy\nDm2175bmGUSSVQwZwff6LRsxm1peQ3Yh0bsp2HcJ5drgODeIEnqxRuqKiB/sy46v\ns+rQlHFuWbQtc9Ujf/u9EbMPcJlTAXcP9y3ZZ07wk3yU0gaG4hMVZKCjEQKBgQCL\n0MPyU7sr07ujWcsONVRSSEYVkzcyURrwtlZQ236JQfSWV4GxxyZlwELs0yOJe2Az\nCxIokq9dOUQlOJF8J+ME49NxnoBq6GjI0Htqs3GOrZffTMgGWTYAAZGoUvGuTPHK\njefMfdBjApgqGtLLLszgGvN2JSRS4EJiRM/cIjAnYQKBgFNH/MAHcvPvY7QZFkZU\nQjvkoiUBzMinS7oni1UDCI6Ip4FfzXGK4Scbbz2p6WjWvCwCr92aA43MggspATuI\nd6rAlFPXhq8jEg6MgwHR9uHDaPAtTS8mQ35ZiOF08ytXPJTMOZxwdUV2MYIp9PE0\n7bVB3HLKTlsYV8pg6IKRxJv5\n-----END PRIVATE KEY-----\n,JWT_SECRET=your-super-secure-jwt-secret-for-internal-services,NODE_ENV=production"
```

## 📚 API Documentation

Once deployed, access the Swagger documentation at:
- **Local:** http://localhost:3000/api
- **Production:** https://auth-service-sih-o57bewdwya-uc.a.run.app/api

## 🔍 Monitoring

- **Cloud Run Console:** https://console.cloud.google.com/run/detail/us-central1/auth-service-sih
- **Logs:** https://console.cloud.google.com/logs/query

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run e2e tests
npm run test:e2e

# Run tests with coverage
npm run test:cov
```

## 📝 Available Scripts

- `npm run build` - Build the application
- `npm run start` - Start the application
- `npm run start:dev` - Start in development mode with watch
- `npm run start:prod` - Start in production mode
- `npm run lint` - Run ESLint
- `npm run test` - Run unit tests
- `npm run test:e2e` - Run e2e tests

## 🏗️ Project Structure

```
src/
├── auth/                 # Authentication module
├── farmers/             # Farmers module
├── firebase/            # Firebase configuration
├── prisma/              # Prisma service
├── app.module.ts        # Main application module
└── main.ts              # Application entry point
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the UNLICENSED License.

