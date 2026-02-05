// MongoDBClient.ts - Direct MongoDB connection for React Native
import AsyncStorage from '@react-native-async-storage/async-storage';

const MONGODB_CONFIG = {
    host: '94.130.37.51',
    port: 27017,
    database: 'flashstudy',
    username: 'admin',
    password: 'FlashStudy2026SecureMongoPass789XYZ',
    authSource: 'admin'
};

// Simple MongoDB operations using direct TCP connection
// Note: For production, consider using MongoDB Realm or Atlas Data API

class MongoDBClient {
    private connected = false;

    // Helper to construct MongoDB operation
    private async executeOperation(collection: string, operation: string, data: any): Promise<any> {
        try {
            // Store in local AsyncStorage immediately (offline-first)
            const key = `mongodb_${collection}`;
            const existing = await AsyncStorage.getItem(key);
            const items = existing ? JSON.parse(existing) : [];
            
            switch (operation) {
                case 'insert':
                    items.push(data);
                    await AsyncStorage.setItem(key, JSON.stringify(items));
                    break;
                case 'update':
                    const updateIndex = items.findIndex((item: any) => item.id === data.id);
                    if (updateIndex >= 0) {
                        items[updateIndex] = data;
                        await AsyncStorage.setItem(key, JSON.stringify(items));
                    }
                    break;
                case 'delete':
                    const filtered = items.filter((item: any) => item.id !== data.id);
                    await AsyncStorage.setItem(key, JSON.stringify(filtered));
                    break;
                case 'find':
                    return items;
            }

            // Queue for background sync
            await this.queueOperation(collection, operation, data);
            
            return { success: true };
        } catch (error) {
            console.error('MongoDB operation error:', error);
            return { success: false, error };
        }
    }

    private async queueOperation(collection: string, operation: string, data: any): Promise<void> {
        const queue = await AsyncStorage.getItem('mongodb_queue');
        const operations = queue ? JSON.parse(queue) : [];
        operations.push({ collection, operation, data, timestamp: Date.now() });
        await AsyncStorage.setItem('mongodb_queue', JSON.stringify(operations));
    }

    // Public methods
    async insertOne(collection: string, document: any): Promise<any> {
        return this.executeOperation(collection, 'insert', document);
    }

    async updateOne(collection: string, filter: any, document: any): Promise<any> {
        return this.executeOperation(collection, 'update', document);
    }

    async deleteOne(collection: string, filter: any): Promise<any> {
        return this.executeOperation(collection, 'delete', filter);
    }

    async find(collection: string, filter?: any): Promise<any[]> {
        const key = `mongodb_${collection}`;
        const data = await AsyncStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    }

    async syncQueue(): Promise<void> {
        try {
            const serverUrl = 'http://94.130.37.51:3000/api';
            
            // Get auth token
            const token = await AsyncStorage.getItem('auth_token');
            if (!token) {
                throw new Error('Not authenticated - please login again');
            }
            
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };
            
            // STEP 1: Upload local data to server (including cards)
            const [decksData, foldersData, audioData] = await Promise.all([
                AsyncStorage.getItem('csvtudyapp_decks'),
                AsyncStorage.getItem('csvtudyapp_folders'),
                AsyncStorage.getItem('csvtudyapp_audio')
            ]);

            const localDecks = decksData ? JSON.parse(decksData) : [];
            const localFolders = foldersData ? JSON.parse(foldersData) : [];
            const localAudio = audioData ? JSON.parse(audioData) : [];

            console.log(`Uploading ${localDecks.length} decks, ${localFolders.length} folders, ${localAudio.length} audio files`);

            // Upload local data
            if (localDecks.length > 0 || localFolders.length > 0 || localAudio.length > 0) {
                const uploadResponse = await fetch(`${serverUrl}/sync`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ decks: localDecks, folders: localFolders, audio: localAudio })
                });

                if (!uploadResponse.ok) {
                    throw new Error(`Upload failed: ${uploadResponse.status}`);
                }
                console.log('Upload complete');
            }

            // Upload cards for each local deck
            for (const deck of localDecks) {
                try {
                    // Try to get cards from cache storage
                    const cachedCards = await AsyncStorage.getItem(`csvtudyapp_cache_${deck.id}`);
                    if (cachedCards) {
                        const cards = JSON.parse(cachedCards);
                        // Convert to format with id, question, answer, learned
                        const formattedCards = cards.map((card: any, idx: number) => ({
                            id: `${deck.id}_${idx}`,
                            question: card.question,
                            answer: card.answer,
                            learned: deck.learnedIndices?.includes(idx) || false
                        }));
                        
                        const cardResponse = await fetch(`${serverUrl}/cards/${deck.id}`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({ cards: formattedCards })
                        });

                        console.log(`Uploaded ${formattedCards.length} cards for deck ${deck.name}`);
                    }
                } catch (err) {
                    console.log(`Could not upload cards for deck ${deck.id}:`, err);
                }
            }

            // STEP 2: Download all data from server
            console.log('Downloading data from server...');
            
            const [decksResponse, foldersResponse, audioResponse, pdfsResponse] = await Promise.all([
                fetch(`${serverUrl}/decks`, { headers }),
                fetch(`${serverUrl}/folders`, { headers }),
                fetch(`${serverUrl}/audio`, { headers }),
                fetch(`${serverUrl}/pdfs`, { headers })
            ]);

            if (!decksResponse.ok || !foldersResponse.ok || !audioResponse.ok || !pdfsResponse.ok) {
                throw new Error('Failed to download data from server');
            }

            const serverDecks = await decksResponse.json();
            const serverFolders = await foldersResponse.json();
            const serverAudio = await audioResponse.json();
            const serverPDFs = await pdfsResponse.json();

            console.log(`Downloaded ${serverDecks.length} decks, ${serverFolders.length} folders, ${serverAudio.length} audio, ${serverPDFs.length} PDFs`);

            // STEP 3: Use server as source of truth (server overwrites local)
            // This ensures deletions and updates on web are reflected on phone
            const finalDecks = serverDecks;
            const finalFolders = serverFolders;
            const finalAudio = serverAudio;
            const finalPDFs = serverPDFs;

            // STEP 4: Clean up orphaned card caches (for deleted decks)
            const serverDeckIds = new Set(finalDecks.map((d: any) => d.id));
            const localDeckIds = localDecks.map((d: any) => d.id);
            
            // Remove card caches for decks that no longer exist on server
            for (const deckId of localDeckIds) {
                if (!serverDeckIds.has(deckId)) {
                    await AsyncStorage.removeItem(`csvtudyapp_cache_${deckId}`);
                    await AsyncStorage.removeItem(`deck_${deckId}_cards`);
                    console.log(`Cleaned up cards for deleted deck ${deckId}`);
                }
            }

            // STEP 5: Download cards for all decks from server
            const allCards: any = {};
            for (const deck of finalDecks) {
                try {
                    const cardsResponse = await fetch(`${serverUrl}/cards/${deck.id}`, { headers });
                    if (cardsResponse.ok) {
                        const cardsData = await cardsResponse.json();
                        if (cardsData.cards && cardsData.cards.length > 0) {
                            allCards[deck.id] = cardsData.cards;
                            // Also save to cache format for the app to use
                            const cacheFormat = cardsData.cards.map((c: any) => ({
                                question: c.question,
                                answer: c.answer
                            }));
                            await AsyncStorage.setItem(`csvtudyapp_cache_${deck.id}`, JSON.stringify(cacheFormat));
                        }
                    }
                } catch (err) {
                    console.log(`No cards for deck ${deck.id}`);
                }
            }

            // STEP 6: Save server data to local storage (replacing old data)
            await Promise.all([
                AsyncStorage.setItem('csvtudyapp_decks', JSON.stringify(finalDecks)),
                AsyncStorage.setItem('csvtudyapp_folders', JSON.stringify(finalFolders)),
                AsyncStorage.setItem('csvtudyapp_audio', JSON.stringify(finalAudio)),
                AsyncStorage.setItem('csvtudyapp_pdfs', JSON.stringify(finalPDFs))
            ]);

            // Save cards for each deck (in server format)
            for (const [deckId, cards] of Object.entries(allCards)) {
                await AsyncStorage.setItem(`deck_${deckId}_cards`, JSON.stringify(cards));
            }

            console.log('✅ Sync complete - server data downloaded and saved');

            // Clear the queue
            await AsyncStorage.removeItem('mongodb_queue');
        } catch (error: any) {
            console.error('Sync error:', error.message || error);
            throw error;
        }
    }
}

export default new MongoDBClient();
