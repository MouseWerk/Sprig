# MongoDB Integration & Web Dashboard Setup

## Overview
Your CSVStudyApp now syncs with MongoDB for cloud backup and has a web dashboard to manage data.

## Architecture
- **Local-First**: App works fully offline with AsyncStorage
- **Cloud Sync**: When online, syncs to MongoDB automatically
- **Web Dashboard**: View and manage all data through browser

## Setup Instructions

### 1. Install Server Dependencies

```powershell
cd server
npm install
```

### 2. Configure Server
The `.env` file is already configured with your MongoDB credentials:
- MongoDB URI: `mongodb://admin:***@94.130.37.51:27017/flashstudy?authSource=admin`
- Port: 3000

### 3. Start the Server

```powershell
cd server
npm start
```

Or for development with auto-restart:
```powershell
npm run dev
```

The server will run on `http://localhost:3000`

### 4. Access Web Dashboard

Open your browser and go to:
```
http://localhost:3000
```

You'll see a beautiful dashboard where you can:
- View all decks, folders, audio files, and PDFs
- Add new items
- Edit existing content
- Delete items
- View all flashcards

### 5. Configure Mobile App

Update the API URL in `utils/SyncService.ts`:

```typescript
const API_URL = 'http://YOUR_COMPUTER_IP:3000/api';
```

Replace `YOUR_COMPUTER_IP` with your computer's local IP address (e.g., `192.168.1.100`).

**To find your IP:**
```powershell
ipconfig
```
Look for "IPv4 Address" under your active network adapter.

### 6. Install Required React Native Packages

```powershell
npm install @react-native-community/netinfo
```

Or if you haven't installed it yet:
```powershell
npx expo install @react-native-community/netinfo
```

## How It Works

### Automatic Sync
The app automatically syncs when you:
- Create a new deck
- Add a card
- Create a folder
- Add audio/PDF files

### Manual Sync
You can trigger a full sync programmatically:

```typescript
import SyncService from '@/utils/SyncService';

// Sync all data
await SyncService.syncAll();

// Pull data from server
await SyncService.pullFromServer();
```

### Offline Support
- All operations work offline
- Changes are queued and synced when connection is restored
- App always works even if server is down

## API Endpoints

### Decks
- `GET /api/decks` - Get all decks
- `GET /api/decks/:id` - Get specific deck
- `POST /api/decks` - Create deck
- `PUT /api/decks/:id` - Update deck
- `DELETE /api/decks/:id` - Delete deck

### Folders
- `GET /api/folders` - Get all folders
- `POST /api/folders` - Create folder
- `PUT /api/folders/:id` - Update folder
- `DELETE /api/folders/:id` - Delete folder

### Cards
- `GET /api/cards/:deckId` - Get cards for deck
- `PUT /api/cards/:deckId` - Update cards for deck

### Audio & PDFs
- `GET /api/audio` - Get all audio files
- `POST /api/audio` - Add audio file
- `DELETE /api/audio/:id` - Delete audio

- `GET /api/pdfs` - Get all PDFs
- `POST /api/pdfs` - Add PDF
- `DELETE /api/pdfs/:id` - Delete PDF

### Sync
- `POST /api/sync` - Batch sync all data

## MongoDB Database Structure

**Database**: `flashstudy`

**Collections**:
- `decks` - All flashcard decks
- `cards` - Flashcard content (one document per deck)
- `folders` - Folder organization
- `audio` - Audio file metadata
- `pdfs` - PDF file metadata

## Troubleshooting

### Server won't connect
1. Check MongoDB is accessible from your network
2. Verify credentials in `.env` file
3. Check firewall settings

### App won't sync
1. Verify `API_URL` in `SyncService.ts` is correct
2. Ensure phone and computer are on same network
3. Check server is running (`npm start`)

### Web dashboard shows "Disconnected"
- Server is not running - start it with `npm start`

## Production Deployment

For production, consider:
1. Deploy server to cloud (Heroku, DigitalOcean, AWS)
2. Update `API_URL` to production URL
3. Add authentication/authorization
4. Enable HTTPS
5. Add rate limiting

## Security Notes

- Current setup has no authentication
- API is open to anyone who can access it
- For production, implement:
  - User authentication (JWT)
  - API keys
  - Rate limiting
  - Input validation
  - HTTPS only

## Support

The web dashboard provides a visual interface to:
- Monitor sync status
- View statistics
- Manually manage content
- Debug issues
