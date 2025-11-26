// IndexedDB設定
export const DB_CONFIG = {
  NAME: "StickerDB",
  VERSION: 2,
  STORE_NAME: "stickers",
};

// 縁取りの幅設定（順に: なし, 細め(2.5%), 標準(5%)）
export const BORDER_WIDTHS = [0, 0.025, 0.05];

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
  BORDER_MODE: 2, // 縁取りモード（0:なし, 1:4px, 2:8px）
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

// 物理エンジンの設定
export const PHYSICS_CONFIG = {
  // 重力（PC用）
  GRAVITY: {
    X: 0,
    Y: 1, // 正の値 = 下向き
    SCALE: 0.00075, // 重力の強さ（0.001→0.0005に軽減）
  },

  // 壁
  WALL_THICKNESS: 50,

  // 物理ボディのプロパティ
  BODY: {
    RESTITUTION: 0.25, // 反発係数（ほんの少し跳ねる）
    FRICTION: 0.08, // 摩擦
    FRICTION_AIR: 0.01, // 空気抵抗
    DENSITY: 0.0015, // 密度
    RADIUS_SCALE: 0.7, // 物理ボディの半径スケール（小さくして重なりやすく）
  },

  // ジャイロ（スマホ用）
  GYRO: {
    STRENGTH: 0.95, // 重力の強さ係数
    NEUTRAL_BETA: 10, // 中立位置（度）
    DEFAULT_GRAVITY: 0.08, // 平行時の下向き重力
    INITIAL_X: 0, // 初期X重力
    INITIAL_Y: 0.1, // 初期Y重力（デフォルトと同じ）
  },

  // 重力の更新
  GRAVITY_LERP_FACTOR: 0.1, // 補間係数（小さいほど滑らか）

  // 物理演算とレンダリングの設定
  PHYSICS_HZ: 60, // 物理演算60Hz
  RENDER_FPS: 60, // レンダリング60FPS

  // DOM更新の最適化用閾値
  VELOCITY_THRESHOLD: 0.01, // これ以下の速度ならほぼ静止
  POSITION_THRESHOLD: 0.1, // これ以下の移動ならDOM更新スキップ
  ANGLE_THRESHOLD: 0.001, // これ以下の回転ならDOM更新スキップ

  // プロキシ画像
  PROXY_SIZE: 400, // プロキシ画像のサイズ（元画像1000pxから縮小）
};

// 自動レイアウトの設定
export const LAYOUT_CONFIG = {
  CALCULATION_ITERATIONS: 50,
  ANIMATION_DURATION_MS: 800,
  FORCE: {
    REPULSION_STRENGTH: 50000,
    BOUNDARY_MARGIN: 50,
    CENTER_STRENGTH: 0.1,
    DAMPING: 0.6,
  },
};

// 画像処理の設定
export const IMAGE_PROCESSING_CONFIG = {
  MAX_SIZE: 1000, // リサイズ後の最大サイズ
  TRANSPARENCY_THRESHOLD: 128, // 透過判定の閾値（0-255）
  WEBP_QUALITY: 0.9, // WebP変換品質
  BORDER_DIRECTIONS: {
    ANGULAR: 8, // 角ばった縁取り（JPEG/非透過PNG）
    CIRCULAR: 36, // 円形の縁取り（透過PNG）
  },
};

// タッチイベントの設定
export const TOUCH_CONFIG = {
  DOUBLE_TAP_MAX_INTERVAL_MS: 500, // ダブルタップ判定の最大間隔
  DRAG_VELOCITY_DELTA_MS: 100, // 投げる動作の速度計算時間
  PINCH_MIN_DISTANCE: 30, // ピンチ開始の最小距離
  ROTATION_MIN_ANGLE: 5, // 回転開始の最小角度（度）
};

// UI フィードバックの設定
export const UI_FEEDBACK_CONFIG = {
  CLICK_FEEDBACK_SCALE: 0.98, // クリック時の縮小率
  CLICK_FEEDBACK_DURATION_MS: 400, // クリックフィードバックの時間
  BUTTON_SCALE_HOVER: 1.05, // ボタンホバー時の拡大率
  BUTTON_SCALE_ACTIVE: 0.95, // ボタンアクティブ時の縮小率
};

// 保存・エクスポートの設定
export const EXPORT_CONFIG = {
  CANVAS_RENDER_DELAY_MS: 100, // Canvas生成前の待機時間
  UI_RESTORE_DELAY_MS: 100, // UI復元前の待機時間
};
