// IndexedDB設定
export const DB_CONFIG = {
  NAME: "StickerDB",
  VERSION: 1,
  STORE_NAME: "stickers",
};

// シールのデフォルト設定
export const STICKER_DEFAULTS = {
  WIDTH: 200, // ピクセル値
  MIN_WIDTH: 50,
  MAX_WIDTH: 600, // 画面幅の最大値は後で計算
  MAX_WIDTH_PERCENT: 80, // 画面幅の80%まで
  ROTATION: 0,
  Z_INDEX_START: 10,
};

// サイズ変更の設定
export const RESIZE_CONFIG = {
  WHEEL_DELTA: 10, // ホイール1スクロールで10px変更
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

// ヘルプステッカーの設定
export const HELP_STICKER_CONFIG = {
  BASE_WIDTH: 420,
  MIN_WIDTH: 60, // 小さく縮められるように
  MAX_WIDTH_DESKTOP: 600,
  MAX_WIDTH_MOBILE_PERCENT: 90, // 画面幅の90%
  INITIAL_ROTATION: 3, // 初期角度
};

// ペーストエリアの設定
export const PASTE_AREA_CONFIG = {
  FOCUS_DELAY_MS: 100,
  CLEAR_DELAY_MS: 100,
  TOUCH_SIZE: 100,
};

// ドラッグ・タップ判定の設定
export const INTERACTION_CONFIG = {
  DRAG_THRESHOLD_PX: 5, // ドラッグ開始の閾値（px）
  TAP_THRESHOLD_PX: 10, // タップ判定の移動閾値（px）
  TAP_MAX_DURATION_MS: 200, // タップ判定の最大時間（ms）
  STICKER_OFFSET_PX: 30, // 複数画像追加時のオフセット（px）
};

// DOM要素のID
export const DOM_IDS = {
  CANVAS: "canvas",
  GALLERY_INPUT: "galleryInput",
  CAMERA_INPUT: "cameraInput",
  PASTE_AREA: "pasteArea",
  INFO_BTN: "infoBtn",
  TRASH_BTN: "trashBtn",
  ADD_BTN: "addBtn",
};

// メッセージ
export const MESSAGES = {
  IMAGE_ADDED: "画像を追加しました！",
  IMAGES_ADDED: (count) => `${count}枚の画像を追加しました！`,
  SELECT_FROM_LIBRARY: "写真ライブラリから選択してください",
};
