/**
 * Normalizes a positioning {@link Pose} into a flat, already-narrowed readout.
 *
 * The SDK's `Pose` carries `position` as a {@link UserPosition} and `attitude`
 * as an {@link Attitude}, both optional (absent before the first fix). This
 * helper flattens them into a plain readout — reading each field defensively
 * (exists and numeric) — so readouts and the map wiring share one safe shape.
 */
import type { Pose } from '@wemap/positioning';

export type PositionReadout = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  level: number | null;
  accuracy: number | null;
  time: number | null;
};

export type AttitudeReadout = {
  heading: number | null;
  pitch: number | null;
  roll: number | null;
};

export type PoseReadout = {
  position: PositionReadout | null;
  attitude: AttitudeReadout | null;
  inclination: number | null;
};

/** Reads a numeric field off an unknown object, or null when absent/non-numeric. */
function num(source: unknown, key: string): number | null {
  if (source && typeof source === 'object' && key in source) {
    const value = (source as Record<string, unknown>)[key];
    return typeof value === 'number' ? value : null;
  }
  return null;
}

function readPosition(pose: Pose): PositionReadout | null {
  const position = pose.position;
  if (!position) {
    return null;
  }

  const latitude = num(position, 'latitude');
  const longitude = num(position, 'longitude');
  if (latitude === null || longitude === null) {
    return null;
  }

  return {
    latitude,
    longitude,
    altitude: num(position, 'altitude'),
    level: num(position, 'level'),
    // accuracy and time live on the pose itself, not the position.
    accuracy: num(pose, 'accuracy'),
    time: num(pose, 'time'),
  };
}

function readAttitude(pose: Pose): AttitudeReadout | null {
  const attitude = pose.attitude;
  if (!attitude) {
    return null;
  }

  return {
    heading: num(attitude, 'heading'),
    pitch: num(attitude, 'pitch'),
    roll: num(attitude, 'roll'),
  };
}

export function readPose(pose: Pose): PoseReadout {
  return {
    position: readPosition(pose),
    attitude: readAttitude(pose),
    inclination: num(pose, 'inclination'),
  };
}
