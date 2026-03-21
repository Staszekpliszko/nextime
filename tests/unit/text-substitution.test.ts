import { describe, it, expect } from 'vitest';
import { substituteVariables, buildVariableMap } from '../../src/utils/textVariables';

describe('substituteVariables', () => {
  const map = { 'host-name': 'Jan Kowalski', 'venue': 'Studio A', 'empty': '' };

  it('zamienia $klucz na wartosc', () => {
    expect(substituteVariables('Witaj $host-name!', map)).toBe('Witaj Jan Kowalski!');
  });

  it('zamienia wiele zmiennych', () => {
    expect(substituteVariables('$host-name w $venue', map)).toBe('Jan Kowalski w Studio A');
  });

  it('zachowuje niezdefiniowane zmienne', () => {
    expect(substituteVariables('$unknown-var', map)).toBe('$unknown-var');
  });

  it('zamienia pusta wartosc', () => {
    expect(substituteVariables('test $empty koniec', map)).toBe('test  koniec');
  });

  it('nie modyfikuje tekstu bez zmiennych', () => {
    expect(substituteVariables('zwykly tekst', map)).toBe('zwykly tekst');
  });

  it('zwraca pusty string dla pustego input', () => {
    expect(substituteVariables('', map)).toBe('');
  });
});

describe('buildVariableMap', () => {
  it('buduje mape z tablicy', () => {
    const vars = [
      { key: 'host', value: 'Jan' },
      { key: 'venue', value: 'Studio' },
    ];
    expect(buildVariableMap(vars)).toEqual({ host: 'Jan', venue: 'Studio' });
  });

  it('zwraca pusty obiekt dla pustej tablicy', () => {
    expect(buildVariableMap([])).toEqual({});
  });
});
