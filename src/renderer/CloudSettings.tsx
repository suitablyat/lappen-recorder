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

const CloudSettings = ({ appState, config, setConfig, videoState }: IProps) => {
  const { language } = appState;
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
