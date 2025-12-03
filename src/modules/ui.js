/**
 * UI Module - Re-exports from modular components
 *
 * This file maintains backward compatibility by re-exporting all functions
 * from the refactored UI modules in src/modules/ui/
 */

// Toast notifications
export { showToast } from "./ui/toast.js";

// Help sticker UI
export {
  showHelp,
  hideHelp,
  restoreHelpSticker,
  clearHelpStickerState,
  showInitialHelp,
  updateHelpStickerBorder,
  updateHelpStickerState,
} from "./ui/help-sticker-ui.js";

// DOM elements
export { initElements, elements, isMobile } from "./ui/dom-elements.js";

// Button visibility
export { updateInfoButtonVisibility } from "./ui/button-visibility.js";

// Trash interaction
export {
  setTrashDragOver,
  resetStickerTransformOrigin,
  isOverTrashBtn,
} from "./ui/trash-interaction.js";

// Overlay
export {
  showOverlay,
  hideOverlay,
  setOverlayDeleteMode,
} from "./ui/overlay.js";
