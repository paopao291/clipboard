// IndexedDB設定
export const DB_CONFIG = {
  NAME: "StickerDB",
  VERSION: 2,
  STORE_NAME: "stickers",
};

// シールのデフォルト設定
export const STICKER_DEFAULTS = {
  BASE_WIDTH: 200, // 基準幅（固定、scaleで拡大縮小）
  WIDTH: 160, // 初期幅（px）
  MIN_WIDTH: 50,
  MAX_WIDTH: 600,
  MAX_WIDTH_PERCENT: 80, // 画面幅の80%まで
  ROTATION: 0,
  Z_INDEX_START: 10,
  HAS_BORDER: true, // 縁取りのデフォルト状態
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
  MAX_WIDTH_MOBILE_PERCENT: 80, // 画面幅の90%
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

// 物理エンジンの設定
export const PHYSICS_CONFIG = {
  // 重力（PC用）
  GRAVITY: {
    X: 0,
    Y: 1,           // 正の値 = 下向き
    SCALE: 0.0005,  // 重力の強さ（0.001→0.0005に軽減）
  },
  
  // 壁
  WALL_THICKNESS: 50,
  
  // 物理ボディのプロパティ
  BODY: {
    RESTITUTION: 0.25, // 反発係数（ほんの少し跳ねる）
    FRICTION: 0.08,    // 摩擦
    FRICTION_AIR: 0.015, // 空気抵抗
    DENSITY: 0.0015,   // 密度
    RADIUS_SCALE: 0.7, // 物理ボディの半径スケール（小さくして重なりやすく）
    
    // Safari/iOS用の調整値（少し重め）
    SAFARI_FRICTION_AIR: 0.015, // 空気抵抗（Chromeより少なめ）
    SAFARI_DENSITY: 0.0008,     // 密度（Chromeより少し重め）
  },
  
  // ジャイロ（スマホ用）
  GYRO: {
    STRENGTH: 0.8,         // 重力の強さ係数
    NEUTRAL_BETA: 10,      // 中立位置（度）
    DEFAULT_GRAVITY: 0.08,  // 平行時の下向き重力
    INITIAL_X: 0,          // 初期X重力
    INITIAL_Y: 0.1,        // 初期Y重力（デフォルトと同じ）
  },
  
  // 重力の更新
  GRAVITY_LERP_FACTOR: 0.1, // 補間係数（小さいほど滑らか）
};
