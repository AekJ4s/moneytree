import { describe, expect, it } from 'vitest';
import { videoTimeFor } from './TreeVideo';

describe('videoTimeFor', () => {
  it('maps savings progress onto the growth part of the 18 s video', () => {
    expect(videoTimeFor(0, 18)).toBe(0);
    expect(videoTimeFor(0.01, 18)).toBeCloseTo(2.887, 3);
    expect(videoTimeFor(0.5, 18)).toBeCloseTo(7.15, 2);
    expect(videoTimeFor(0.999, 18)).toBeLessThan(11.5);
  });
  it('plays to the end once the goal is reached', () => {
    expect(videoTimeFor(1, 18)).toBeCloseTo(17.95, 2);
    expect(videoTimeFor(3, 18)).toBeCloseTo(17.95, 2);
  });
});
