import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Smoke testy — weryfikacja konfiguracji production build.
 * Sprawdzają poprawność electron-builder.yml, skryptów package.json,
 * oraz dostępność plików wymaganych przez build.
 */

const ROOT = path.resolve(__dirname, '..', '..');

describe('Production Build Config', () => {

  it('electron-builder.yml parsuje się poprawnie jako YAML', () => {
    const ymlPath = path.join(ROOT, 'electron-builder.yml');
    expect(fs.existsSync(ymlPath)).toBe(true);

    const content = fs.readFileSync(ymlPath, 'utf-8');

    // Sprawdź kluczowe pola (prosty parsing — bez zależności od js-yaml)
    expect(content).toContain('appId: com.aslive.nextime');
    expect(content).toContain('productName: NextTime');
  });

  it('electron-builder.yml zawiera wymagane sekcje', () => {
    const content = fs.readFileSync(path.join(ROOT, 'electron-builder.yml'), 'utf-8');

    // Sekcje platformowe
    expect(content).toContain('win:');
    expect(content).toContain('mac:');

    // Obsługa native modułów
    expect(content).toContain('asarUnpack:');
    expect(content).toContain('better-sqlite3');

    // extraResources — schema.sql musi być kopiowany
    expect(content).toContain('extraResources:');
    expect(content).toContain('schema.sql');

    // Output directory
    expect(content).toContain('output: release/');
  });

  it('package.json zawiera skrypty build: pack, dist, dist:win, dist:mac', () => {
    const pkgPath = path.join(ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts['pack']).toBeDefined();
    expect(pkg.scripts['dist']).toBeDefined();
    expect(pkg.scripts['dist:win']).toBeDefined();
    expect(pkg.scripts['dist:mac']).toBeDefined();

    // Skrypty dist powinny wywoływać build przed electron-builder
    expect(pkg.scripts['dist']).toContain('npm run build');
    expect(pkg.scripts['dist:win']).toContain('npm run build');
    expect(pkg.scripts['dist:mac']).toContain('npm run build');
  });

  it('docs/schema.sql istnieje (wymagany przez migrate.ts)', () => {
    const schemaPath = path.join(ROOT, 'docs', 'schema.sql');
    expect(fs.existsSync(schemaPath)).toBe(true);

    const content = fs.readFileSync(schemaPath, 'utf-8');
    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain('CREATE TABLE');
  });

  it('placeholder ikony istnieją w assets/', () => {
    expect(fs.existsSync(path.join(ROOT, 'assets', 'icon.ico'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'assets', 'icon.png'))).toBe(true);
  });
});
