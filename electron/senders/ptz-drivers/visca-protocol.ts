/**
 * VISCA Protocol — stałe i helpery do budowania komend VISCA.
 *
 * VISCA (Video System Control Architecture) to protokół Sony
 * używany przez kamery PTZ: Sony BRC, PTZOptics, Panasonic, BirdDog.
 *
 * Specyfikacja: Sony VISCA Reference Manual
 * Format komendy: [header] [category] [command] [...params] [terminator=0xFF]
 */

// ── Stałe VISCA ────────────────────────────────────────

/** Terminator komendy VISCA */
export const VISCA_TERMINATOR = 0xFF;

/** Domyślny adres kamery (1) — header = 0x81 (8 + address) */
export function viscaHeader(address: number = 1): number {
  return 0x80 | (address & 0x07);
}

// ── Budowanie komend ────────────────────────────────────

/**
 * Memory Recall — przywołuje preset.
 * Komenda: 8x 01 04 3F 02 pp FF
 * pp = numer presetu (0x00-0xFF)
 */
export function buildRecallPresetCmd(address: number, presetNr: number): Buffer {
  const header = viscaHeader(address);
  return Buffer.from([header, 0x01, 0x04, 0x3F, 0x02, presetNr & 0xFF, VISCA_TERMINATOR]);
}

/**
 * Memory Set — zapisuje preset.
 * Komenda: 8x 01 04 3F 01 pp FF
 */
export function buildSetPresetCmd(address: number, presetNr: number): Buffer {
  const header = viscaHeader(address);
  return Buffer.from([header, 0x01, 0x04, 0x3F, 0x01, presetNr & 0xFF, VISCA_TERMINATOR]);
}

/**
 * Pan/Tilt Drive — ruch kamery.
 * Komenda: 8x 01 06 01 VV WW 03 03 FF (przykład: stop)
 *
 * VV = pan speed (01-18 hex = 1-24)
 * WW = tilt speed (01-14 hex = 1-20)
 * Bytes 6-7:
 *   Pan dir:  01=left, 02=right, 03=stop
 *   Tilt dir: 01=up, 02=down, 03=stop
 */
export function buildPanTiltCmd(
  address: number,
  panSpeed: number,
  tiltSpeed: number,
  panDir: number,
  tiltDir: number,
): Buffer {
  const header = viscaHeader(address);
  // Clamp speeds
  const ps = Math.max(1, Math.min(0x18, panSpeed));
  const ts = Math.max(1, Math.min(0x14, tiltSpeed));

  // Direction encoding: -1=left/up(01), 0=stop(03), 1=right/down(02)
  const panByte = panDir < 0 ? 0x01 : panDir > 0 ? 0x02 : 0x03;
  const tiltByte = tiltDir < 0 ? 0x01 : tiltDir > 0 ? 0x02 : 0x03;

  return Buffer.from([header, 0x01, 0x06, 0x01, ps, ts, panByte, tiltByte, VISCA_TERMINATOR]);
}

/**
 * Pan/Tilt Stop.
 * Komenda: 8x 01 06 01 VV WW 03 03 FF
 */
export function buildStopCmd(address: number): Buffer {
  return buildPanTiltCmd(address, 1, 1, 0, 0);
}

/**
 * Zoom — ciągły zoom (Tele/Wide/Stop).
 * Komenda: 8x 01 04 07 xx FF
 * xx: 02=Tele, 03=Wide, 00=Stop
 *     2p=Tele variable (p=0-7 speed)
 *     3p=Wide variable (p=0-7 speed)
 */
export function buildZoomCmd(address: number, direction: number, speed: number = 0): Buffer {
  const header = viscaHeader(address);
  let cmd: number;

  if (direction === 0) {
    cmd = 0x00; // stop
  } else if (direction > 0) {
    cmd = 0x20 | (speed & 0x07); // tele
  } else {
    cmd = 0x30 | (speed & 0x07); // wide
  }

  return Buffer.from([header, 0x01, 0x04, 0x07, cmd, VISCA_TERMINATOR]);
}

// ── Parser odpowiedzi ───────────────────────────────────

export type ViscaResponseType = 'ack' | 'completion' | 'error' | 'unknown';

export interface ViscaResponse {
  type: ViscaResponseType;
  socket?: number;
  errorCode?: number;
}

/**
 * Parsuje odpowiedź VISCA.
 *
 * ACK:        x0 4y FF (y = socket 0-1)
 * Completion: x0 5y FF
 * Error:      x0 6y ee FF (ee = error code)
 */
export function parseViscaResponse(data: Buffer): ViscaResponse {
  if (data.length < 3) return { type: 'unknown' };

  const byte1 = data[1]!;
  const highNibble = (byte1 >> 4) & 0x0F;
  const socket = byte1 & 0x0F;

  switch (highNibble) {
    case 0x04:
      return { type: 'ack', socket };
    case 0x05:
      return { type: 'completion', socket };
    case 0x06:
      return { type: 'error', socket, errorCode: data[2] };
    default:
      return { type: 'unknown' };
  }
}
