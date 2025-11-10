// IndexedDB設定
export const DB_CONFIG = {
  NAME: "StickerDB",
  VERSION: 1,
  STORE_NAME: "stickers",
};

// シールのデフォルト設定
export const STICKER_DEFAULTS = {
  WIDTH: 200,
  MIN_WIDTH: 50,
  MAX_WIDTH: 800,
  ROTATION: 0,
  Z_INDEX_START: 10,
};

// サイズ変更の設定
export const RESIZE_CONFIG = {
  WHEEL_DELTA: 10,
  DEBOUNCE_MS: 500,
};

// トースト通知の設定
export const TOAST_CONFIG = {
  DURATION_MS: 2000,
  FADE_OUT_DELAY_MS: 300,
};

// ヘルプモーダルの設定
export const HELP_CONFIG = {
  INITIAL_DELAY_MS: 800,
  STORAGE_KEY: "hasVisited",
};

// ペーストエリアの設定
export const PASTE_AREA_CONFIG = {
  FOCUS_DELAY_MS: 100,
  CLEAR_DELAY_MS: 100,
  TOUCH_SIZE: 100,
};

// DOM要素のID
export const DOM_IDS = {
  CANVAS: "canvas",
  GALLERY_INPUT: "galleryInput",
  CAMERA_INPUT: "cameraInput",
  PASTE_AREA: "pasteArea",
  INFO_BTN: "infoBtn",
  HELP_MODAL: "helpModal",
  CLOSE_HELP: "closeHelp",
  TRASH_BTN: "trashBtn",
};

// メッセージ
export const MESSAGES = {
  IMAGE_ADDED: "画像を追加しました！",
  IMAGES_ADDED: (count) => `${count}枚の画像を追加しました！`,
  SELECT_FROM_LIBRARY: "写真ライブラリから選択してください",
};
