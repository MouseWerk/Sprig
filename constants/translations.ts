export const translations = {
  en: {
    // Tabs
    home: 'Home',
    audio: 'Audio',
    explore: 'Library',
    settings: 'Settings',
    
    // Home Screen
    myDecks: 'My Decks',
    createDeck: 'Create Deck',
    noDeckMessage: 'No decks yet. Create your first deck!',
    folders: 'Folders',
    pdfs: 'PDFs',
    cards: 'Cards',
    folder: 'Folder',
    mastery: 'Mastery',
    due: 'Due',
    deleteDeck: 'Delete Deck',
    deleteDeckMessage: 'This will permanently delete "{name}" and all its flashcards.',
    deleteFolder: 'Delete Folder',
    deleteFolderMessage: 'Delete "{name}"? Decks inside will be moved to root.',
    deckCreated: 'Deck "{name}" created!',
    folderCreated: 'Folder "{name}" created!',
    deckDeleted: 'Deck "{name}" deleted',
    folderDeleted: 'Folder "{name}" deleted',
    newFolder: 'New Folder',
    folderName: 'Folder Name',
    folderPlaceholder: 'e.g. History',
    
    // Audio Screen
    audioLibrary: 'Audio Library',
    noAudioMessage: 'No audio files yet',
    addAudio: 'Add Audio',
    audioFileAdded: 'Audio file added!',
    failedPickAudio: 'Failed to pick audio',
    failedPlayAudio: 'Failed to play audio',
    deleteAudio: 'Delete Audio',
    areYouSure: 'Are you sure?',
    deleted: 'Deleted',
    playing: 'Playing',
    audioTrack: 'Audio Track',
    
    // Library/Explore Screen
    library: 'Library',
    docs: 'Docs',
    doc: 'Doc',
    emptyLibrary: 'Empty Library',
    emptyLibraryMessage: 'Keep your textbooks and study materials organized in one place.',
    folderEmpty: 'Folder is empty',
    folderEmptyMessage: 'Create a subfolder or add a PDF document here.',
    addPdfDocument: 'Add PDF Document',
    pdfDocument: 'PDF Document',
    newDocument: 'New Document',
    documentName: 'Document Name',
    documentPlaceholder: 'e.g. Biology Chapter 1',
    pickPdf: 'Pick a PDF file to upload',
    selectIcon: 'Select Icon',
    root: 'Root',
    
    // Settings Screen
    settings_title: 'Settings',
    language: 'Language',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    clearCache: 'Clear Cache',
    privacyPolicy: 'Privacy Policy',
    appearance: 'Appearance',
    storageData: 'Storage & Data',
    
    // Deck Details
    noCards: 'No cards yet',
    addCard: 'Add Card',
    front: 'Front',
    back: 'Back',
    
    // Flashcard Swipe
    tapToReveal: 'Tap to reveal',
    
    // Common
    close: 'Close',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    success: 'Success',
    error: 'Error',
    loading: 'Loading...',
  },
};

export type TranslationKey = keyof typeof translations.en;
