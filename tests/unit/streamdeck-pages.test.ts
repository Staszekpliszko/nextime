import { describe, it, expect } from 'vitest';
import { getDefaultPages, createEmptyPage } from '../../electron/streamdeck/streamdeck-pages';

describe('StreamDeck Pages', () => {
  it('getDefaultPages(3) zwraca 1 stronę z 3 przyciskami (Pedal)', () => {
    const config = getDefaultPages(3);
    expect(config.pages.length).toBe(1);
    expect(config.activePage).toBe(0);
    expect(config.pages[0]!.buttons.length).toBe(3);
    expect(config.pages[0]!.name).toBe('SHOW CONTROL');
  });

  it('getDefaultPages(6) zwraca 2 strony (Mini)', () => {
    const config = getDefaultPages(6);
    expect(config.pages.length).toBe(2);
    expect(config.pages[0]!.buttons.length).toBe(6);
    expect(config.pages[1]!.buttons.length).toBe(6);
  });

  it('getDefaultPages(15) zwraca 3 strony z 15 przyciskami (MK.2)', () => {
    const config = getDefaultPages(15);
    expect(config.pages.length).toBe(3);
    expect(config.pages[0]!.name).toBe('SHOW CONTROL');
    expect(config.pages[1]!.name).toBe('SHOTBOX');
    expect(config.pages[2]!.name).toBe('AUDIO / MEDIA');
    // Każda strona ma 15 przycisków
    for (const page of config.pages) {
      expect(page.buttons.length).toBe(15);
    }
  });

  it('getDefaultPages(32) ma rozszerzony SHOTBOX z 8 kamerami PGM + 8 PVW (XL)', () => {
    const config = getDefaultPages(32);
    expect(config.pages.length).toBe(3);
    // SHOTBOX powinien mieć kamery 1-8 PGM + 1-8 PVW
    const shotbox = config.pages[1]!;
    const camPgm = shotbox.buttons.filter(b => b.action === 'cam_pgm');
    const camPvw = shotbox.buttons.filter(b => b.action === 'cam_pvw');
    expect(camPgm.length).toBe(8);
    expect(camPvw.length).toBe(8);
    // Każda strona ma 32 przyciski
    for (const page of config.pages) {
      expect(page.buttons.length).toBe(32);
    }
  });

  it('createEmptyPage tworzy stronę z samymi "none"', () => {
    const page = createEmptyPage('Testowa', 15);
    expect(page.name).toBe('Testowa');
    expect(page.buttons.length).toBe(15);
    for (const btn of page.buttons) {
      expect(btn.action).toBe('none');
    }
  });

  it('strony zawierają przyciski nawigacji (page_nav)', () => {
    const config = getDefaultPages(15);
    // Pierwsza strona powinna mieć przycisk nawigacji → (page 1)
    const navBtn = config.pages[0]!.buttons.find(b => b.action === 'page_nav');
    expect(navBtn).toBeDefined();
  });
});
