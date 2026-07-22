import {
  isExpectedMediaAbort,
  isExpectedPlaybackInterruption,
  setMediaElementPlaying,
} from '../../renderer/videoPlaybackUtils';

describe('video playback lifecycle', () => {
  test('recognizes play requests interrupted by pause as expected', () => {
    expect(isExpectedPlaybackInterruption({ name: 'AbortError' })).toBe(true);
    expect(isExpectedPlaybackInterruption({ name: 'NotAllowedError' })).toBe(
      false,
    );
  });

  test('does not report an interrupted play request', async () => {
    const onError = jest.fn();
    const element = {
      paused: true,
      play: jest.fn().mockRejectedValue({ name: 'AbortError' }),
      pause: jest.fn(),
    } as unknown as HTMLMediaElement;

    setMediaElementPlaying(element, true, onError);
    await Promise.resolve();

    expect(element.play).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  test('reports unexpected play failures', async () => {
    const error = { name: 'NotAllowedError' };
    const onError = jest.fn();
    const element = {
      paused: true,
      play: jest.fn().mockRejectedValue(error),
      pause: jest.fn(),
    } as unknown as HTMLMediaElement;

    setMediaElementPlaying(element, true, onError);
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(error);
  });

  test('recognizes only MEDIA_ERR_ABORTED media events as expected', () => {
    expect(
      isExpectedMediaAbort({ currentTarget: { error: { code: 1 } } }),
    ).toBe(true);
    expect(
      isExpectedMediaAbort({ currentTarget: { error: { code: 3 } } }),
    ).toBe(false);
  });
});
