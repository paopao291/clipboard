/**
 * sticker-transforms.js
 * ステッカーのサイズ、位置、回転などの変換操作を提供
 */

import { state } from "../../state.js";
import { STICKER_DEFAULTS, HELP_STICKER_CONFIG } from "../constants.js";
import { updateStickerInDB } from "../db.js";
import { showToast, updateHelpStickerState } from "../ui.js";
import { getBaseWidth } from "./sticker-core.js";

/**
 * ステッカーのscaleを計算
 * @param {Object} sticker - シールオブジェクト
 * @returns {number} scale値
 */
export function calculateScale(sticker) {
  return sticker.width / getBaseWidth(sticker);
}

/**
 * ステッカーのサイズ制限設定を取得
 * @param {Object} sticker - シールオブジェクト
 * @returns {Object} {minWidth, maxWidth}
 */
export function getSizeConstraints(sticker) {
  if (sticker.isHelpSticker) {
    const isMobile = window.innerWidth <= 768;
    const maxWidth = isMobile
      ? Math.min(
          HELP_STICKER_CONFIG.MAX_WIDTH_DESKTOP,
          (window.innerWidth * HELP_STICKER_CONFIG.MAX_WIDTH_MOBILE_PERCENT) /
            100,
        )
      : HELP_STICKER_CONFIG.MAX_WIDTH_DESKTOP;
    return {
      minWidth: HELP_STICKER_CONFIG.MIN_WIDTH,
      maxWidth: maxWidth,
    };
  } else {
    const maxWidthByScreen =
      (window.innerWidth * STICKER_DEFAULTS.MAX_WIDTH_PERCENT) / 100;
    return {
      minWidth: STICKER_DEFAULTS.MIN_WIDTH,
      maxWidth: Math.min(STICKER_DEFAULTS.MAX_WIDTH, maxWidthByScreen),
    };
  }
}

/**
 * ステッカーのtransformを適用（回転とスケール）
 * @param {Object} sticker - シールオブジェクト
 */
export function applyStickerTransform(sticker) {
  if (sticker.imgWrapper) {
    const scale = calculateScale(sticker);
    sticker.imgWrapper.style.transform = `rotate(${sticker.rotation}deg) scale(${scale})`;
  }
}

/**
 * シールの位置を更新
 * @param {Object} sticker - シールオブジェクト
 * @param {number} x - 画面中央からのX座標オフセット（px）
 * @param {number} yPercent - 画面高さに対するY座標の割合（0-100）
 */
export function updateStickerPosition(sticker, x, yPercent) {
  sticker.x = x;
  sticker.yPercent = yPercent;
  sticker.element.style.left = `calc(50% + ${x}px)`;
  sticker.element.style.top = `${yPercent}%`;
}

/**
 * シールの回転を更新
 * @param {Object} sticker - シールオブジェクト
 * @param {number} rotation - 回転角度
 */
export function updateStickerRotation(sticker, rotation) {
  sticker.rotation = rotation;
  applyStickerTransform(sticker);
}

/**
 * シールのサイズを更新
 * @param {Object} sticker - シールオブジェクト
 * @param {number} width - 幅（px）
 */
export function updateStickerSize(sticker, width) {
  const { minWidth, maxWidth } = getSizeConstraints(sticker);
  sticker.width = Math.max(minWidth, Math.min(maxWidth, width));

  const baseWidth = getBaseWidth(sticker);
  sticker.element.style.width = `${baseWidth}px`;

  applyStickerTransform(sticker);
}

/**
 * ステッカーのz-indexを更新してDBに保存
 * @param {Object} sticker - シールオブジェクト
 * @param {number} newZIndex - 新しいz-index
 */
async function updateStickerZIndex(sticker, newZIndex) {
  sticker.element.style.zIndex = newZIndex;
  sticker.zIndex = newZIndex;

  if (!sticker.isHelpSticker) {
    await updateStickerInDB(sticker.id, { zIndex: newZIndex });
  } else {
    updateHelpStickerState(sticker);
  }
}

/**
 * ステッカーを最前面に移動
 * @param {Object} sticker - シールオブジェクト
 */
export async function bringToFront(sticker) {
  const newZIndex = state.incrementZIndex();
  await updateStickerZIndex(sticker, newZIndex);
}

/**
 * ステッカーを最背面に移動
 * @param {Object} sticker - シールオブジェクト
 */
export async function sendToBack(sticker) {
  const minZIndex = Math.min(...state.stickers.map((s) => s.zIndex));
  const newZIndex = Math.max(1, minZIndex - 1);
  await updateStickerZIndex(sticker, newZIndex);

  showToast("最背面に移動しました");
}
