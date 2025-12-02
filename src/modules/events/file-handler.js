/**
 * file-handler.js
 * ファイル選択とドロップ処理を提供
 */

import { state } from "../../state.js";
import { INTERACTION_CONFIG } from "../constants.js";
import { addStickerFromBlob } from "../sticker.js";
import { absoluteToHybrid, getCenterCoordinates } from "../coordinate-utils.js";

let addButtonTriggered = false;

/**
 * 右下の追加ボタンが押されたことを記録
 */
export function setAddButtonTriggered() {
  addButtonTriggered = true;
}

/**
 * ファイル選択ハンドラー
 * @param {Event} e
 */
export async function handleFileSelect(e) {
  const files = e.target.files;

  if (files.length === 0) return;

  let addedCount = 0;

  for (let file of files) {
    if (file.type.indexOf("image") !== -1) {
      const offsetXPx = addedCount * INTERACTION_CONFIG.STICKER_OFFSET_PX;
      const offsetYPx = addedCount * INTERACTION_CONFIG.STICKER_OFFSET_PX;

      let coords;
      if (addButtonTriggered) {
        const center = getCenterCoordinates();
        const offsetYPercent = (offsetYPx / window.innerHeight) * 100;
        coords = { x: offsetXPx, yPercent: center.yPercent + offsetYPercent };
      } else if (state.lastTouchX && state.lastTouchY) {
        coords = absoluteToHybrid(
          state.lastTouchX + offsetXPx,
          state.lastTouchY + offsetYPx,
        );
      } else {
        const center = getCenterCoordinates();
        const offsetYPercent = (offsetYPx / window.innerHeight) * 100;
        coords = { x: offsetXPx, yPercent: center.yPercent + offsetYPercent };
      }

      await addStickerFromBlob(file, coords.x, coords.yPercent);

      addedCount++;
    }
  }

  addButtonTriggered = false;
  e.target.value = "";
}
