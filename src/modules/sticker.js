/**
 * sticker.js (refactored)
 * ステッカー機能のメインエントリーポイント
 * 分割されたモジュールを統合してエクスポート
 */

// Core functions (DOM operations, CRUD)
export {
  addStickerToDOM,
  removeSticker,
  saveStickerChanges,
  saveAllStickerPositions,
  toggleStickerPin,
  getBaseWidth,
} from "./sticker/sticker-core.js";

// Transform functions (position, rotation, size, z-index)
export {
  updateStickerPosition,
  updateStickerRotation,
  updateStickerSize,
  bringToFront,
  sendToBack,
  applyStickerTransform,
} from "./sticker/sticker-transforms.js";

// Processing functions (image resize, optimization)
export {
  initWebPSupport,
  hasTransparency,
  resizeImageBlob,
  prepareImageBlob,
  getImageDimensions,
  getImageTypeInfo,
  getBlobFromURL,
} from "./sticker/sticker-processing.js";

// Rendering functions (borders, padding)
export {
  calculateBorderWidth,
  addPaddingToImage,
  applyOutlineFilter,
  calculateBorderSettings,
  processBorderAndPadding,
  toggleStickerBorder,
  updateStickerImageUrl,
} from "./sticker/sticker-rendering.js";

// Effects functions (background removal)
export {
  toggleStickerBgRemoval,
} from "./sticker/sticker-effects.js";

// Clipboard functions (copy/paste)
export {
  copySticker,
  pasteSticker,
} from "./sticker/sticker-clipboard.js";

// Factory function (create new stickers)
export {
  addStickerFromBlob,
} from "./sticker/sticker-factory.js";
