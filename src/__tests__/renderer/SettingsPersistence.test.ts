import { getSettings } from '../../renderer/useSettings';

describe('renderer settings persistence', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  });

  test('rehydrates remote retention settings after restart', () => {
    const persisted: Record<string, unknown> = {
      remoteStorageRetentionEnabled: true,
      remoteStorageRetentionLimitGb: 275,
    };
    const sendSync = jest.fn((_channel: string, args: unknown[]) => {
      const key = args[1];
      return typeof key === 'string' ? persisted[key] : undefined;
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { electron: { ipcRenderer: { sendSync } } },
    });

    const settings = getSettings();

    expect(settings.remoteStorageRetentionEnabled).toBe(true);
    expect(settings.remoteStorageRetentionLimitGb).toBe(275);
    expect(sendSync).toHaveBeenCalledWith('config', [
      'get',
      'remoteStorageRetentionEnabled',
    ]);
    expect(sendSync).toHaveBeenCalledWith('config', [
      'get',
      'remoteStorageRetentionLimitGb',
    ]);
  });
});
