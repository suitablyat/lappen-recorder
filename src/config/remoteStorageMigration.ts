export type RemoteStorageMigration = {
  values: {
    remoteStorageEnabled: false;
    remoteStorageAutoUpload: boolean;
    remoteStorageUploadRateLimit: boolean;
    remoteStorageUploadRateLimitMbps: number;
    remoteStorageNeedsSetup: boolean;
    remoteStorageMigrationVersion: 1;
  };
  deleteKeys: string[];
};

export const migrateLegacyRemoteStorage = (
  legacy: Record<string, unknown>,
): RemoteStorageMigration | undefined => {
  if (Number(legacy.remoteStorageMigrationVersion || 0) >= 1) return undefined;

  return {
    values: {
      remoteStorageEnabled: false,
      remoteStorageAutoUpload: Boolean(legacy.cloudUpload),
      remoteStorageUploadRateLimit: Boolean(legacy.cloudUploadRateLimit),
      remoteStorageUploadRateLimitMbps:
        Number(legacy.cloudUploadRateLimitMbps) || 100,
      remoteStorageNeedsSetup: Boolean(
        legacy.cloudStorage ||
          legacy.cloudAccountName ||
          legacy.cloudAccountPassword ||
          legacy.cloudGuildName,
      ),
      remoteStorageMigrationVersion: 1,
    },
    deleteKeys: [
      'cloudAccountName',
      'cloudAccountPassword',
      'cloudGuildName',
      'cloudStorage',
      'cloudUpload',
      'cloudUploadRateLimit',
      'cloudUploadRateLimitMbps',
    ],
  };
};
