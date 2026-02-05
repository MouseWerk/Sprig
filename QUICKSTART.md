# Quick Start Guide

## ✅ What's Done

1. ✅ Node.js API server with MongoDB integration
2. ✅ Beautiful web dashboard to manage data
3. ✅ Automatic sync service for React Native app
4. ✅ Offline-first architecture - app works without internet
5. ✅ Audio library redesigned to match deck pages
6. ✅ All dependencies installed

## 🚀 Quick Start (3 Steps)

### Step 1: Fix MongoDB Connection

Edit `server/.env` and make sure the MongoDB password is properly encoded.

Your connection string has these special characters in the password:
- `#` should be `%23`
- `$` should be `%24`
- `@` should be `%40`
- `!` should be `%21`  
- `%` should be `%25`
- `&` should be `%26`
- `*` should be `%2A`

The .env file already has it encoded, but verify the password is correct.

### Step 2: Start the Server

```powershell
cd server
npm start
```

You should see: `Connected to MongoDB` and `Server running on http://localhost:3000`

### Step 3: Open Web Dashboard

Open browser: **http://localhost:3000**

Or test first: **http://localhost:3000/test-connection.html**

## 📱 Mobile App Setup

### Update API URL

Edit `utils/SyncService.ts` line 5:

```typescript
const API_URL = 'http://192.168.1.XXX:3000/api';
```

Replace with your computer's IP address.

### Find Your IP

```powershell
ipconfig
```

Look for IPv4 Address (e.g., 192.168.1.100)

### Rebuild & Install

```powershell
# Build
npx expo run:android --variant=release

# Install
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r android/app/build/outputs/apk/release/app-release.apk
```

## 🎯 Test It

1. Open app on phone
2. Create a new deck
3. Check web dashboard - deck should appear
4. Add a card in app
5. Refresh dashboard - card count updates

## 📖 Full Documentation

- Server setup: `server/README.md`
- Complete guide: `MONGODB_SETUP.md`
- Connection test: http://localhost:3000/test-connection.html

## 🆘 Need Help?

If MongoDB authentication fails:
1. Verify password in `.env` file
2. Test connection with MongoDB Compass
3. Check server logs for errors
4. Ensure MongoDB server allows your IP

## 🎨 Design Updates

Audio library page now matches your deck/PDF pages with:
- Consistent card styling
- Matching colors and shadows
- Same typography
- Delete buttons in corners
- Playing indicator as badge

---

**You're all set!** Start the server and open the dashboard to see your data. 🎉
