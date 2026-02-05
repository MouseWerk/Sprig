import Papa from 'papaparse';

export interface CSVRow {
  [key: string]: string;
}

export interface ParsedFlashcards {
  front: string;
  back: string;
}

export const parseCSV = (file: File): Promise<ParsedFlashcards[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const flashcards: ParsedFlashcards[] = [];
          
          for (const row of results.data) {
            // Try to find front/back columns (case-insensitive)
            const keys = Object.keys(row);
            const frontKey = keys.find(k => k.toLowerCase() === 'front' || k.toLowerCase() === 'question');
            const backKey = keys.find(k => k.toLowerCase() === 'back' || k.toLowerCase() === 'answer');
            
            if (frontKey && backKey && row[frontKey] && row[backKey]) {
              flashcards.push({
                front: row[frontKey].trim(),
                back: row[backKey].trim(),
              });
            } else if (keys.length >= 2) {
              // If no standard columns found, use first two columns
              flashcards.push({
                front: row[keys[0]]?.trim() || '',
                back: row[keys[1]]?.trim() || '',
              });
            }
          }
          
          resolve(flashcards);
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(error);
      },
    });
  });
};
