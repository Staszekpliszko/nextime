/**
 * Faza 33 — Ładowanie czcionki Noto Sans (polskie znaki) do jsPDF.
 *
 * jsPDF domyślnie używa Helvetica — brak polskich diakrytyków.
 * Szukamy plików TTF w wielu lokalizacjach:
 *   1. electron/pdf/fonts/  (dev — source)
 *   2. dist-electron/../electron/pdf/fonts/ (dev — Vite build, __dirname = dist-electron)
 *   3. process.cwd()/electron/pdf/fonts/ (dev fallback)
 *   4. process.resourcesPath/pdf-fonts/ (produkcja Electron)
 */

import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';

/** Zwraca listę możliwych katalogów z fontami */
function getFontsDirs(): string[] {
  const dirs: string[] = [];

  // 1. __dirname/fonts/ (gdy uruchamiamy z electron/pdf/)
  dirs.push(path.join(__dirname, 'fonts'));

  // 2. __dirname/../electron/pdf/fonts/ (Vite dev: __dirname = dist-electron/)
  dirs.push(path.join(__dirname, '..', 'electron', 'pdf', 'fonts'));

  // 3. cwd/electron/pdf/fonts/ (vitest, dev fallback)
  dirs.push(path.join(process.cwd(), 'electron', 'pdf', 'fonts'));

  // 4. extraResources w produkcji Electron
  try {
    const rp = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    if (rp) {
      dirs.push(path.join(rp, 'pdf-fonts'));
    }
  } catch {
    // Nie jesteśmy w Electron
  }

  return dirs;
}

let cachedRegular: string | null = null;
let cachedBold: string | null = null;

/** Szuka pliku TTF i zwraca base64 */
function loadFontBase64(fileNames: string[]): string | null {
  const dirs = getFontsDirs();
  for (const dir of dirs) {
    for (const fileName of fileNames) {
      try {
        const filePath = path.join(dir, fileName);
        if (fs.existsSync(filePath)) {
          const buffer = fs.readFileSync(filePath);
          // Weryfikacja magic bytes TTF: 00 01 00 00
          if (buffer.length > 100 && buffer[0] === 0x00 && buffer[1] === 0x01) {
            console.log(`[PDF] Czcionka załadowana: ${filePath} (${buffer.length} bytes)`);
            return buffer.toString('base64');
          }
        }
      } catch {
        // Kontynuuj szukanie
      }
    }
  }
  // Loguj wszystkie sprawdzone ścieżki dla debugowania
  const allPaths = dirs.flatMap(d => fileNames.map(f => path.join(d, f)));
  console.warn(`[PDF] Czcionka nie znaleziona! Sprawdzono:\n${allPaths.join('\n')}`);
  return null;
}

/**
 * Rejestruje czcionkę z polskimi znakami w jsPDF.
 * Graceful fallback do Helvetica jeśli font nie istnieje.
 */
export function registerPolishFont(doc: jsPDF): boolean {
  if (cachedRegular === null) {
    cachedRegular = loadFontBase64(['NotoSans-Regular.ttf', 'Roboto-Regular.ttf']) ?? '';
  }
  if (cachedBold === null) {
    cachedBold = loadFontBase64(['NotoSans-Bold.ttf', 'Roboto-Bold.ttf']) ?? '';
  }

  if (!cachedRegular) {
    return false;
  }

  doc.addFileToVFS('CustomFont-Regular.ttf', cachedRegular);
  doc.addFont('CustomFont-Regular.ttf', 'CustomFont', 'normal');

  if (cachedBold) {
    doc.addFileToVFS('CustomFont-Bold.ttf', cachedBold);
    doc.addFont('CustomFont-Bold.ttf', 'CustomFont', 'bold');
  }

  doc.setFont('CustomFont', 'normal');
  return true;
}

/** Czyści cache czcionek */
export function clearFontCache(): void {
  cachedRegular = null;
  cachedBold = null;
}
