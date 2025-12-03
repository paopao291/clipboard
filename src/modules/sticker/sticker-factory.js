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
 * 画像タイプ情報を解決（保存された値があれば優先、なければ検出）
 * @param {Blob} blob - 画像Blob
 * @param {string|null} storedOriginalType - 保存された画像タイプ
 * @param {boolean|null} storedHasTransparency - 保存された透過情報
 * @returns {Promise<{originalType: string, hasTransparency: boolean}>}
 */
async function resolveImageTypeInfo(blob, storedOriginalType, storedHasTransparency) {
  const {
    blob: resizedBlob,
    originalType: detectedOriginalType,
    hasTransparency: detectedHasTransparency,
  } = await prepareImageBlob(blob, IMAGE_PROCESSING_CONFIG.MAX_SIZE);

  // 保存された値がある場合はそれを使用（コピー・ペースト時に縁取りの方向を保持）
  const originalType = storedOriginalType || detectedOriginalType;
  const hasTransparency =
    storedHasTransparency !== null ? storedHasTransparency : detectedHasTransparency;

  return {
    blob: resizedBlob,
    originalType,
    hasTransparency,
  };
}

/**
 * ステッカー作成のオプション
 * @typedef {Object} StickerCreationOptions
 * @property {Blob} blob - 画像Blob
 * @property {number} x - 画面中央からのX座標オフセット（px）
 * @property {number} yPercent - 画面高さに対するY座標の割合（0-100）
 * @property {number} [width] - 幅（px）
 * @property {number} [rotation] - 回転角度
 * @property {number|null} [id] - シールID
 * @property {number|null} [zIndex] - z-index
 * @property {boolean} [hasBorder] - 縁取りあり
 * @property {number} [borderMode] - 縁取りモード（0:なし, 1:2.5%, 2:5%）
 * @property {string|null} [storedOriginalType] - 保存された画像タイプ（コピー・ペースト時に使用）
 * @property {boolean|null} [storedHasTransparency] - 保存された透過情報（コピー・ペースト時に使用）
 */

/**
 * Blobからシールを追加（リファクタリング版）
 * 
 * 使用例:
 * - オプションオブジェクト形式: addStickerFromBlob({ blob, x, yPercent, ... })
 * - 位置引数形式（後方互換性）: addStickerFromBlob(blob, x, yPercent)
 * 
 * @param {Blob|StickerCreationOptions} blobOrOptions - 画像Blobまたはオプションオブジェクト
 * @param {number} [x] - 画面中央からのX座標オフセット（px）（位置引数形式の場合）
 * @param {number} [yPercent] - 画面高さに対するY座標の割合（0-100）（位置引数形式の場合）
 * @returns {Promise<void>}
 */
export async function addStickerFromBlob(blobOrOptions, x, yPercent) {
  // オプションオブジェクト形式か位置引数形式かを判定
  let options;
  if (blobOrOptions instanceof Blob) {
    // 位置引数形式（後方互換性）
    options = {
      blob: blobOrOptions,
      x: typeof x === "number" ? x : 0,
      yPercent: typeof yPercent === "number" ? yPercent : 50,
      width: STICKER_DEFAULTS.WIDTH,
      rotation: STICKER_DEFAULTS.ROTATION,
      id: null,
      zIndex: null,
      hasBorder: STICKER_DEFAULTS.HAS_BORDER,
      borderMode: STICKER_DEFAULTS.BORDER_MODE,
      storedOriginalType: null,
      storedHasTransparency: null,
    };
  } else {
    // オプションオブジェクト形式
    options = {
      blob: blobOrOptions.blob,
      x: blobOrOptions.x ?? 0,
      yPercent: blobOrOptions.yPercent ?? 50,
      width: blobOrOptions.width ?? STICKER_DEFAULTS.WIDTH,
      rotation: blobOrOptions.rotation ?? STICKER_DEFAULTS.ROTATION,
      id: blobOrOptions.id ?? null,
      zIndex: blobOrOptions.zIndex ?? null,
      hasBorder: blobOrOptions.hasBorder ?? STICKER_DEFAULTS.HAS_BORDER,
      borderMode: blobOrOptions.borderMode ?? STICKER_DEFAULTS.BORDER_MODE,
      storedOriginalType: blobOrOptions.storedOriginalType ?? null,
      storedHasTransparency: blobOrOptions.storedHasTransparency ?? null,
    };
  }

  const { blob: resizedBlob, originalType, hasTransparency } =
    await resolveImageTypeInfo(
      options.blob,
      options.storedOriginalType,
      options.storedHasTransparency,
    );

  const stickerId = options.id || Date.now();

  const imageDimensions = await getImageDimensions(resizedBlob);

  const borderSettings = calculateBorderSettings(
    originalType,
    hasTransparency,
    options.borderMode,
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

  const displayUrl = options.hasBorder
    ? processedBlobs.blobWithBorderUrl
    : processedBlobs.paddedBlobUrl;

  logger.log(
    `表示設定: 縁取り幅=${processedBlobs.borderWidth}px, ` +
      `表示=${options.hasBorder ? "縁取りあり" : "縁取りなし"}`,
  );

  const actualZIndex = createStickerDOM({
    url: displayUrl,
    blobUrl: originalBlobUrl,
    blobWithBorderUrl: processedBlobs.blobWithBorderUrl,
    x: options.x,
    yPercent: options.yPercent,
    width: options.width,
    rotation: options.rotation,
    stickerId,
    zIndex: options.zIndex,
    hasBorder: options.hasBorder,
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
    x: options.x,
    yPercent: options.yPercent,
    width: options.width,
    rotation: options.rotation,
    actualZIndex,
    hasBorder: options.hasBorder,
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
