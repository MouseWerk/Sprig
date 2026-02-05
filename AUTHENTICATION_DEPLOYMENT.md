# Authentication System Deployment Guide

## Overview
The FlashStudy app now has a complete JWT-based authentication system that secures all user data. Each user has their own isolated flashcards, audio files, PDFs, and folders.

## What Was Changed

### Server Side (server/server.js)
1. **Added Authentication Dependencies**:
   - `bcryptjs` - Password hashing
   - `jsonwebtoken` - JWT token generation and validation

2. **Created Authentication Endpoints**:
   - `POST /api/auth/register` - Create new user account
   - `POST /api/auth/login` - Login with email/password
   - `GET /api/auth/me` - Get current user info

3. **Secured All API Endpoints**:
   - All 12 endpoint groups now require authentication
   - Each endpoint filters data by `userId`
   - Endpoints secured:
     * Decks (GET, POST, PUT, DELETE)
     * Cards (GET, POST, PUT)
     * Folders (GET, POST, PUT, DELETE)
     * Audio (GET, POST, DELETE)
     * PDFs (GET, POST, DELETE)
     * Sync (POST)

### Mobile App (React Native)
1. **Created Authentication Context** (`contexts/AuthContext.tsx`):
   - Manages user session
   - Stores JWT token in AsyncStorage
   - Auto-login on app start
   - Provides login, register, logout functions

2. **Created Auth Screens**:
   - `app/login.tsx` - Login screen
   - `app/register.tsx` - Registration screen

3. **Updated Main Layout** (`app/_layout.tsx`):
   - Wraps app in AuthProvider
   - Redirects to login if not authenticated
   - Shows loading state during auth check

4. **Updated Data Layer** (`utils/MongoDBClient.ts`):
   - All API calls include Authorization header
   - Handles 401/403 errors (token expired)
   - Syncs user-specific data only

5. **Updated Settings Screen** (`app/(tabs)/settings.tsx`):
   - Shows user email
   - Added logout button

### Web Dashboard
1. **Created Login/Register Pages**:
   - `server/public/login.html` - Web login
   - `server/public/register.html` - Web registration

2. **Updated Main Dashboard** (`server/public/app.js`):
   - Checks authentication on load
   - All API calls include Authorization header
   - Auto-redirects to login if token expired
   - Shows user email in header
   - Added logout button

## Deployment Steps

### Step 1: Install Required Packages on Server
```bash
ssh root@94.130.37.51
cd /opt/flashstudy-server
npm install bcryptjs jsonwebtoken
```

### Step 2: Upload Updated Files
```bash
# From your local machine (PowerShell):
cd C:\git\csvtudyapp

# Upload server.js
scp server/server.js root@94.130.37.51:/opt/flashstudy-server/

# Upload web dashboard files
scp server/public/login.html root@94.130.37.51:/opt/flashstudy-server/public/
scp server/public/register.html root@94.130.37.51:/opt/flashstudy-server/public/
scp server/public/app.js root@94.130.37.51:/opt/flashstudy-server/public/
scp server/public/index.html root@94.130.37.51:/opt/flashstudy-server/public/
```

### Step 3: Restart the Service
```bash
ssh root@94.130.37.51
systemctl restart flashstudy
systemctl status flashstudy
```

### Step 4: Verify Deployment
```bash
# Check if service is running
ssh root@94.130.37.51 'journalctl -u flashstudy -n 20'

# Test the auth endpoint
curl http://94.130.37.51:3000/api/auth/register -X POST -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"test123","name":"Test User"}'
```

## Testing the Mobile App

### Option 1: Development Build
```bash
cd C:\git\csvtudyapp
npx expo start
```
Then scan the QR code with Expo Go app.

### Option 2: Local Android Build
```bash
npx expo run:android
```

## Security Considerations

### JWT Secret
⚠️ **IMPORTANT**: The current JWT secret is hardcoded. For production, you should:

1. Set an environment variable on the server:
```bash
echo "JWT_SECRET=your-very-secure-random-secret-key-here" >> /opt/flashstudy-server/.env
```

2. Update server.js to read from environment:
```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
```

### Password Requirements
- Minimum 6 characters
- Hashed with bcrypt (10 salt rounds)
- Stored securely in MongoDB

### Token Expiry
- Tokens expire after 30 days
- Users must re-login after expiry
- App auto-redirects to login on 401 errors

## User Migration (Optional)

If you have existing data in the database that needs to be assigned to users:

1. Create your first user account (via register)
2. Connect to MongoDB:
```bash
mongosh mongodb://admin:FlashStudy2026SecureMongoPass789XYZ@94.130.37.51:27017/flashstudy --authenticationDatabase admin
```

3. Get your userId:
```javascript
db.users.find()
```

4. Assign existing data to your user:
```javascript
// Replace YOUR_USER_ID with the actual ID
const userId = "YOUR_USER_ID";

db.decks.updateMany({}, { $set: { userId: userId } });
db.cards.updateMany({}, { $set: { userId: userId } });
db.folders.updateMany({}, { $set: { userId: userId } });
db.audio.updateMany({}, { $set: { userId: userId } });
db.pdfs.updateMany({}, { $set: { userId: userId } });
```

## API Changes Summary

### Before (No Auth)
```javascript
// Any request worked
fetch('http://94.130.37.51:3000/api/decks')
```

### After (With Auth)
```javascript
// Must include Authorization header
fetch('http://94.130.37.51:3000/api/decks', {
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  }
})
```

## Troubleshooting

### "Authentication failed" on mobile app
- Clear app data: Settings → Apps → FlashStudy → Storage → Clear Data
- Re-register or login

### "Not authenticated" error on web
- Clear browser localStorage
- Go to login page: http://94.130.37.51:3000/login.html

### Service won't start
- Check logs: `journalctl -u flashstudy -n 50`
- Verify packages installed: `npm list bcryptjs jsonwebtoken`
- Check for syntax errors in server.js

### Can't login with existing credentials
- Password may not be hashed yet
- Create a new account
- Or manually hash password in MongoDB

## File Checklist

### Server Files (need to deploy)
- [x] server/server.js - Main server with auth
- [x] server/public/index.html - Updated header
- [x] server/public/app.js - Auth-enabled API calls
- [x] server/public/login.html - New login page
- [x] server/public/register.html - New register page

### Mobile App Files (already in repo)
- [x] contexts/AuthContext.tsx - Auth provider
- [x] app/login.tsx - Login screen
- [x] app/register.tsx - Register screen
- [x] app/_layout.tsx - Auth routing
- [x] utils/MongoDBClient.ts - Auth headers
- [x] app/(tabs)/settings.tsx - Logout button

## Next Steps

1. Deploy server changes (follow Steps 1-3)
2. Test web dashboard at http://94.130.37.51:3000
3. Test mobile app (rebuild with `npx expo start`)
4. Create first user account
5. (Optional) Migrate existing data to first user

## Support

If you encounter issues:
1. Check server logs: `journalctl -u flashstudy -f`
2. Check browser console (F12)
3. Check mobile app logs in Metro bundler
4. Verify MongoDB is accessible
5. Ensure ports 3000 and 27017 are open
