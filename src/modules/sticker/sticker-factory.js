/**
 * sticker-factory.js
 * 新しいステッカーを作成するファクトリー機能を提供
 */

import { state } from "../../state.js";
import { IMAGE_PROCESSING_CONFIG, STICKER_DEFAULTS } from "../constants.js";
import { saveStickerToDB } from "../db.js";
import { updateInfoButtonVisibility } from "../ui.js";
import { blobURLManager } from "../blob-url-manager.js";
import { prepareImageBlob, getImageDimensions } from "./sticker-processing.js";
import {
  calculateBorderSettings,
  processBorderAndPadding,
} from "./sticker-rendering.js";
import { addStickerToDOM } from "./sticker-core.js";
import { logger } from "../../utils/logger.js";

/**
 * Blobの処理（パディング、縁取りの適用）
 * @param {Blob} blob - 処理対象のBlob
 * @param {number} borderMode - 縁取りモード
 * @param {string} originalType - 元の画像タイプ
 * @param {boolean} hasTransparency - 透過の有無
 * @param {number} imageWidth - 画像の幅
 * @param {number} imageHeight - 画像の高さ
 * @returns {Promise<{resultBlob: Blob, paddedBlob: Blob, borderWidth: number, blobWithBorderUrl: string, paddedBlobUrl: string}>}
 */
async function processBlobForSticker(
  blob,
  borderMode,
  originalType,
  hasTransparency,
  imageWidth,
  imageHeight,
) {
  logger.log(`画像処理開始: モード=${borderMode}`);

  const result = await processBorderAndPadding(
    blob,
    borderMode,
    imageWidth,
    imageHeight,
    originalType,
    hasTransparency,
  );

  const blobWithBorderUrl = blobURLManager.createURL(result.resultBlob);
  const paddedBlobUrl = blobURLManager.createURL(result.paddedBlob);

  logger.log(
    `画像処理完了: 縁取り幅=${result.borderWidth}px, モード=${borderMode}`,
  );

  return {
    resultBlob: result.resultBlob,
    paddedBlob: result.paddedBlob,
    borderWidth: result.borderWidth,
    blobWithBorderUrl,
    paddedBlobUrl,
  };
}

/**
 * ステッカーのDOM要素を作成してキャンバスに追加
 * @param {Object} params - DOM作成パラメータ
 * @returns {number} 実際のz-index
 */
function createStickerDOM(params) {
  const {
    url,
    blobUrl,
    blobWithBorderUrl,
    x,
    yPercent,
    width,
    rotation,
    stickerId,
    zIndex,
    hasBorder,
    borderWidth,
    borderMode,
    originalBlobUrl,
    resizedBlob,
    originalType,
    hasTransparency,
  } = params;

  const actualZIndex = addStickerToDOM(
    url,
    blobUrl,
    blobWithBorderUrl,
    x,
    yPercent,
    width,
    rotation,
    stickerId,
    zIndex,
    false,
    hasBorder,
    borderWidth,
    borderMode,
    originalBlobUrl,
    false,
    resizedBlob,
    originalType,
    hasTransparency,
  );

  logger.log(`DOM作成完了: ID=${stickerId}, z-index=${actualZIndex}`);

  return actualZIndex;
}

/**
 * ステッカーの詳細データを保存（縁取り版画像を含む）
 * @param {number} stickerId - ステッカーID
 * @param {Blob} resizedBlob - リサイズ済みBlob
 * @param {string} blobWithBorderUrl - 縁取り版画像URL
 * @param {string} originalType - 元の画像タイプ
 * @param {boolean} hasTransparency - 透過の有無
 * @returns {Promise<void>}
 */
async function saveDetailedStickerData(
  stickerId,
  resizedBlob,
  blobWithBorderUrl,
  originalType,
  hasTransparency,
) {
  const addedSticker = state.getStickerById(stickerId);
  if (!addedSticker) return;

  let blobForBorder = null;
  if (blobWithBorderUrl) {
    try {
      blobForBorder = await fetch(blobWithBorderUrl).then((r) => r.blob());
    } catch (fetchErr) {
      logger.warn("縁取り画像取得エラー:", fetchErr);
    }
  }

  await saveStickerToDB({
    id: stickerId,
    blob: resizedBlob,
    originalBlob: resizedBlob,
    blobWithBorder: blobForBorder,
    x: addedSticker.x,
    yPercent: addedSticker.yPercent,
    width: addedSticker.width,
    rotation: addedSticker.rotation,
    zIndex: addedSticker.zIndex,
    isPinned: addedSticker.isPinned,
    hasBorder: addedSticker.hasBorder,
    borderMode: addedSticker.borderMode,
    originalType: originalType,
    hasTransparency: hasTransparency,
    timestamp: Date.now(),
  });

  logger.log(`ステッカー詳細保存完了: ID=${stickerId}`);
}

/**
 * 新しいステッカーをIndexedDBに永続化
 * @param {Object} stickerData - 保存するステッカーデータ
 * @returns {Promise<void>}
 */
async function persistNewSticker(stickerData) {
  const {
    stickerId,
    resizedBlob,
    x,
    yPercent,
    width,
    rotation,
    actualZIndex,
    hasBorder,
    borderMode,
    originalType,
    hasTransparency,
    blobWithBorderUrl,
  } = stickerData;

  await saveStickerToDB({
    id: stickerId,
    blob: resizedBlob,
    originalBlob: resizedBlob,
    x,
    yPercent,
    width,
    rotation,
    zIndex: actualZIndex,
    isPinned: false,
    hasBorder,
    borderMode,
    originalType,
    hasTransparency,
    timestamp: Date.now(),
  });

  logger.log(`ステッカー初期保存完了: borderMode=${borderMode}`);

  setTimeout(async () => {
    try {
      await saveDetailedStickerData(
        stickerId,
        resizedBlob,
        blobWithBorderUrl,
        originalType,
        hasTransparency,
      );
    } catch (err) {
      logger.warn("ステッカー詳細保存エラー:", err);
    }
  }, 100);
}

/**
 * Blobからシールを追加（リファクタリング版）
 * @param {Blob} blob - 画像Blob
 * @param {number} x - 画面中央からのX座標オフセット（px）
 * @param {number} yPercent - 画面高さに対するY座標の割合（0-100）
 * @param {number} width - 幅（px）
 * @param {number} rotation - 回転角度
 * @param {number|null} id - シールID
 * @param {number|null} zIndex - z-index
 * @param {boolean} hasBorder - 縁取りあり
 * @param {number} borderMode - 縁取りモード（0:なし, 1:2.5%, 2:5%）
 */
export async function addStickerFromBlob(
  blob,
  x,
  yPercent,
  width = STICKER_DEFAULTS.WIDTH,
  rotation = STICKER_DEFAULTS.ROTATION,
  id = null,
  zIndex = null,
  hasBorder = STICKER_DEFAULTS.HAS_BORDER,
  borderMode = STICKER_DEFAULTS.BORDER_MODE,
) {
  const {
    blob: resizedBlob,
    originalType,
    hasTransparency,
  } = await prepareImageBlob(blob, IMAGE_PROCESSING_CONFIG.MAX_SIZE);

  const stickerId = id || Date.now();

  const imageDimensions = await getImageDimensions(resizedBlob);

  const borderSettings = calculateBorderSettings(
    originalType,
    hasTransparency,
    borderMode,
    imageDimensions.width,
    imageDimensions.height,
  );

  const processedBlobs = await processBlobForSticker(
    resizedBlob,
    borderSettings.borderMode,
    originalType,
    hasTransparency,
    imageDimensions.width,
    imageDimensions.height,
  );

  const originalBlobUrl = blobURLManager.createURL(resizedBlob);

  const displayUrl = hasBorder
    ? processedBlobs.blobWithBorderUrl
    : processedBlobs.paddedBlobUrl;

  logger.log(
    `表示設定: 縁取り幅=${processedBlobs.borderWidth}px, ` +
      `表示=${hasBorder ? "縁取りあり" : "縁取りなし"}`,
  );

  const actualZIndex = createStickerDOM({
    url: displayUrl,
    blobUrl: originalBlobUrl,
    blobWithBorderUrl: processedBlobs.blobWithBorderUrl,
    x,
    yPercent,
    width,
    rotation,
    stickerId,
    zIndex,
    hasBorder,
    borderWidth: processedBlobs.borderWidth,
    borderMode: borderSettings.borderMode,
    originalBlobUrl,
    resizedBlob,
    originalType,
    hasTransparency,
  });

  await persistNewSticker({
    stickerId,
    resizedBlob,
    x,
    yPercent,
    width,
    rotation,
    actualZIndex,
    hasBorder,
    borderMode: borderSettings.borderMode,
    originalType,
    hasTransparency,
    blobWithBorderUrl: processedBlobs.blobWithBorderUrl,
  });

  const addedSticker = state.getStickerById(stickerId);
  if (addedSticker) {
    state.selectSticker(addedSticker);
    updateInfoButtonVisibility();
  }
}
