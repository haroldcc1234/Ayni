import { describe, expect, it } from 'vitest';
import {
  POINTS,
  REPUTATION_LEVELS,
  formatPoints,
  levelFor,
  nextLevelFor,
} from '../src/lib/reputation';

describe('reputation lib', () => {
  it('has exact point values matching business rules', () => {
    // Donación entregada: +5.
    // Préstamo devuelto: +3 propietario / +1 solicitante.
    // Hora de banco de tiempo: +2.
    // Alerta resuelta: +5.
    // Visto Bueno emitido: +1.
    expect(POINTS.donation_delivered).toBe(5);
    expect(POINTS.loan_returned_owner).toBe(3);
    expect(POINTS.loan_returned_requester).toBe(1);
    expect(POINTS.time_bank_hour).toBe(2);
    expect(POINTS.alert_resolved).toBe(5);
    expect(POINTS.endorsement_given).toBe(1);
  });

  it('calculates levels correctly by points threshold', () => {
    // 0–4 Nuevo · 5–14 Colaborador · 15–29 Vecino de confianza · 30+ Guardián del barrio.
    expect(levelFor(0).name).toBe('Nuevo');
    expect(levelFor(4).name).toBe('Nuevo');
    expect(levelFor(5).name).toBe('Colaborador');
    expect(levelFor(14).name).toBe('Colaborador');
    expect(levelFor(15).name).toBe('Vecino de confianza');
    expect(levelFor(29).name).toBe('Vecino de confianza');
    expect(levelFor(30).name).toBe('Guardián del barrio');
    expect(levelFor(100).name).toBe('Guardián del barrio');
  });

  it('determines next level progression', () => {
    const nextFor0 = nextLevelFor(0);
    expect(nextFor0?.name).toBe('Colaborador');
    expect(nextFor0?.min).toBe(5);

    const nextFor10 = nextLevelFor(10);
    expect(nextFor10?.name).toBe('Vecino de confianza');
    expect(nextFor10?.min).toBe(15);

    const nextFor25 = nextLevelFor(25);
    expect(nextFor25?.name).toBe('Guardián del barrio');
    expect(nextFor25?.min).toBe(30);

    const nextFor40 = nextLevelFor(40);
    expect(nextFor40).toBeNull();
  });

  it('formats points text correctly', () => {
    expect(formatPoints(0)).toBe('0 puntos');
    expect(formatPoints(1)).toBe('1 punto');
    expect(formatPoints(5)).toBe('5 puntos');
  });
});
