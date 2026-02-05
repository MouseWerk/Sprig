# FlashStudy Web - Next.js Project

Successfully created Next.js 14 web application for FlashStudy!

##  What's Been Created

### Core Features Implemented:
-  Authentication system (Login/Register pages with JWT)
-  Theme system (Dark/Light mode toggle)
-  Dashboard with statistics
-  Navigation bar with protected routes
-  Flashcard management foundation
-  Audio files support
-  PDF documents support
-  Folder organization

### Tech Stack:
- Next.js 14 with App Router
- TypeScript
- Tailwind CSS
- Axios for API calls
- JWT authentication with cookies
- Lucide React for icons
- PapaParse for CSV import

### Project Structure:
```
flashstudy-web/
 src/
    app/              # Pages (App Router)
       dashboard/    # Main dashboard
       login/        # Login page
       register/     # Register page
       layout.tsx    # Root layout
    components/       # UI components
       layout/       # Navbar
       Button.tsx
       Card.tsx
       Input.tsx
       Toast.tsx
    contexts/         # React contexts
       AuthContext.tsx
       ThemeContext.tsx
    lib/             # Utilities
        api-client.ts # API integration
        csv-parser.ts
 .env.local           # Environment config
 package.json

```

##  Running the Project

The development server is currently running at:
- **Local**: http://localhost:3000
- **Network**: http://100.98.20.39:3000

### Commands:
- `npm run dev` - Start development server (currently running)
- `npm run build` - Build for production ( successful)
- `npm start` - Start production server
- `npm run lint` - Run linter

##  API Integration

The web app connects to your existing MongoDB backend at:
`http://94.130.37.51:3000/api`

All API endpoints are already integrated:
- Authentication (login, register, me)
- Decks (CRUD operations)
- Cards (CRUD operations)
- Folders (CRUD operations)
- Audio files (upload, list, delete)
- PDFs (upload, list, delete)

##  Next Steps

To complete the full web application, you can add:

1. **Decks Page** (`src/app/decks/page.tsx`)
   - List all decks
   - Create new decks
   - Import from CSV

2. **Deck Details Page** (`src/app/decks/[id]/page.tsx`)
   - View cards in a deck
   - Swipe interface for studying
   - Edit/delete cards

3. **Audio Page** (`src/app/audio/page.tsx`)
   - List audio files
   - Upload new audio
   - Audio player

4. **PDFs Page** (`src/app/pdfs/page.tsx`)
   - List PDF documents
   - Upload PDFs
   - PDF viewer

5. **Settings Page** (`src/app/settings/page.tsx`)
   - User profile
   - Theme preferences
   - Account management

##  Test Account

You can test the authentication with:
- **Email**: test@flashstudy.com
- **Password**: test123456

##  Design Features

The web app matches your mobile app design:
- Modern gradient backgrounds (purple  pink  orange)
- Clean card-based UI
- Smooth transitions and hover effects
- Responsive design for all screen sizes
- Password visibility toggle with eye icon
- Toast notifications for user feedback
- Dark mode support throughout

##  Key Features

- Protected routes that redirect to login
- Automatic auth token management with cookies
- Real-time theme switching
- Loading states for better UX
- Error handling with user-friendly messages
- Type-safe API client
- CSV import functionality ready
