import { describe, expect, it } from 'vitest';
import {
  distanceMeters,
  distanceWeight,
  formatDistance,
  formatCuadras,
  nearestDistrict,
  DISTRICTS,
  DEMO_CENTER,
  tileFor,
} from '../src/lib/geo';

describe('geo lib', () => {
  it('calculates 0 distance for identical coordinates', () => {
    const dist = distanceMeters(DEMO_CENTER, DEMO_CENTER);
    expect(dist).toBe(0);
  });

  it('calculates realistic distance between two districts in Lima', () => {
    // Jesús María to Pueblo Libre
    const jm = DISTRICTS.find((d) => d.name === 'Jesús María')!;
    const pl = DISTRICTS.find((d) => d.name === 'Pueblo Libre')!;
    const dist = distanceMeters(jm, pl);
    // Pueblo Libre is ~1.5km from Jesus Maria center
    expect(dist).toBeGreaterThan(500);
    expect(dist).toBeLessThan(3000);
  });

  it('calculates distance weights correctly according to spec', () => {
    // ≤200 m = 1; ≤500 m = 0.75; ≤800 m = 0.5; resto = 0.25
    expect(distanceWeight(50)).toBe(1);
    expect(distanceWeight(200)).toBe(1);
    expect(distanceWeight(201)).toBe(0.75);
    expect(distanceWeight(500)).toBe(0.75);
    expect(distanceWeight(501)).toBe(0.5);
    expect(distanceWeight(800)).toBe(0.5);
    expect(distanceWeight(801)).toBe(0.25);
    expect(distanceWeight(5000)).toBe(0.25);
  });

  it('formats distance correctly in meters and km', () => {
    expect(formatDistance(50)).toBe('50 m');
    expect(formatDistance(450)).toBe('450 m');
    expect(formatDistance(1200)).toBe('1.2 km');
    expect(formatDistance(3456)).toBe('3.5 km');
  });

  it('formats cuadras correctly', () => {
    expect(formatCuadras(80)).toBe('1 cuadra');
    expect(formatCuadras(140)).toBe('1 cuadra');
    expect(formatCuadras(250)).toBe('3 cuadras');
    expect(formatCuadras(800)).toBe('8 cuadras');
  });

  it('identifies nearest district', () => {
    const coordsNearPl = { lat: -12.075, lng: -77.062 };
    expect(nearestDistrict(coordsNearPl)).toBe('Pueblo Libre');
  });

  it('computes slippy map tile coordinates', () => {
    const tile = tileFor(DEMO_CENTER.lat, DEMO_CENTER.lng, 15);
    expect(tile.z).toBe(15);
    expect(tile.x).toBeGreaterThan(0);
    expect(tile.y).toBeGreaterThan(0);
  });
});
