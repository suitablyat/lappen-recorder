export default class ElectronStore<T extends Record<string, unknown>> {
  store = {} as T;

  get(key: string) {
    return this.store[key as keyof T];
  }

  set(key: string, value: unknown) {
    this.store[key as keyof T] = value as T[keyof T];
  }

  has(key: string) {
    return Object.hasOwn(this.store, key);
  }

  delete(key: string) {
    delete this.store[key as keyof T];
  }

  onDidAnyChange() {
    return () => undefined;
  }
}
