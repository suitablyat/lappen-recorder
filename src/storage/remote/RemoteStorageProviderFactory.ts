import type { ConfigurationSchema } from '../../config/configSchema';
import DisabledStorageProvider from './DisabledStorageProvider';
import { RemoteStorageProvider } from './RemoteStorageProvider';
import WebDavStorageProvider from './WebDavStorageProvider';

export const createRemoteStorageProvider = (
  config: Pick<
    ConfigurationSchema,
    | 'remoteStorageEnabled'
    | 'remoteStorageProvider'
    | 'webdavServerUrl'
    | 'webdavUsername'
    | 'webdavBasePath'
  >,
  password: string,
): RemoteStorageProvider => {
  if (!config.remoteStorageEnabled) return new DisabledStorageProvider();

  if (
    config.remoteStorageProvider === 'webdav' ||
    config.remoteStorageProvider === 'nextcloud'
  ) {
    return new WebDavStorageProvider({
      provider: config.remoteStorageProvider,
      serverUrl: config.webdavServerUrl,
      username: config.webdavUsername,
      password,
      basePath: config.webdavBasePath,
    });
  }

  throw new Error(
    `Unsupported remote storage provider: ${config.remoteStorageProvider}`,
  );
};
