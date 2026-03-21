import type { Clock } from '../../electron/playback-engine';

export type { Clock };

/** Zegar kontrolowany w testach */
export class MockClock implements Clock {
  private _now: number;

  constructor(startMs = 1_000_000_000_000) {
    this._now = startMs;
  }

  now(): number {
    return this._now;
  }

  advance(ms: number): void {
    this._now += ms;
  }

  set(ms: number): void {
    this._now = ms;
  }
}
