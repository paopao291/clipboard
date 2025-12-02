/**
 * events.js (refactored)
 * イベント処理のメインエントリーポイント
 * 分割されたモジュールを統合してエクスポート
 */

// Unified pointer handlers (mouse + touch, eliminates ~200 lines of duplication)
export {
  handleCanvasMouseDown,
  handleCanvasTouchStart,
  handleStickerMouseDown,
  handleStickerTouchStart,
  handleMouseMove,
  handleTouchMove,
  handleMouseUp,
  handleTouchEnd,
  handleWheel,
  handleCanvasWheel,
  attachStickerEventListeners,
} from "./events/unified-pointer-handler.js";

// Keyboard handlers
export {
  handleKeyboardShortcut,
} from "./events/keyboard-handler.js";

// Clipboard handlers
export {
  handlePaste,
  handlePasteAreaBlur,
  handlePasteAreaInput,
  handlePasteAreaKeydown,
} from "./events/clipboard-handler.js";

// File handlers
export {
  handleFileSelect,
  setAddButtonTriggered,
} from "./events/file-handler.js";

// Gesture utilities (exposed for advanced usage if needed)
export {
  checkAndFixOutOfBounds,
} from "./events/gesture-handler.js";
