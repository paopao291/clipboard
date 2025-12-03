/**
 * clipboard-handler.js
 * クリップボード（ペースト）処理を提供
 */

import { state } from "../../state.js";
import { logger } from "../../utils/logger.js";
import { elements } from "../ui.js";
import { addStickerFromBlob, pasteSticker } from "../sticker.js";
import { showConfirmDialog } from "../dialog.js";
import { absoluteToHybrid, getCenterCoordinates } from "../coordinate-utils.js";

/**
 * ペーストイベントハンドラー
 * @param {ClipboardEvent} e
 */
export async function handlePaste(e) {
  e.preventDefault();

  let clipboardText = "";
  try {
    clipboardText = e.clipboardData.getData("text/plain");
  } catch (err) {
    logger.warn("クリップボードテキスト取得エラー:", err);
  }

  let coords;
  if (state.lastMouseX && state.lastMouseY) {
    coords = absoluteToHybrid(state.lastMouseX, state.lastMouseY);
  } else if (state.lastTouchX && state.lastTouchY) {
    coords = absoluteToHybrid(state.lastTouchX, state.lastTouchY);
  } else {
    coords = getCenterCoordinates();
  }

  if (clipboardText && state.isStickerIdentifier(clipboardText)) {
    const success = await pasteSticker(coords.x, coords.yPercent);
    if (success) {
      elements.pasteArea.blur();
      return;
    }
  }

  const items = e.clipboardData.items;
  let hasImage = false;

  if (!items) {
    showToast("ペースト機能が利用できません");
    return;
  }

  for (let item of items) {
    if (item.type.indexOf("image") !== -1) {
      hasImage = true;
      const blob = item.getAsFile();
      await addStickerFromBlob(blob, coords.x, coords.yPercent);
      elements.pasteArea.blur();
      break;
    }
  }

  if (!hasImage && !state.isStickerIdentifier(clipboardText)) {
    showConfirmDialog("クリップボードに画像がありません", "写真を選択", () => {
      elements.galleryInput.click();
    });
  }
}

/**
 * ペーストエリアのblurイベント
 */
export function handlePasteAreaBlur() {
  // ペーストエリアからフォーカスが外れたときの処理（必要に応じて）
}

/**
 * ペーストエリアのinputイベント
 * @param {Event} e
 */
export function handlePasteAreaInput(e) {
  e.target.value = "";
}

/**
 * ペーストエリアのkeydownイベント
 * @param {KeyboardEvent} e
 */
export function handlePasteAreaKeydown(e) {
  if (e.key === "Escape") {
    elements.pasteArea.blur();
  }
}
