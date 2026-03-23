import { describe, it, expect } from 'vitest';
import { getNetworkAddresses, getCompanionInfo } from '../../electron/network-info';

describe('network-info', () => {
  describe('getNetworkAddresses', () => {
    it('zwraca tablicę z co najmniej jednym adresem IPv4', () => {
      const addresses = getNetworkAddresses();
      const ipv4 = addresses.filter(a => a.family === 'IPv4');
      // Na większości maszyn powinien być co najmniej jeden interfejs IPv4
      expect(Array.isArray(addresses)).toBe(true);
      expect(ipv4.length).toBeGreaterThanOrEqual(1);
    });

    it('nie zawiera adresów loopback (127.x.x.x)', () => {
      const addresses = getNetworkAddresses();
      for (const addr of addresses) {
        expect(addr.ip).not.toMatch(/^127\./);
      }
    });

    it('każdy adres ma pola name, ip, family', () => {
      const addresses = getNetworkAddresses();
      for (const addr of addresses) {
        expect(typeof addr.name).toBe('string');
        expect(addr.name.length).toBeGreaterThan(0);
        expect(typeof addr.ip).toBe('string');
        expect(addr.ip.length).toBeGreaterThan(0);
        expect(['IPv4', 'IPv6']).toContain(addr.family);
      }
    });
  });

  describe('getCompanionInfo', () => {
    it('zawiera poprawne porty HTTP i WS', () => {
      const info = getCompanionInfo(3142, 3141);
      expect(info.httpPort).toBe(3142);
      expect(info.wsPort).toBe(3141);
    });

    it('endpoints ma dokładnie 15 elementów', () => {
      const info = getCompanionInfo(3142, 3141);
      expect(info.endpoints).toHaveLength(15);
    });

    it('każdy endpoint ma method, path i description (nie puste)', () => {
      const info = getCompanionInfo(3142, 3141);
      for (const ep of info.endpoints) {
        expect(typeof ep.method).toBe('string');
        expect(ep.method.length).toBeGreaterThan(0);
        expect(typeof ep.path).toBe('string');
        expect(ep.path).toMatch(/^\/api\//);
        expect(typeof ep.description).toBe('string');
        expect(ep.description.length).toBeGreaterThan(0);
      }
    });
  });
});
