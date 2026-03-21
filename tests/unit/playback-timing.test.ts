import { describe, it, expect } from 'vitest';
import {
  formatTime,
  formatOverUnder,
  calcRemainingMs,
  calcElapsedMs,
} from '../../src/hooks/usePlayback';

// ── formatTime ───────────────────────────────────────────────

describe('formatTime', () => {
  it('powinno sformatować 0ms jako "00:00"', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  it('powinno sformatować 30 sekund jako "00:30"', () => {
    expect(formatTime(30_000)).toBe('00:30');
  });

  it('powinno sformatować 5 minut jako "05:00"', () => {
    expect(formatTime(300_000)).toBe('05:00');
  });

  it('powinno sformatować 1.5 minuty jako "01:30"', () => {
    expect(formatTime(90_000)).toBe('01:30');
  });

  it('powinno sformatować 1 godzinę jako "01:00:00"', () => {
    expect(formatTime(3_600_000)).toBe('01:00:00');
  });

  it('powinno sformatować 1h 5m 30s jako "01:05:30"', () => {
    expect(formatTime(3_930_000)).toBe('01:05:30');
  });

  it('powinno obsłużyć ujemne wartości (bierze abs)', () => {
    expect(formatTime(-30_000)).toBe('00:30');
  });

  it('powinno obcinać milisekundy (floor)', () => {
    expect(formatTime(30_999)).toBe('00:30');
  });
});

// ── formatOverUnder ──────────────────────────────────────────

describe('formatOverUnder', () => {
  it('powinno sformatować ahead (ujemne) z minusem: "-00:45"', () => {
    expect(formatOverUnder(-45_000)).toBe('-00:45');
  });

  it('powinno sformatować behind (dodatnie) z plusem: "+01:30"', () => {
    expect(formatOverUnder(90_000)).toBe('+01:30');
  });

  it('powinno sformatować zero jako "+00:00"', () => {
    expect(formatOverUnder(0)).toBe('+00:00');
  });
});

// ── calcRemainingMs ──────────────────────────────────────────

describe('calcRemainingMs', () => {
  const KICKOFF = 1_000_000_000_000;
  const DEADLINE = KICKOFF + 60_000; // 60s cue

  it('powinno obliczyć remaining podczas pauzy (deadline - last_stop)', () => {
    const lastStop = KICKOFF + 20_000; // zatrzymano po 20s
    const remaining = calcRemainingMs(DEADLINE, lastStop, false, 0);
    expect(remaining).toBe(40_000); // 60 - 20 = 40s
  });

  it('powinno obliczyć remaining podczas play (deadline - now - drift)', () => {
    // Mockujemy "now" przez drift: drift = server_time - client_time
    // Jeśli drift = 0, remaining = deadline - Date.now()
    // Nie możemy kontrolować Date.now() w czystej funkcji,
    // ale sprawdzamy że wynik jest rozsądny
    const remaining = calcRemainingMs(Date.now() + 30_000, 0, true, 0);
    expect(remaining).toBeGreaterThan(29_000);
    expect(remaining).toBeLessThanOrEqual(30_100);
  });

  it('powinno uwzględnić clock drift', () => {
    const now = Date.now();
    const deadline = now + 30_000;
    // Drift +5000 = serwer jest 5s do przodu, klient koryguje
    const withDrift = calcRemainingMs(deadline, 0, true, 5000);
    const withoutDrift = calcRemainingMs(deadline, 0, true, 0);
    // Z driftem +5s, remaining powinno być ~5s mniej
    expect(withDrift).toBeLessThan(withoutDrift);
    expect(withoutDrift - withDrift).toBeGreaterThan(4900);
    expect(withoutDrift - withDrift).toBeLessThan(5100);
  });
});

// ── calcElapsedMs ────────────────────────────────────────────

describe('calcElapsedMs', () => {
  const KICKOFF = 1_000_000_000_000;

  it('powinno obliczyć elapsed podczas pauzy (last_stop - kickoff)', () => {
    const lastStop = KICKOFF + 25_000;
    const elapsed = calcElapsedMs(KICKOFF, lastStop, false, 0);
    expect(elapsed).toBe(25_000);
  });

  it('powinno obliczyć elapsed podczas play (now - kickoff + drift)', () => {
    const kickoff = Date.now() - 10_000; // 10s temu
    const elapsed = calcElapsedMs(kickoff, 0, true, 0);
    expect(elapsed).toBeGreaterThan(9_900);
    expect(elapsed).toBeLessThan(10_200);
  });

  it('powinno uwzględnić clock drift w elapsed', () => {
    const kickoff = Date.now() - 10_000;
    const withDrift = calcElapsedMs(kickoff, 0, true, 3000);
    const withoutDrift = calcElapsedMs(kickoff, 0, true, 0);
    // Z driftem +3s, elapsed powinno być ~3s więcej
    expect(withDrift - withoutDrift).toBeGreaterThan(2900);
    expect(withDrift - withoutDrift).toBeLessThan(3100);
  });
});
