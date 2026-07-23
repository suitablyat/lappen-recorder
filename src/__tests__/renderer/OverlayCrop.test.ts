import {
  getOverlayCropMax,
  normalizeOverlayCrop,
} from '../../utils/overlayCropUtils';

describe('overlay crop units', () => {
  test('converts preview dimensions back to source pixels', () => {
    // A 1000px source scaled to 50% in a 50% preview appears 250px wide.
    expect(getOverlayCropMax(250, 0.5, 0.5)).toBe(400);
  });

  test('normalizes source-pixel crop values', () => {
    expect(normalizeOverlayCrop(123.6, 1000)).toBe(124);
    expect(normalizeOverlayCrop(999, 1000)).toBe(400);
    expect(normalizeOverlayCrop(-10, 1000)).toBe(0);
    expect(normalizeOverlayCrop(Number.NaN, 1000)).toBe(0);
  });
});
