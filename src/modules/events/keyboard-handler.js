/**
 * keyboard-handler.js
 * キーボードショートカット処理を提供
 */

import { state } from "../../state.js";
import { elements } from "../ui.js";
import { copySticker } from "../sticker.js";
import { absoluteToHybrid, getCenterCoordinates } from "../coordinate-utils.js";

/**
 * キーボードショートカットを処理
 * @param {KeyboardEvent} e - キーボードイベント
 */
export async function handleKeyboardShortcut(e) {
  const isCmdKey = e.metaKey || e.ctrlKey;
  if (!isCmdKey) return;

  // Cmd+C または Ctrl+C
  if (e.key === "c" || e.key === "C") {
    if (state.selectedSticker) {
      const isHelpSticker =
        state.selectedSticker.element.classList.contains("help-sticker");
      if (isHelpSticker) {
        return;
      }

      e.preventDefault();
      try {
        await copySticker(state.selectedSticker);
      } catch (err) {
        console.warn("キーボードショートカットによるコピー処理に失敗:", err);
      }
    }
  }

  // Cmd+V または Ctrl+V
  if (e.key === "v" || e.key === "V") {
    if (
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement
    ) {
      return;
    }

    if (document.activeElement === elements.pasteArea) {
      return;
    }

    const copiedData = state.getCopiedStickerData();
    if (copiedData) {
      e.preventDefault();
      let coords;
      if (state.lastMouseX && state.lastMouseY) {
        coords = absoluteToHybrid(state.lastMouseX, state.lastMouseY);
      } else if (state.lastTouchX && state.lastTouchY) {
        coords = absoluteToHybrid(state.lastTouchX, state.lastTouchY);
      } else {
        coords = getCenterCoordinates();
      }

      try {
        const { pasteSticker } = await import("../sticker.js");
        await pasteSticker(coords.x, coords.yPercent);
      } catch (err) {
        console.warn("キーボードショートカットによるペースト処理に失敗:", err);
      }
      return;
    }

    if (elements.pasteArea) {
      elements.pasteArea.focus();
    }
  }
}
