import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import { loadSchemas, getSchemaByDevice, buildOscAddress, clearSchemaCache } from '../../electron/osc-schemas/schema-loader';
import type { OscSchema } from '../../electron/osc-schemas/schema-loader';

// Ścieżka do prawdziwych schematów w assets/
const SCHEMAS_DIR = path.join(__dirname, '..', '..', 'assets', 'osc-schemas');

describe('OSC Schema Loader (Faza 31)', () => {
  beforeEach(() => {
    clearSchemaCache();
  });

  // ── loadSchemas ────────────────────────────────────────

  it('loadSchemas() zwraca tablicę schematów z katalogu assets/', () => {
    const schemas = loadSchemas(SCHEMAS_DIR);
    expect(schemas).toBeInstanceOf(Array);
    expect(schemas.length).toBeGreaterThanOrEqual(5);
  });

  it('każdy schemat ma wymagane pola: device, label, commands', () => {
    const schemas = loadSchemas(SCHEMAS_DIR);
    for (const schema of schemas) {
      expect(schema.device).toBeTruthy();
      expect(typeof schema.device).toBe('string');
      expect(schema.label).toBeTruthy();
      expect(typeof schema.label).toBe('string');
      expect(schema.commands).toBeInstanceOf(Array);
      expect(schema.commands.length).toBeGreaterThan(0);
    }
  });

  it('każda komenda ma wymagane pola: name, label, address, args', () => {
    const schemas = loadSchemas(SCHEMAS_DIR);
    for (const schema of schemas) {
      for (const cmd of schema.commands) {
        expect(typeof cmd.name).toBe('string');
        expect(cmd.name).toBeTruthy();
        expect(typeof cmd.label).toBe('string');
        expect(typeof cmd.address).toBe('string');
        expect(cmd.args).toBeInstanceOf(Array);
      }
    }
  });

  it('argumenty mają prawidłowe typy (i/f/s/b)', () => {
    const schemas = loadSchemas(SCHEMAS_DIR);
    const validTypes = new Set(['i', 'f', 's', 'b']);
    for (const schema of schemas) {
      for (const cmd of schema.commands) {
        for (const arg of cmd.args) {
          expect(validTypes.has(arg.type)).toBe(true);
          expect(typeof arg.name).toBe('string');
          expect(arg.name).toBeTruthy();
        }
      }
    }
  });

  // ── getSchemaByDevice ─────────────────────────────────

  it('getSchemaByDevice("disguise") zwraca schemat disguise', () => {
    const schema = getSchemaByDevice('disguise', SCHEMAS_DIR);
    expect(schema).toBeDefined();
    expect(schema!.device).toBe('disguise');
    expect(schema!.label).toContain('disguise');
  });

  it('getSchemaByDevice("qlab") zwraca schemat QLab z ≥4 komendami', () => {
    const schema = getSchemaByDevice('qlab', SCHEMAS_DIR);
    expect(schema).toBeDefined();
    expect(schema!.commands.length).toBeGreaterThanOrEqual(4);
  });

  it('getSchemaByDevice("casparcg") zwraca schemat CasparCG', () => {
    const schema = getSchemaByDevice('casparcg', SCHEMAS_DIR);
    expect(schema).toBeDefined();
    expect(schema!.commands.length).toBeGreaterThanOrEqual(3);
  });

  it('getSchemaByDevice("ross") zwraca schemat Ross', () => {
    const schema = getSchemaByDevice('ross', SCHEMAS_DIR);
    expect(schema).toBeDefined();
    expect(schema!.commands.length).toBeGreaterThanOrEqual(3);
  });

  it('getSchemaByDevice("generic") zwraca schemat generic z komendą "custom"', () => {
    const schema = getSchemaByDevice('generic', SCHEMAS_DIR);
    expect(schema).toBeDefined();
    expect(schema!.commands.length).toBe(1);
    expect(schema!.commands[0]!.name).toBe('custom');
  });

  it('getSchemaByDevice("nieistniejący") zwraca undefined', () => {
    const schema = getSchemaByDevice('nieistniejący', SCHEMAS_DIR);
    expect(schema).toBeUndefined();
  });

  it('generic jest na końcu listy schematów', () => {
    const schemas = loadSchemas(SCHEMAS_DIR);
    const last = schemas[schemas.length - 1]!;
    expect(last.device).toBe('generic');
  });

  // ── buildOscAddress ───────────────────────────────────

  it('buildOscAddress zamienia {placeholder} na wartości', () => {
    const result = buildOscAddress('/channel/{channel}/layer/{layer}/play', { channel: 1, layer: 10 });
    expect(result).toBe('/channel/1/layer/10/play');
  });

  it('buildOscAddress zachowuje nieznane placeholdery', () => {
    const result = buildOscAddress('/channel/{channel}/layer/{layer}/play', { channel: 2 });
    expect(result).toBe('/channel/2/layer/{layer}/play');
  });

  it('buildOscAddress bez placeholderów zwraca adres bez zmian', () => {
    const result = buildOscAddress('/d3/showcontrol/play', {});
    expect(result).toBe('/d3/showcontrol/play');
  });

  // ── Walidacja min/max w argDefach ────────────────────

  it('disguise layer_opacity ma arg z min=0, max=1', () => {
    const schema = getSchemaByDevice('disguise', SCHEMAS_DIR);
    const cmd = schema!.commands.find(c => c.name === 'layer_opacity');
    expect(cmd).toBeDefined();
    const opacityArg = cmd!.args.find(a => a.name === 'opacity');
    expect(opacityArg).toBeDefined();
    expect(opacityArg!.min).toBe(0);
    expect(opacityArg!.max).toBe(1);
    expect(opacityArg!.type).toBe('f');
  });

  // ── Cache ────────────────────────────────────────────

  it('drugie wywołanie loadSchemas() zwraca ten sam cache', () => {
    const schemas1 = loadSchemas(SCHEMAS_DIR);
    const schemas2 = loadSchemas(SCHEMAS_DIR);
    expect(schemas1).toBe(schemas2); // ta sama referencja
  });

  it('clearSchemaCache() czyści cache — kolejne wywołanie ładuje na nowo', () => {
    const schemas1 = loadSchemas(SCHEMAS_DIR);
    clearSchemaCache();
    const schemas2 = loadSchemas(SCHEMAS_DIR);
    expect(schemas1).not.toBe(schemas2); // inna referencja
    expect(schemas1.length).toBe(schemas2.length);
  });

  // ── Brak katalogu ────────────────────────────────────

  it('loadSchemas() z nieistniejącym katalogiem zwraca pustą tablicę', () => {
    const schemas = loadSchemas('/non/existent/path');
    expect(schemas).toEqual([]);
  });
});
