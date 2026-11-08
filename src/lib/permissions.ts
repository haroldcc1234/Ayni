import type { Profile, Role } from '../db/types';

export function hasRole(profile: Profile | undefined, role: Role): boolean {
  return Boolean(profile?.roles.includes(role));
}

export function isCoordinator(profile: Profile | undefined): boolean {
  return hasRole(profile, 'coordinador');
}

export function isProvider(profile: Profile | undefined): boolean {
  return hasRole(profile, 'prestador');
}

export function isBrigadista(profile: Profile | undefined): boolean {
  return hasRole(profile, 'brigadista');
}

export function canOfferService(profile: Profile | undefined): boolean {
  return isProvider(profile);
}

export function canManageBrigade(profile: Profile | undefined): boolean {
  return isBrigadista(profile);
}

export function canCoordinate(profile: Profile | undefined): boolean {
  return isCoordinator(profile);
}

export function canModerate(profile: Profile | undefined): boolean {
  return isCoordinator(profile);
}

export function canActivateCrisis(profile: Profile | undefined): boolean {
  return isCoordinator(profile);
}

export function canAcceptServiceRequests(profile: Profile | undefined): boolean {
  return isProvider(profile);
}

export function isOwnProfile(
  profile: Profile | undefined,
  profileId: string,
): boolean {
  return profile?.id === profileId;
}
