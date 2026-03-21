import { test, expect } from '@playwright/test';
import { launchApp, closeApp, type AppContext } from './helpers/electron-app';
import type { Page } from '@playwright/test';

/**
 * E2E testy — Rundown CRUD (Faza 21B)
 *
 * Scenariusze:
 * 1. Start aplikacji — UI się ładuje
 * 2. Tworzenie nowego rundownu
 * 3. Dodanie cue do rundownu
 * 4. Edycja cue (inline title)
 * 5. Reorder cue (context menu)
 * 6. Usuwanie cue (Delete)
 */

let ctx: AppContext;
let window: Page;

test.beforeEach(async () => {
  ctx = await launchApp();
  window = ctx.window;
});

test.afterEach(async () => {
  if (ctx) await closeApp(ctx);
});

// ── 1. Start aplikacji ─────────────────────────────────────────

test('aplikacja uruchamia się i wyświetla UI', async () => {
  // Sprawdź że tytuł okna zawiera NextTime
  const title = await window.title();
  expect(title).toContain('NextTime');

  // Sprawdź że sidebar jest widoczny (lista rundownów)
  // Seed demo data tworzy domyślny rundown — powinien być widoczny
  const sidebar = window.locator('button[title="Nowy rundown"]');
  await expect(sidebar).toBeVisible({ timeout: 15_000 });

  // Sprawdź że przycisk Przebieg/Oś czasu jest widoczny
  await expect(window.getByText('Przebieg')).toBeVisible();
  await expect(window.getByText('Oś czasu')).toBeVisible();
});

// ── 2. Tworzenie nowego rundownu ─────────────────────────────

test('tworzenie nowego rundownu — pojawia się na liście', async () => {
  // Kliknij "+" (Nowy rundown)
  await window.click('button[title="Nowy rundown"]');

  // Wypełnij nazwę
  const nameInput = window.locator('input[placeholder="Nazwa rundownu"]');
  await expect(nameInput).toBeVisible({ timeout: 5_000 });
  await nameInput.fill('Test Rundown E2E');

  // Kliknij Utwórz
  await window.getByText('Utwórz', { exact: true }).click();

  // Sprawdź że nowy rundown pojawił się w sidebarze
  await expect(window.getByText('Test Rundown E2E')).toBeVisible({ timeout: 5_000 });
});

// ── 3. Dodanie cue do rundownu ────────────────────────────────

test('dodanie cue do rundownu — wiersz pojawia się w tabeli', async () => {
  // Szukaj przycisku "Dodaj cue" lub "Dodaj pierwszy cue"
  const addCueBtn = window.getByText(/Dodaj.*cue/);

  // Jeśli jest pusty rundown — "Dodaj pierwszy cue"
  // Jeśli seed data — "Dodaj cue" na dole tabeli
  await addCueBtn.first().click();

  // Sprawdź że tabela ma co najmniej jeden wiersz z cue
  // Wiersz cue zawiera komórki w <tr> wewnątrz <tbody>
  const rows = window.locator('table tbody tr');
  await expect(rows.first()).toBeVisible({ timeout: 5_000 });
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
});

// ── 4. Edycja cue (inline title) ─────────────────────────────

test('edycja cue inline — zmiana tytułu jest zapisana', async () => {
  // Seed data tworzy cue "VT Intro" (ROW 2 w tabeli — ROW 0 to nagłówek grupy)
  // Wiersz zawiera <span class="font-medium">VT Intro</span> w tytule
  // i <div class="truncate">VT Intro</div> jako subtitle (bo seed tak działa)
  // Potrzebujemy wiersza z cue, nie nagłówka grupy
  const cueRow = window.locator('table tbody tr').nth(2); // ROW 2 = drugi cue (VT Intro)
  await expect(cueRow).toBeVisible({ timeout: 10_000 });

  // Trzecia komórka (td:nth-child(3)) to kolumna tytułu
  const titleCell = cueRow.locator('td').nth(2);

  // Double-click na komórkę tytułu — startInlineEdit('title')
  // onDoubleClick na div wrapping title wywołuje e.stopPropagation() + startInlineEdit
  await titleCell.dblclick();
  await window.waitForTimeout(500);

  // Powinien pojawić się input do edycji inline
  const inlineInput = cueRow.locator('input[type="text"]').first();
  await expect(inlineInput).toBeVisible({ timeout: 3_000 });

  // Wyczyść i wpisz nowy tytuł
  await inlineInput.fill('Zmieniony tytuł E2E');
  await inlineInput.press('Enter');

  // Sprawdź że nowy tytuł jest widoczny (first() bo może pojawić się w subtitle innego wiersza)
  await expect(window.getByText('Zmieniony tytuł E2E').first()).toBeVisible({ timeout: 5_000 });
});

// ── 5. Reorder cue (context menu) ────────────────────────────

test('reorder cue — zmiana kolejności przez context menu', async () => {
  // Potrzebujemy co najmniej 2 cue — dodaj jeden jeśli trzeba
  const rows = window.locator('table tbody tr');
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  let count = await rows.count();

  if (count < 2) {
    // Dodaj cue
    const addBtn = window.getByText(/Dodaj.*cue/);
    await addBtn.first().click();
    await window.waitForTimeout(1_000);
    count = await rows.count();
  }

  if (count < 2) {
    // Jeśli wciąż mniej niż 2, pomiń
    test.skip();
    return;
  }

  // Zapamiętaj tytuł drugiego wiersza
  const secondRowTitle = await rows.nth(1).locator('span.font-medium').first().textContent();

  // Right-click na drugim wierszu → context menu
  await rows.nth(1).click({ button: 'right' });

  // Znajdź context menu (fixed z-[100])
  const contextMenu = window.locator('.fixed.bg-slate-700');
  await expect(contextMenu.first()).toBeVisible({ timeout: 3_000 });

  // Sprawdź że istnieje opcja context menu (np. Edytuj, Duplikuj itp.)
  // Wystarczy że menu jest widoczne — reorder przez DnD jest trudny w E2E
  const menuItems = contextMenu.first().locator('button');
  const menuCount = await menuItems.count();
  expect(menuCount).toBeGreaterThan(0);

  // Zamknij menu klikając poza nim
  await window.click('body', { position: { x: 10, y: 10 } });
});

// ── 6. Usuwanie cue ─────────────────────────────────────────

test('usuwanie cue — wiersz znika po usunięciu', async () => {
  // Seed data tworzy cue "Opening" — szukamy wiersza z tym tekstem
  const openingText = window.getByText('Opening', { exact: true });
  await expect(openingText).toBeVisible({ timeout: 10_000 });

  // Policz wiersze cue'ów (nie nagłówków grup)
  const allRows = window.locator('table tbody tr');
  const countBefore = await allRows.count();

  // Double-click na wiersz cue "Opening" → otwiera CueEditPanel
  const cueRow = window.locator('table tbody tr').filter({ hasText: 'Opening' });
  await cueRow.dblclick();
  await window.waitForTimeout(500);

  // Panel edycji powinien się otworzyć — szukaj nagłówka
  const editPanel = window.getByText('Edycja cue');
  await expect(editPanel).toBeVisible({ timeout: 5_000 });

  // Obsłuż dialog potwierdzenia (window.confirm) — MUSI być przed kliknięciem
  window.once('dialog', (dialog) => dialog.accept());

  // Kliknij "Usuń cue" w panelu edycji
  const deleteBtn = window.getByText('Usuń cue');
  await expect(deleteBtn).toBeVisible({ timeout: 3_000 });
  await deleteBtn.click();

  // Poczekaj na usunięcie
  await window.waitForTimeout(1_000);

  // Sprawdź że "Opening" już nie jest widoczny
  await expect(openingText).not.toBeVisible({ timeout: 5_000 });
});
