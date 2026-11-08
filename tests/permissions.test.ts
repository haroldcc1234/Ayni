import { describe, expect, it } from 'vitest';
import type { Profile } from '../src/db/types';
import {
  canAcceptServiceRequests,
  canActivateCrisis,
  canCoordinate,
  canManageBrigade,
  canModerate,
  canOfferService,
  hasRole,
  isBrigadista,
  isCoordinator,
  isOwnProfile,
  isProvider,
} from '../src/lib/permissions';

const makeProfile = (roles: Profile['roles'], id = 'p1'): Profile => ({
  id,
  name: 'Test Profile',
  phone: '999888777',
  district: 'Jesús María',
  lat: -12.083,
  lng: -77.051,
  roles,
  verified: 1,
  bio: '',
  avatarColor: 'teal',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('permissions lib', () => {
  it('correctly checks individual roles', () => {
    const vecino = makeProfile(['vecino']);
    const prestador = makeProfile(['vecino', 'prestador']);
    const brigadista = makeProfile(['vecino', 'brigadista']);
    const coordinador = makeProfile(['vecino', 'coordinador']);

    expect(hasRole(vecino, 'vecino')).toBe(true);
    expect(hasRole(vecino, 'prestador')).toBe(false);

    expect(isProvider(prestador)).toBe(true);
    expect(isProvider(vecino)).toBe(false);

    expect(isBrigadista(brigadista)).toBe(true);
    expect(isBrigadista(vecino)).toBe(false);

    expect(isCoordinator(coordinador)).toBe(true);
    expect(isCoordinator(vecino)).toBe(false);
  });

  it('validates provider permissions according to matrix', () => {
    const prestador = makeProfile(['prestador']);
    const vecino = makeProfile(['vecino']);

    expect(canOfferService(prestador)).toBe(true);
    expect(canOfferService(vecino)).toBe(false);

    expect(canAcceptServiceRequests(prestador)).toBe(true);
    expect(canAcceptServiceRequests(vecino)).toBe(false);
  });

  it('validates brigadista permissions', () => {
    const brigadista = makeProfile(['brigadista']);
    const vecino = makeProfile(['vecino']);

    expect(canManageBrigade(brigadista)).toBe(true);
    expect(canManageBrigade(vecino)).toBe(false);
  });

  it('validates coordinator permissions according to matrix', () => {
    const coordinador = makeProfile(['coordinador']);
    const prestador = makeProfile(['prestador']);

    expect(canCoordinate(coordinador)).toBe(true);
    expect(canCoordinate(prestador)).toBe(false);

    expect(canModerate(coordinador)).toBe(true);
    expect(canModerate(prestador)).toBe(false);

    expect(canActivateCrisis(coordinador)).toBe(true);
    expect(canActivateCrisis(prestador)).toBe(false);
  });

  it('checks profile ownership', () => {
    const user = makeProfile(['vecino'], 'u123');
    expect(isOwnProfile(user, 'u123')).toBe(true);
    expect(isOwnProfile(user, 'other')).toBe(false);
    expect(isOwnProfile(undefined, 'u123')).toBe(false);
  });
});
