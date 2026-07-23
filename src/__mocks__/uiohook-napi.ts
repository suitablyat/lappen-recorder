export enum EventType {
  EVENT_KEY_PRESSED = 3,
  EVENT_KEY_RELEASED = 4,
  EVENT_MOUSE_PRESSED = 5,
  EVENT_MOUSE_RELEASED = 6,
}

export type UiohookKeyboardEvent = {
  type: EventType;
  keycode: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

export type UiohookMouseEvent = UiohookKeyboardEvent & { button: number };

export const uIOhook = {
  on: jest.fn(),
  once: jest.fn(),
  off: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
};
