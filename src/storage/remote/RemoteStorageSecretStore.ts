import ElectronStore from 'electron-store';
import { safeStorage } from 'electron';

type SecretSchema = { password?: string };
type SecretStore = {
  get: (key: 'password') => string | undefined;
  set: (key: 'password', value: string) => void;
  delete: (key: 'password') => void;
};

export default class RemoteStorageSecretStore {
  private readonly store = new ElectronStore<SecretSchema>({
    name: 'remote-storage-secrets',
  }) as unknown as SecretStore;

  setPassword(password: string) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure operating-system storage is unavailable');
    }
    if (!password) {
      this.store.delete('password');
      return;
    }
    this.store.set(
      'password',
      safeStorage.encryptString(password).toString('base64'),
    );
  }

  getPassword() {
    const encrypted = this.store.get('password');
    if (!encrypted || !safeStorage.isEncryptionAvailable()) return '';
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch {
      console.warn('[RemoteStorage] Stored password cannot be decrypted');
      return '';
    }
  }

  hasPassword() {
    return Boolean(this.store.get('password'));
  }
}
