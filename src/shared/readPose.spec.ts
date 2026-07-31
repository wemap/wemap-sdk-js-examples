import { describe, it, expect } from 'vitest';
import type { Pose } from '@wemap/positioning';
import { readPose } from './readPose';

// The positioning Pose exposes `position` as a union (UserPosition | AbsolutePosition)
// and `attitude` as a union too. Callers previously narrowed these inline with
// `'latitude' in position` checks scattered across every example. readPose owns
// that narrowing once and returns a flat, already-safe readout.
const pose = (value: unknown): Pose => value as Pose;

describe('readPose', () => {
  it('returns null position when there is no position', () => {
    expect(readPose(pose({})).position).toBeNull();
    expect(readPose(pose({ position: undefined })).position).toBeNull();
  });

  it('reads latitude and longitude off a position', () => {
    const out = readPose(pose({ position: { latitude: 48.8566, longitude: 2.3522 } }));
    expect(out.position).not.toBeNull();
    expect(out.position?.latitude).toBe(48.8566);
    expect(out.position?.longitude).toBe(2.3522);
  });

  it('treats a position without coordinates as no position', () => {
    expect(readPose(pose({ position: { level: 2 } })).position).toBeNull();
  });

  it('reads optional altitude and level, defaulting missing fields to null', () => {
    const full = readPose(
      pose({ position: { latitude: 1, longitude: 2, altitude: 30, level: 4 } })
    );
    expect(full.position?.altitude).toBe(30);
    expect(full.position?.level).toBe(4);

    const sparse = readPose(pose({ position: { latitude: 1, longitude: 2 } }));
    expect(sparse.position?.altitude).toBeNull();
    expect(sparse.position?.level).toBeNull();
  });

  it('sources accuracy and time from the top-level pose', () => {
    const out = readPose(
      pose({ position: { latitude: 1, longitude: 2 }, accuracy: 5, time: 1700000000000 })
    );
    expect(out.position?.accuracy).toBe(5);
    expect(out.position?.time).toBe(1700000000000);
  });

  it('ignores non-numeric level (e.g. a level range)', () => {
    const out = readPose(
      pose({ position: { latitude: 1, longitude: 2, level: { min: 0, max: 1 } } })
    );
    expect(out.position?.level).toBeNull();
  });

  it('returns null attitude when there is no attitude', () => {
    expect(readPose(pose({ position: { latitude: 1, longitude: 2 } })).attitude).toBeNull();
  });

  it('reads heading, pitch, roll from attitude, defaulting missing to null', () => {
    const out = readPose(pose({ attitude: { heading: 1.5 } }));
    expect(out.attitude).not.toBeNull();
    expect(out.attitude?.heading).toBe(1.5);
    expect(out.attitude?.pitch).toBeNull();
    expect(out.attitude?.roll).toBeNull();
  });

  it('reads inclination when present, null otherwise', () => {
    expect(readPose(pose({ inclination: 0.4 })).inclination).toBe(0.4);
    expect(readPose(pose({})).inclination).toBeNull();
  });
});
