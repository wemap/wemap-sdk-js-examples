import { describe, expect, it } from 'vitest';
import { Coordinates, type Step } from '@wemap/routing';
import {
  describeLocationState,
  formatDistance,
  formatWalkingTime,
  stepDistances,
  stepInstruction,
} from './navigationFormat';

const step = (overrides: Partial<Step>): Step =>
  ({
    firstStep: false,
    lastStep: false,
    important: false,
    number: 1,
    angle: 0,
    previousBearing: 0,
    nextBearing: 0,
    distance: 10,
    duration: 8,
    type: null,
    direction: null,
    name: null,
    coords: {} as Step['coords'],
    ...overrides,
  }) as Step;

describe('formatDistance', () => {
  it('uses metres below a kilometre and kilometres above', () => {
    expect(formatDistance(42.4)).toBe('42 m');
    expect(formatDistance(1250)).toBe('1.3 km');
  });
});

describe('formatWalkingTime', () => {
  it('never shows less than a minute', () => {
    expect(formatWalkingTime(5)).toBe('1 min');
    expect(formatWalkingTime(840)).toBe('10 min');
  });
});

describe('stepInstruction', () => {
  it('names the street when the step has one', () => {
    expect(stepInstruction(step({ direction: 'right', name: 'Hall B' })).text).toBe(
      'Turn right onto Hall B'
    );
  });

  it('reads level changes as vertical instructions', () => {
    expect(stepInstruction(step({ direction: 'up', type: 'stairs', destinationLevel: 2 }))).toEqual({
      icon: 'chevrons-up',
      text: 'Take the stairs up to level 2',
    });
  });

  it('announces arrival on the last step', () => {
    expect(stepInstruction(step({ lastStep: true, direction: 'left' })).text).toBe(
      'Arrive at your destination'
    );
  });

  it('falls back when there is no next step', () => {
    expect(stepInstruction(null).text).toBe('Head to your destination');
  });
});

describe('describeLocationState', () => {
  it('only pushes a rescan when the fix is not accurate', () => {
    expect(describeLocationState('accurate').suggestScan).toBe(false);
    expect(describeLocationState('degraded').suggestScan).toBe(true);
    expect(describeLocationState('no_positioning').suggestScan).toBe(true);
  });
});

describe('stepDistances', () => {
  it('measures each manoeuvre along the route, not as the crow flies', () => {
    // An L-shaped route: 100 m east, then 100 m north, with a turn in between.
    const corner = new Coordinates(0, 0.000898315);
    const end = new Coordinates(0.000898315, 0.000898315);
    const coords = [new Coordinates(0, 0), corner, end];
    const turn = step({ direction: 'left', coords: corner });
    const arrive = step({ lastStep: true, coords: end });

    const table = stepDistances({ coords, steps: [turn, arrive] });

    expect(table.get(turn)).toBeCloseTo(100, -1);
    // Along the route the end is ~200 m away; in a straight line only ~141 m.
    expect(table.get(arrive)).toBeCloseTo(200, -1);
    expect(coords[0].distanceTo(end)).toBeLessThan(150);
  });
});
