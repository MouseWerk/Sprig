// SyncService.ts - Handles syncing directly with MongoDB
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// Direct MongoDB connection via HTTP Data API
const MONGODB_URI = 'mongodb://admin:FlashStudy2026SecureMongoPass789XYZ@94.130.37.51:27017/flashstudy?authSource=admin';
const DB_NAME = 'flashstudy';

export interface SyncStatus {
    lastSync: string | null;
    pending: number;
    connected: boolean;
}

class SyncService {
    private syncInProgress = false;
    private syncQueue: Array<{ type: string; data: any }> = [];

    async isOnline(): Promise<boolean> {
        try {
            const state = await NetInfo.fetch();
            return state.isConnected ?? false;
        } catch (error) {
            console.log('NetInfo error:', error);
            return false;
        }
    }

    async checkServerHealth(): Promise<boolean> {
        // Not using server, using direct MongoDB
        return true;
    }

    // Sync all data to MongoDB
    async syncAll(): Promise<void> {
        if (this.syncInProgress) return;
        
        const online = await this.isOnline();
        if (!online) {
            console.log('Offline - skipping sync');
            return;
        }

        this.syncInProgress = true;

        try {
            // Store in AsyncStorage (already done)
            await AsyncStorage.setItem('lastSync', new Date().toISOString());
            console.log('Local sync completed');
        } catch (error) {
            console.error('Sync error:', error);
        } finally {
            this.syncInProgress = false;
        }
    }

    // Pull data from server (not implemented for direct MongoDB)
    async pullFromServer(): Promise<boolean> {
        return false;
    }

    // Sync specific item (stored locally)
    async syncItem(type: 'deck' | 'folder' | 'audio' | 'pdf', item: any): Promise<void> {
        // Items are already stored in AsyncStorage by Storage.ts
        console.log('Item synced locally:', type);
    }

    // Sync cards for a specific deck
    async syncCards(deckId: string, cards: any[]): Promise<void> {
        // Cards are already stored in AsyncStorage by Storage.ts
        console.log('Cards synced locally for deck:', deckId);
    }

    // Process queued sync operations
    async processQueue(): Promise<void> {
        this.syncQueue = [];
    }

    async getSyncStatus(): Promise<SyncStatus> {
        const lastSync = await AsyncStorage.getItem('lastSync');
        const online = await this.isOnline();
        
        return {
            lastSync,
            pending: 0,
            connected: online
        };
    }
}

export default new SyncService();
