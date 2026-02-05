import * as FileSystem from 'expo-file-system/legacy';
import Papa from 'papaparse';

export interface FlashcardData {
  question: string;
  answer: string;
}

export async function parseFlashcardsCsv(fileUri: string): Promise<FlashcardData[]> {
  try {
    const csvString = await FileSystem.readAsStringAsync(fileUri);

    return new Promise((resolve, reject) => {
      Papa.parse(csvString, {
        header: false,
        skipEmptyLines: true,
        complete: (results: Papa.ParseResult<string[]>) => {
          const data = results.data as string[][];
          // Filter out rows that don't have enough columns or are just empty headers
          const cards: FlashcardData[] = data
            .filter(row => row.length >= 2 && row[0]?.trim() !== '')
            .map((row) => ({
              question: row[0].trim(),
              answer: row[1].trim(),
            }));
          resolve(cards);
        },
        error: (error: any) => {
          reject(error);
        },
      });
    });
  } catch (error) {
    console.error('Error parsing CSV:', error);
    return [];
  }
}
