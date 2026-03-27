# Test Credentials

## VibeSDK Platform

### Test User Account
- Email: testuser@vibesdk.com
- Password: TestPass123!
- Name: Test User

### API Keys
- `GOOGLE_AI_STUDIO_API_KEY` configured in `/app/.dev.vars`

### Auth Notes
- Registration and login require CSRF token (GET /api/auth/csrf-token first)
- Session-based auth using cookies
- Login endpoint: POST /api/auth/login
- Register endpoint: POST /api/auth/register
