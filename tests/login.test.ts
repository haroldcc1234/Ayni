import { describe, expect, it } from 'vitest';
import { TEST_USERS } from './demo-users';
import type { Role } from '../src/db/types';
import {
  canAcceptServiceRequests,
  canActivateCrisis,
  canCoordinate,
  canManageBrigade,
  canModerate,
  canOfferService,
  hasRole,
} from '../src/lib/permissions';

describe('login and test users', () => {
  const roles: Role[] = ['vecino', 'prestador', 'brigadista', 'coordinador'];

  it('has a dedicated test user for every role', () => {
    roles.forEach((role) => {
      const user = TEST_USERS.find((u) => u.role === role);
      expect(user).toBeDefined();
      expect(user?.name).toBeTruthy();
      expect(user?.phone).toBeTruthy();
      expect(user?.district).toBeTruthy();
      expect(user?.description).toBeTruthy();
    });
  });

  it('ensures each test user has appropriate role-based permissions', () => {
    const vecino = TEST_USERS.find((u) => u.role === 'vecino')!;
    const prestador = TEST_USERS.find((u) => u.role === 'prestador')!;
    const brigadista = TEST_USERS.find((u) => u.role === 'brigadista')!;
    const coordinador = TEST_USERS.find((u) => u.role === 'coordinador')!;

    const toProfile = (u: typeof vecino) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      district: u.district,
      lat: -12.083,
      lng: -77.051,
      roles: ['vecino', u.role] as Role[],
      verified: 1 as const,
      bio: u.description,
      avatarColor: 'teal',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const pVecino = toProfile(vecino);
    const pPrestador = toProfile(prestador);
    const pBrigadista = toProfile(brigadista);
    const pCoordinador = toProfile(coordinador);

    // Vecino
    expect(hasRole(pVecino, 'vecino')).toBe(true);
    expect(canOfferService(pVecino)).toBe(false);
    expect(canActivateCrisis(pVecino)).toBe(false);

    // Prestador
    expect(canOfferService(pPrestador)).toBe(true);
    expect(canAcceptServiceRequests(pPrestador)).toBe(true);
    expect(canActivateCrisis(pPrestador)).toBe(false);

    // Brigadista
    expect(canManageBrigade(pBrigadista)).toBe(true);
    expect(canActivateCrisis(pBrigadista)).toBe(false);

    // Coordinador
    expect(canCoordinate(pCoordinador)).toBe(true);
    expect(canActivateCrisis(pCoordinador)).toBe(true);
    expect(canModerate(pCoordinador)).toBe(true);
  });

  it('has consistent and valid contact info for test users', () => {
    TEST_USERS.forEach((user) => {
      expect(user.phone.replace(/\D/g, '').length).toBeGreaterThanOrEqual(9);
      expect(user.id).toMatch(/^p-/);
    });
  });
});
