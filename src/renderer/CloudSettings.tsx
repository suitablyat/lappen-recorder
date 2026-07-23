import {
  ChangeEvent,
  Dispatch,
  SetStateAction,
  useEffect,
  useState,
} from 'react';
import { ConfigurationSchema, configSchema } from 'config/configSchema';
import { AppState, RendererVideo } from 'main/types';
import { Phrase } from 'localisation/phrases';
import { getLocalePhrase } from 'localisation/translations';
import { setConfigValue, setConfigValues } from './useSettings';
import Switch from './components/Switch/Switch';
import Label from './components/Label/Label';
import { Input } from './components/Input/Input';
import { Button } from './components/Button/Button';
import { Tooltip } from './components/Tooltip/Tooltip';
import { Info, PlusIcon, Trash } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/Select/Select';
import Separator from './components/Separator/Separator';
import CharacterFilterDialog from './CharacterFilterDialog';

const ipc = window.electron.ipcRenderer;

interface IProps {
  appState: AppState;
  config: ConfigurationSchema;
  setConfig: Dispatch<SetStateAction<ConfigurationSchema>>;
  videoState: RendererVideo[];
}

type ConnectionResult =
  | { ok: true; canDelete: boolean; warning?: string }
  | { ok: false; code: string; message: string };

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const unit = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unit;
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const CloudSettings = ({ appState, config, setConfig, videoState }: IProps) => {
  const { language } = appState;
  const { cloudStatus } = appState;
  const [password, setPassword] = useState('');
  const [testing, setTesting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<ConnectionResult>();

  useEffect(() => {
    const timer = setTimeout(() => {
      setConfigValues({
        remoteStorageEnabled: config.remoteStorageEnabled,
        remoteStorageProvider: config.remoteStorageProvider,
        webdavServerUrl: config.webdavServerUrl,
        webdavUsername: config.webdavUsername,
        webdavBasePath: config.webdavBasePath,
        remoteStorageAutoUpload: config.remoteStorageAutoUpload,
        remoteStorageRetentionEnabled: config.remoteStorageRetentionEnabled,
        remoteStorageRetentionLimitGb: config.remoteStorageRetentionLimitGb,
        remoteStorageUploadRateLimit: config.remoteStorageUploadRateLimit,
        remoteStorageUploadRateLimitMbps:
          config.remoteStorageUploadRateLimitMbps,
      });
      ipc.sendMessage('reconfigureRemoteStorage', []);
    }, 500);
    return () => clearTimeout(timer);
  }, [
    config.remoteStorageEnabled,
    config.remoteStorageProvider,
    config.webdavServerUrl,
    config.webdavUsername,
    config.webdavBasePath,
    config.remoteStorageAutoUpload,
    config.remoteStorageRetentionEnabled,
    config.remoteStorageRetentionLimitGb,
    config.remoteStorageUploadRateLimit,
    config.remoteStorageUploadRateLimitMbps,
  ]);

  const update = <K extends keyof ConfigurationSchema>(
    key: K,
    value: ConfigurationSchema[K],
  ) => setConfig((previous) => ({ ...previous, [key]: value }));

  const field = (
    key: 'webdavServerUrl' | 'webdavUsername' | 'webdavBasePath',
    label: Phrase,
  ) => (
    <div className="flex flex-col min-w-60 max-w-96 flex-1">
      <Label htmlFor={key} className="flex items-center">
        {getLocalePhrase(language, label)}
        <Tooltip
          content={getLocalePhrase(language, configSchema[key].description)}
        >
          <Info size={18} className="ml-2" />
        </Tooltip>
      </Label>
      <Input
        name={key}
        value={config[key]}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          update(key, event.target.value)
        }
        spellCheck={false}
      />
    </div>
  );

  const settingSwitch = (key: keyof ConfigurationSchema, label: Phrase) => (
    <div className="flex flex-col min-w-40">
      <Label htmlFor={key} className="flex items-center">
        {getLocalePhrase(language, label)}
        <Tooltip
          content={getLocalePhrase(language, configSchema[key].description)}
        >
          <Info size={18} className="ml-2" />
        </Tooltip>
      </Label>
      <div className="h-10 flex items-center">
        <Switch
          name={key}
          checked={Boolean(config[key])}
          onCheckedChange={(checked) => {
            setConfigValue(key, checked);
            update(key, checked as never);
          }}
        />
      </div>
    </div>
  );

  const testConnection = async () => {
    setTesting(true);
    setConnectionResult(undefined);
    try {
      if (password) {
        await ipc.invoke('setRemoteStoragePassword', [password]);
        setPassword('');
      }
      setConfigValues({
        remoteStorageEnabled: config.remoteStorageEnabled,
        remoteStorageProvider: config.remoteStorageProvider,
        webdavServerUrl: config.webdavServerUrl,
        webdavUsername: config.webdavUsername,
        webdavBasePath: config.webdavBasePath,
      });
      ipc.sendMessage('reconfigureRemoteStorage', []);
      const result = (await ipc.invoke(
        'testRemoteStorageConnection',
        [],
      )) as ConnectionResult;
      setConnectionResult(result);
      if (result.ok) {
        setConfigValue('remoteStorageNeedsSetup', false);
        update('remoteStorageNeedsSetup', false);
      }
    } catch (error) {
      setConnectionResult({
        ok: false,
        code: 'UNKNOWN',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTesting(false);
    }
  };

  const uploadFilters: [keyof ConfigurationSchema, Phrase][] = [
    ['cloudUploadRetail', Phrase.CloudUploadRetailLabel],
    ['cloudUploadClassic', Phrase.CloudUploadClassicLabel],
    ['cloudUploadRaids', Phrase.UploadRaidsLabel],
    ['cloudUploadDungeons', Phrase.UploadMythicPlusLabel],
    ['cloudUpload2v2', Phrase.Upload2v2Label],
    ['cloudUpload3v3', Phrase.Upload3v3Label],
    ['cloudUpload5v5', Phrase.Upload5v5Label],
    ['cloudUploadSkirmish', Phrase.UploadSkirmishLabel],
    ['cloudUploadSoloShuffle', Phrase.UploadSoloShuffleLabel],
    ['cloudUploadBattlegrounds', Phrase.UploadBattlgroundsLabel],
    ['cloudUploadClips', Phrase.UploadClipsLabel],
    ['manualRecordUpload', Phrase.ManualRecordUploadLabel],
  ];
  const managedRemoteUsage = videoState
    .filter((video) => video.cloud && Number.isSafeInteger(video.size))
    .reduce((total, video) => total + (video.size ?? 0), 0);
  const retentionLimitBytes = config.remoteStorageRetentionLimitGb * 1024 ** 3;
  const retentionUsagePercent =
    retentionLimitBytes > 0
      ? Math.min(100, (managedRemoteUsage / retentionLimitBytes) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-5">
      {config.remoteStorageNeedsSetup && (
        <div className="text-warning text-sm">
          {getLocalePhrase(language, Phrase.LegacyCloudSetupRequired)}
        </div>
      )}

      {settingSwitch('remoteStorageEnabled', Phrase.RemoteStorageLabel)}

      {config.remoteStorageEnabled && (
        <>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col min-w-60">
              <Label>
                {getLocalePhrase(language, Phrase.RemoteStorageProviderLabel)}
              </Label>
              <Select
                value={config.remoteStorageProvider}
                onValueChange={(value) =>
                  update(
                    'remoteStorageProvider',
                    value as 'webdav' | 'nextcloud',
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nextcloud">Nextcloud</SelectItem>
                  <SelectItem value="webdav">WebDAV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {field('webdavServerUrl', Phrase.WebDavServerUrlLabel)}
            {field('webdavUsername', Phrase.WebDavUsernameLabel)}
            <div className="flex flex-col min-w-60 max-w-96 flex-1">
              <Label htmlFor="webdavPassword" className="flex items-center">
                {getLocalePhrase(language, Phrase.WebDavPasswordLabel)}
                <Tooltip
                  content={getLocalePhrase(
                    language,
                    Phrase.WebDavPasswordDescription,
                  )}
                >
                  <Info size={18} className="ml-2" />
                </Tooltip>
              </Label>
              <Input
                name="webdavPassword"
                type="password"
                value={password}
                placeholder="••••••••"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setPassword(event.target.value)
                }
                spellCheck={false}
              />
            </div>
            {field('webdavBasePath', Phrase.WebDavBasePathLabel)}
          </div>

          {config.webdavServerUrl
            .trim()
            .toLowerCase()
            .startsWith('http://') && (
            <div className="text-warning text-sm">
              {getLocalePhrase(language, Phrase.InsecureHttpWarning)}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={testConnection} disabled={testing}>
              {getLocalePhrase(language, Phrase.TestConnectionLabel)}
            </Button>
            {connectionResult && (
              <span
                className={
                  connectionResult.ok ? 'text-green-500' : 'text-error'
                }
              >
                {getLocalePhrase(
                  language,
                  connectionResult.ok
                    ? Phrase.ConnectionTestSuccess
                    : Phrase.ConnectionTestFailed,
                )}
                {!connectionResult.ok &&
                  ` (${connectionResult.code}): ${connectionResult.message}`}
                {connectionResult.ok &&
                  connectionResult.warning &&
                  ` — ${connectionResult.warning}`}
              </span>
            )}
          </div>

          {(cloudStatus.quotaAvailable ||
            cloudStatus.remoteStorageError === 'INSUFFICIENT_STORAGE') && (
            <div className="flex flex-col gap-2 max-w-2xl">
              <div className="flex justify-between gap-4 text-sm">
                <span>
                  {getLocalePhrase(language, Phrase.RemoteStorageUsageLabel)}
                </span>
                {cloudStatus.quotaAvailable && (
                  <span className="text-foreground-lighter">
                    {formatBytes(cloudStatus.usage)} /{' '}
                    {formatBytes(cloudStatus.limit)}
                  </span>
                )}
              </div>
              {cloudStatus.quotaAvailable && (
                <div
                  className="h-3 overflow-hidden rounded-full bg-card"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={cloudStatus.limit}
                  aria-valuenow={cloudStatus.usage}
                >
                  <div
                    className={`h-full transition-all ${
                      cloudStatus.usage / cloudStatus.limit >= 0.9
                        ? 'bg-error'
                        : 'bg-primary'
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        (cloudStatus.usage / cloudStatus.limit) * 100,
                      )}%`,
                    }}
                  />
                </div>
              )}
              {cloudStatus.remoteStorageError === 'INSUFFICIENT_STORAGE' && (
                <div className="text-error text-sm">
                  {getLocalePhrase(
                    language,
                    Phrase.RemoteStorageInsufficientStorage,
                  )}
                </div>
              )}
            </div>
          )}

          <Separator />
          <h2 className="text-foreground-lighter font-bold">
            {getLocalePhrase(language, Phrase.RemoteStorageRetentionHeading)}
          </h2>
          <div className="flex flex-wrap items-end gap-5">
            {settingSwitch(
              'remoteStorageRetentionEnabled',
              Phrase.RemoteStorageRetentionLabel,
            )}
            {config.remoteStorageRetentionEnabled && (
              <div className="flex flex-col min-w-48">
                <Label
                  htmlFor="remoteStorageRetentionLimitGb"
                  className="flex items-center"
                >
                  {getLocalePhrase(
                    language,
                    Phrase.RemoteStorageRetentionLimitLabel,
                  )}
                  <Tooltip
                    content={getLocalePhrase(
                      language,
                      configSchema.remoteStorageRetentionLimitGb.description,
                    )}
                  >
                    <Info size={18} className="ml-2" />
                  </Tooltip>
                </Label>
                <Input
                  name="remoteStorageRetentionLimitGb"
                  type="number"
                  min={1}
                  value={config.remoteStorageRetentionLimitGb}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const value = Math.max(
                      1,
                      Math.floor(Number(event.target.value) || 1),
                    );
                    update('remoteStorageRetentionLimitGb', value);
                    setConfigValue('remoteStorageRetentionLimitGb', value);
                  }}
                />
              </div>
            )}
          </div>
          {config.remoteStorageRetentionEnabled && (
            <div className="flex flex-col gap-2 max-w-2xl">
              <div className="flex justify-between gap-4 text-sm">
                <span>
                  {getLocalePhrase(
                    language,
                    Phrase.RemoteStorageManagedUsageLabel,
                  )}
                </span>
                <span className="text-foreground-lighter">
                  {formatBytes(managedRemoteUsage)} /{' '}
                  {formatBytes(retentionLimitBytes)}
                </span>
              </div>
              <div
                className="h-3 overflow-hidden rounded-full bg-card"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={retentionLimitBytes}
                aria-valuenow={managedRemoteUsage}
              >
                <div
                  className={`h-full transition-all ${
                    retentionUsagePercent >= 95 ? 'bg-error' : 'bg-primary'
                  }`}
                  style={{ width: `${retentionUsagePercent}%` }}
                />
              </div>
            </div>
          )}

          <Separator />
          <h2 className="text-foreground-lighter font-bold">
            {getLocalePhrase(language, Phrase.CloudUploadSettingsLabel)}
          </h2>
          <div className="flex flex-wrap gap-5">
            {settingSwitch('remoteStorageAutoUpload', Phrase.CloudUploadLabel)}
            {settingSwitch(
              'remoteStorageUploadRateLimit',
              Phrase.UploadRateLimitToggleLabel,
            )}
            {config.remoteStorageUploadRateLimit && (
              <div className="flex flex-col min-w-48">
                <Label htmlFor="remoteStorageUploadRateLimitMbps">
                  {getLocalePhrase(language, Phrase.UploadRateLimitValueLabel)}
                </Label>
                <Input
                  name="remoteStorageUploadRateLimitMbps"
                  type="number"
                  min={1}
                  value={config.remoteStorageUploadRateLimitMbps}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    update(
                      'remoteStorageUploadRateLimitMbps',
                      Math.max(1, Number(event.target.value) || 1),
                    )
                  }
                />
              </div>
            )}
          </div>

          {config.remoteStorageAutoUpload && (
            <>
              <Separator />
              <h2 className="text-foreground-lighter font-bold">
                {getLocalePhrase(language, Phrase.CloudFilterSettingsLabel)}
              </h2>
              <div className="flex flex-wrap gap-5">
                {uploadFilters.map(([key, label]) => (
                  <div key={key}>{settingSwitch(key, label)}</div>
                ))}
              </div>

              <h2 className="text-foreground-lighter font-bold">
                {getLocalePhrase(
                  language,
                  Phrase.CloudAdvancedFilterSettingsLabel,
                )}
              </h2>
              <div className="text-sm">
                {config.characterUploadFilters.map((filter, index) => (
                  <div
                    key={`${filter.name}-${filter.realm}`}
                    className="flex gap-2 items-center"
                  >
                    <span>
                      {filter.name} — {filter.realm}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const next = [...config.characterUploadFilters];
                        next.splice(index, 1);
                        update('characterUploadFilters', next);
                        setConfigValue('characterUploadFilters', next);
                      }}
                    >
                      <Trash size={16} />
                    </Button>
                  </div>
                ))}
              </div>
              <CharacterFilterDialog
                appState={appState}
                videoState={videoState}
                config={config}
                setConfig={setConfig}
              >
                <Button variant="outline">
                  <PlusIcon className="mr-1" />
                  {getLocalePhrase(language, Phrase.CharacterAdd)}
                </Button>
              </CharacterFilterDialog>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default CloudSettings;
