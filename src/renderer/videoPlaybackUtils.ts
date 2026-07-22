export const isExpectedPlaybackInterruption = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  error.name === 'AbortError';

export const isExpectedMediaAbort = (event: unknown) => {
  if (typeof event !== 'object' || event === null) return false;

  const target =
    'currentTarget' in event
      ? event.currentTarget
      : 'target' in event
        ? event.target
        : undefined;

  if (typeof target !== 'object' || target === null || !('error' in target)) {
    return false;
  }

  const mediaError = target.error;
  return (
    typeof mediaError === 'object' &&
    mediaError !== null &&
    'code' in mediaError &&
    mediaError.code === 1
  );
};

/**
 * Keep media playback in sync with React state without leaking the expected
 * play() rejection produced when a user pauses before playback has started.
 */
export const setMediaElementPlaying = (
  element: HTMLMediaElement,
  playing: boolean,
  onError: (error: unknown) => void,
) => {
  if (!playing) {
    element.pause();
    return;
  }

  if (!element.paused) return;

  void element.play().catch((error: unknown) => {
    if (!isExpectedPlaybackInterruption(error)) onError(error);
  });
};
