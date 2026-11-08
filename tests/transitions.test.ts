import { describe, expect, it } from 'vitest';
import type { AlertStatus, ListingStatus, RequestStatus } from '../src/db/types';

const VALID_REQUEST_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  pending: ['accepted', 'rejected', 'cancelled'],
  accepted: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: [],
};

const VALID_ALERT_TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  pending: ['assigned', 'in_progress', 'resolved', 'cancelled'],
  assigned: ['in_progress', 'resolved', 'cancelled'],
  in_progress: ['resolved', 'cancelled'],
  resolved: [],
  cancelled: [],
};

const VALID_LISTING_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  open: ['reserved', 'in_progress', 'completed', 'expired', 'hidden'],
  reserved: ['open', 'in_progress', 'completed', 'hidden'],
  in_progress: ['completed', 'open', 'hidden'],
  completed: [],
  expired: ['open', 'hidden'],
  hidden: ['open'],
};

function canTransitionRequest(from: RequestStatus, to: RequestStatus): boolean {
  return VALID_REQUEST_TRANSITIONS[from].includes(to);
}

function canTransitionAlert(from: AlertStatus, to: AlertStatus): boolean {
  return VALID_ALERT_TRANSITIONS[from].includes(to);
}

function canTransitionListing(from: ListingStatus, to: ListingStatus): boolean {
  return VALID_LISTING_TRANSITIONS[from].includes(to);
}

describe('state transitions', () => {
  describe('request status transitions', () => {
    it('allows valid request lifecycle', () => {
      expect(canTransitionRequest('pending', 'accepted')).toBe(true);
      expect(canTransitionRequest('accepted', 'in_progress')).toBe(true);
      expect(canTransitionRequest('in_progress', 'completed')).toBe(true);
      expect(canTransitionRequest('pending', 'rejected')).toBe(true);
      expect(canTransitionRequest('pending', 'cancelled')).toBe(true);
    });

    it('prevents invalid request transitions', () => {
      expect(canTransitionRequest('completed', 'pending')).toBe(false);
      expect(canTransitionRequest('rejected', 'accepted')).toBe(false);
      expect(canTransitionRequest('cancelled', 'completed')).toBe(false);
    });
  });

  describe('alert status transitions', () => {
    it('allows valid alert lifecycle', () => {
      expect(canTransitionAlert('pending', 'assigned')).toBe(true);
      expect(canTransitionAlert('assigned', 'in_progress')).toBe(true);
      expect(canTransitionAlert('in_progress', 'resolved')).toBe(true);
      expect(canTransitionAlert('pending', 'cancelled')).toBe(true);
    });

    it('prevents reopening resolved alerts', () => {
      expect(canTransitionAlert('resolved', 'pending')).toBe(false);
      expect(canTransitionAlert('cancelled', 'in_progress')).toBe(false);
    });
  });

  describe('listing status transitions', () => {
    it('allows reserving, completing and reopening listings', () => {
      expect(canTransitionListing('open', 'reserved')).toBe(true);
      expect(canTransitionListing('reserved', 'in_progress')).toBe(true);
      expect(canTransitionListing('in_progress', 'completed')).toBe(true);
      expect(canTransitionListing('hidden', 'open')).toBe(true);
    });

    it('prevents transitioning from terminal completed status', () => {
      expect(canTransitionListing('completed', 'open')).toBe(false);
    });
  });
});
