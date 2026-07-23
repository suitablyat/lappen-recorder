const instance = {
  get: <T>(key: string): T => {
    if (key === 'language') return 'English' as T;
    return 0 as T;
  },
  set: jest.fn(),
  has: jest.fn(() => false),
  getNumber: jest.fn(() => 0),
  getString: jest.fn(() => ''),
  getPath: jest.fn(() => ''),
  on: jest.fn(),
};

export default class ConfigService {
  static getInstance() {
    return instance;
  }
}
