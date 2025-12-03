/**
 * sticker-clipboard.js
 * ステッカーのコピー&ペースト機能を提供
 */

import { state } from "../../state.js";
import { logger } from "../../utils/logger.js";
import { showToast } from "../ui.js";

/**
 * addStickerFromBlob関数は循環参照を避けるため動的にインポート
 */

/**
 * ステッカーをコピー（UI操作用）
 * @param {Object} sticker - コピーするステッカー
 * @returns {Promise<boolean>} 成功した場合はtrue
 */
export async function copySticker(sticker) {
  if (!sticker) {
    logger.warn("コピーするステッカーが指定されていません");
    return false;
  }

  try {
    const identifier = await state.copySticker(sticker);

    try {
      await navigator.clipboard.writeText(identifier);
    } catch (clipboardErr) {
      logger.warn(
        "クリップボードへの書き込みに失敗しました（メモリ保存は成功）:",
        clipboardErr,
      );
    }

    showToast("コピーしました");
    return true;
  } catch (err) {
    logger.warn("ステッカーのコピーに失敗しました:", err);
    showToast("コピーに失敗しました");
    return false;
  }
}

/**
 * コピーしたステッカーをペーストする
 * @param {number} x - 画面中央からのX座標オフセット（px）
 * @param {number} yPercent - 画面高さに対するY座標の割合（0-100）
 * @returns {Promise<boolean>} 成功した場合はtrue
 */
export async function pasteSticker(x, yPercent) {
  const copiedData = state.getCopiedStickerData();

  if (!copiedData) {
    try {
      if (typeof state.restoreCopiedStickerData === "function") {
        await state.restoreCopiedStickerData();
      }
    } catch (e) {
      // 復元失敗
    }
    const retried = state.getCopiedStickerData();
    if (!retried) {
      logger.warn("コピーされたステッカーがありません");
      return false;
    }
    return await pasteSticker(x, yPercent);
  }

  try {
    const adjustedYPercent = typeof yPercent === "number" ? yPercent : 50;
    const xOffset = typeof x === "number" ? x : 0;

    const blob = await getBlobFromCopiedData(copiedData);

    // 動的インポートで循環参照を回避
    const { addStickerFromBlob } = await import("./sticker-factory.js");
    await addStickerFromBlob({
      blob,
      x: xOffset,
      yPercent: adjustedYPercent,
      width: copiedData.width,
      rotation: copiedData.rotation,
      hasBorder: copiedData.hasBorder,
      borderMode: copiedData.borderMode,
      storedOriginalType: copiedData.originalType,
      storedHasTransparency: copiedData.hasTransparency,
    });

    return true;
  } catch (err) {
    logger.warn("ステッカーのペーストに失敗しました:", err);
    showToast("ペーストに失敗しました");
    return false;
  }
}

/**
 * コピーデータからBlobを取得
 * @param {Object} copiedData - コピーされたステッカーデータ
 * @returns {Promise<Blob>} 画像Blob
 * @throws {Error} Blobが取得できない場合
 */
async function getBlobFromCopiedData(copiedData) {
  if (copiedData.originalBlob) {
    return copiedData.originalBlob;
  }

  if (copiedData.originalBlobUrl || copiedData.blobUrl) {
    try {
      const url = copiedData.originalBlobUrl || copiedData.blobUrl;
      const blobResponse = await fetch(url);
      const blob = await blobResponse.blob();
      if (!blob) {
        throw new Error("Blobが空です");
      }
      return blob;
    } catch (fetchErr) {
      logger.warn("URLからのBlob取得に失敗:", fetchErr);
      throw new Error("コピーしたステッカーデータを取得できません");
    }
  }

  throw new Error("コピーしたステッカーデータが無効です");
}
