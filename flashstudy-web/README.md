# FlashStudy Web

A modern web application for studying with flashcards, audio files, and PDF documents.

## Features

-  **Flashcard Decks** - Create and organize flashcards for efficient learning
-  **Audio Files** - Upload and manage audio study materials
-  **PDF Documents** - Store and access PDF documents
-  **Folders** - Organize your content with folders
-  **CSV Import** - Bulk import flashcards from CSV files
-  **Dark Mode** - Beautiful dark and light themes
-  **User Authentication** - Secure JWT-based authentication
-  **Responsive Design** - Works on desktop and mobile

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **HTTP Client**: Axios
- **Authentication**: JWT with cookies
- **CSV Parsing**: PapaParse

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Access to the FlashStudy API server

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Configure environment variables in `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://94.130.37.51:3000/api
```

4. Run the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
src/
 app/              # Next.js pages (App Router)
    dashboard/    # Dashboard page
    login/        # Login page
    register/     # Registration page
    layout.tsx    # Root layout with providers
 components/       # Reusable UI components
    layout/       # Layout components (Navbar)
    Button.tsx
    Card.tsx
    Input.tsx
    Toast.tsx
 contexts/         # React contexts
    AuthContext.tsx
    ThemeContext.tsx
 lib/             # Utilities and helpers
     api-client.ts
     csv-parser.ts
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## Authentication

The app uses JWT authentication with HTTP-only cookies. Protected routes automatically redirect to the login page if the user is not authenticated.

Test account:
- Email: test@flashstudy.com
- Password: test123456

## API Integration

All API calls are handled through the `apiClient` in `src/lib/api-client.ts`. The client automatically:
- Adds authentication tokens to requests
- Handles 401/403 errors with automatic logout
- Provides type-safe methods for all endpoints

## Deployment

This app can be deployed to any platform that supports Next.js:

- Vercel (recommended)
- Netlify
- Docker
- Node.js server

Make sure to set the `NEXT_PUBLIC_API_URL` environment variable in your deployment environment.

## Contributing

Built with  for efficient learning.
