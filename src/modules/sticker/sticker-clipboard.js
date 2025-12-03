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

    let blob = null;

    if (copiedData.originalBlob) {
      blob = copiedData.originalBlob;
    } else if (copiedData.originalBlobUrl || copiedData.blobUrl) {
      try {
        const url = copiedData.originalBlobUrl || copiedData.blobUrl;
        const blobResponse = await fetch(url);
        blob = await blobResponse.blob();
      } catch (fetchErr) {
        logger.warn("URLからのBlob取得に失敗:", fetchErr);
        throw new Error("コピーしたステッカーデータを取得できません");
      }
    } else {
      throw new Error("コピーしたステッカーデータが無効です");
    }

    if (!blob) {
      throw new Error("有効な画像データがありません");
    }

    // 動的インポートで循環参照を回避
    const { addStickerFromBlob } = await import("./sticker-factory.js");
    await addStickerFromBlob(
      blob,
      xOffset,
      adjustedYPercent,
      copiedData.width,
      copiedData.rotation,
      null,
      null,
      copiedData.hasBorder,
      copiedData.borderMode,
      copiedData.originalType,
      copiedData.hasTransparency,
    );

    return true;
  } catch (err) {
    logger.warn("ステッカーのペーストに失敗しました:", err);
    showToast("ペーストに失敗しました");
    return false;
  }
}
