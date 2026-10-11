import { writeDeckFile } from '@/utils/Storage';

// An in-memory file system standing in for expo-file-system: writes can be
// made to fail halfway, and moves can refuse an existing target (as on iOS).
// jest.mock is hoisted above the import.
const mockFiles = new Map<string, string>();
const mockFs = { failWrites: false, moveRefusesExisting: false };
jest.mock('expo-file-system/legacy', () => ({
    documentDirectory: 'file:///docs/',
    cacheDirectory: 'file:///cache/',
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
    writeAsStringAsync: async (uri: string, content: string) => {
        if (mockFs.failWrites) {
            mockFiles.set(uri, content.slice(0, 5)); // torn write
            throw new Error('ENOSPC');
        }
        mockFiles.set(uri, content);
    },
    readAsStringAsync: async (uri: string) => {
        if (!mockFiles.has(uri)) throw new Error('ENOENT');
        return mockFiles.get(uri);
    },
    moveAsync: async ({ from, to }: { from: string; to: string }) => {
        if (mockFs.moveRefusesExisting && mockFiles.has(to)) throw new Error('exists');
        mockFiles.set(to, mockFiles.get(from)!);
        mockFiles.delete(from);
    },
    deleteAsync: async (uri: string) => { mockFiles.delete(uri); },
}));

const DECK = 'file:///docs/decks/1.csv';

beforeEach(() => {
    mockFiles.clear();
    mockFs.failWrites = false;
    mockFs.moveRefusesExisting = false;
    mockFiles.set(DECK, '"q1","a1"\n"q2","a2"');
});

describe('writeDeckFile', () => {
    it('replaces the deck file and leaves no temp file behind', async () => {
        await writeDeckFile(DECK, '"q1","a1"\n"q2","changed"');
        expect(mockFiles.get(DECK)).toBe('"q1","a1"\n"q2","changed"');
        expect([...mockFiles.keys()]).toEqual([DECK]);
    });

    it('keeps the old deck intact when the write fails halfway', async () => {
        mockFs.failWrites = true;
        await expect(writeDeckFile(DECK, '"q1","a1"\n"q2","a2"\n"q3","a3"')).rejects.toThrow('ENOSPC');
        expect(mockFiles.get(DECK)).toBe('"q1","a1"\n"q2","a2"');
    });

    it('still replaces the file where a move refuses an existing target', async () => {
        mockFs.moveRefusesExisting = true;
        await writeDeckFile(DECK, 'new');
        expect(mockFiles.get(DECK)).toBe('new');
        expect(mockFiles.has(`${DECK}.tmp`)).toBe(false);
    });
});
