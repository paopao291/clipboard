/**
 * sticker-loader.js
 * IndexedDBからステッカーを読み込んでDOMに追加する処理
 */

import { loadAllStickersFromDB, updateStickerInDB } from "../modules/db.js";
import { STICKER_DEFAULTS } from "../modules/constants.js";
import {
  addStickerToDOM,
  calculateBorderWidth,
  addPaddingToImage,
  applyOutlineFilter,
  hasTransparency as checkTransparency,
} from "../modules/sticker.js";

/**
 * IndexedDBからステッカーデータを読み込む
 */
async function loadStickerDataFromDB() {
  const stickers = await loadAllStickersFromDB();
  console.log(`IndexedDBから${stickers.length}個のステッカーを読み込みました`);
  return stickers;
}

/**
 * Blobから画像を読み込む
 */
async function loadImageFromBlob(blob) {
  return new Promise((resolve) => {
    const img = new Image();
    const tempBlobUrl = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(tempBlobUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(tempBlobUrl);
      resolve(img);
    };

    img.src = tempBlobUrl;
  });
}

/**
 * 画像の透過情報を判定
 */
async function checkImageTransparency(blob) {
  return new Promise((resolve) => {
    const testImg = new Image();
    const testUrl = URL.createObjectURL(blob);

    testImg.onload = () => {
      const result = checkTransparency(testImg);
      URL.revokeObjectURL(testUrl);
      resolve(result);
    };

    testImg.onerror = () => {
      URL.revokeObjectURL(testUrl);
      resolve(false);
    };

    testImg.src = testUrl;
  });
}

/**
 * ステッカーの画像タイプ情報を取得
 */
async function getStickerImageInfo(stickerData, img) {
  const borderMode =
    stickerData.borderMode !== undefined
      ? stickerData.borderMode
      : STICKER_DEFAULTS.BORDER_MODE;

  const originalBlob = stickerData.originalBlob || stickerData.blob;
  let originalType =
    stickerData.originalType || originalBlob.type || "image/png";
  let transparency = stickerData.hasTransparency;

  if (transparency === null || transparency === undefined) {
    transparency = await checkImageTransparency(originalBlob);
  }

  return { borderMode, originalType, transparency };
}

/**
 * リロード時の画像処理（パディング、縁取り）
 */
async function processImageForReload(
  stickerData,
  img,
  borderMode,
  originalType,
  transparency,
) {
  const originalBlob = stickerData.originalBlob || stickerData.blob;
  const originalBlobUrl = URL.createObjectURL(originalBlob);

  const maxBorderWidth = calculateBorderWidth(img.width, img.height, 2);
  const borderWidth = calculateBorderWidth(img.width, img.height, borderMode);

  const paddedBlob = await addPaddingToImage(originalBlob, maxBorderWidth);
  const blobUrl = URL.createObjectURL(paddedBlob);

  let blobWithBorderUrl = null;

  if (borderMode === 0) {
    blobWithBorderUrl = null;
  } else if (borderMode === 1) {
    const { blob: borderResult } = await applyOutlineFilter(
      originalBlob,
      1,
      originalType,
      transparency,
    );
    const remainingPadding = maxBorderWidth - borderWidth;
    const paddedBorderBlob = await addPaddingToImage(
      borderResult,
      remainingPadding,
    );
    blobWithBorderUrl = URL.createObjectURL(paddedBorderBlob);
  } else {
    const { blob: borderResult } = await applyOutlineFilter(
      originalBlob,
      2,
      originalType,
      transparency,
    );
    blobWithBorderUrl = URL.createObjectURL(borderResult);
  }

  return {
    blobUrl,
    blobWithBorderUrl,
    originalBlobUrl,
    borderWidth,
    originalBlob,
  };
}

/**
 * 座標とサイズを検証・修正
 */
function validateAndFixPosition(id, x, yPercent, width) {
  let needsFixing = false;

  if (!isFinite(x) || Math.abs(x) > 10000) {
    console.warn(`ステッカー${id}のx座標が異常: ${x} → 0に修正`);
    x = 0;
    needsFixing = true;
  }

  if (!isFinite(yPercent) || Math.abs(yPercent) > 200) {
    console.warn(`ステッカー${id}のyPercent座標が異常: ${yPercent} → 50に修正`);
    yPercent = 50;
    needsFixing = true;
  }

  if (!isFinite(width) || width < 10 || width > 5000) {
    console.warn(`ステッカー${id}のwidthが異常: ${width} → デフォルトに修正`);
    width = STICKER_DEFAULTS.WIDTH;
    needsFixing = true;
  }

  return { x, yPercent, width, needsFixing };
}

/**
 * 旧形式の座標を新形式に変換
 */
function convertLegacyPosition(stickerData) {
  const screenWidth = window.innerWidth;
  let x, yPercent, width;

  if (
    stickerData.xPercent !== undefined &&
    stickerData.yPercent !== undefined
  ) {
    const absoluteX = (stickerData.xPercent / 100) * screenWidth;
    const centerX = screenWidth / 2;
    x = absoluteX - centerX;
    yPercent = stickerData.yPercent;

    if (stickerData.widthPercent !== undefined) {
      width = (stickerData.widthPercent / 100) * screenWidth;
    } else if (stickerData.width !== undefined) {
      width = stickerData.width;
    } else {
      width = STICKER_DEFAULTS.WIDTH;
    }
  } else {
    x = 0;
    yPercent = 50;
    width = STICKER_DEFAULTS.WIDTH;
  }

  return { x, yPercent, width };
}

/**
 * ステッカーの座標とサイズを変換
 */
async function convertStickerPosition(stickerData, needsConversion) {
  let x, yPercent, width;

  if (
    stickerData.x !== undefined &&
    stickerData.yPercent !== undefined &&
    stickerData.width !== undefined
  ) {
    ({ x, yPercent, width } = stickerData);

    const fixed = validateAndFixPosition(stickerData.id, x, yPercent, width);
    x = fixed.x;
    yPercent = fixed.yPercent;
    width = fixed.width;

    if (fixed.needsFixing) {
      await updateStickerInDB(stickerData.id, { x, yPercent, width });
    }
  } else if (needsConversion) {
    ({ x, yPercent, width } = convertLegacyPosition(stickerData));
    await updateStickerInDB(stickerData.id, { x, yPercent, width });
  } else {
    x = 0;
    yPercent = 50;
    width = STICKER_DEFAULTS.WIDTH;
  }

  return { x, yPercent, width };
}

/**
 * 処理済みステッカーをDOMに追加
 */
function addProcessedStickerToDOM(
  stickerData,
  imageUrls,
  position,
  borderMode,
) {
  const hasBorder =
    stickerData.hasBorder !== undefined
      ? stickerData.hasBorder
      : STICKER_DEFAULTS.HAS_BORDER;
  const bgRemovalProcessed = stickerData.bgRemovalProcessed || false;

  let url;
  if (borderMode === 0 || !hasBorder) {
    url = imageUrls.blobUrl;
  } else {
    url = imageUrls.blobWithBorderUrl;
  }

  addStickerToDOM(
    url,
    imageUrls.blobUrl,
    imageUrls.blobWithBorderUrl,
    position.x,
    position.yPercent,
    position.width,
    stickerData.rotation,
    stickerData.id,
    stickerData.zIndex,
    stickerData.isPinned || false,
    hasBorder,
    imageUrls.borderWidth,
    borderMode,
    imageUrls.originalBlobUrl,
    bgRemovalProcessed,
    imageUrls.originalBlob,
    stickerData.originalType || null,
    stickerData.hasTransparency !== undefined
      ? stickerData.hasTransparency
      : null,
  );
}

/**
 * 個別のステッカーデータを処理してDOMに追加
 */
async function processStickerForReload(stickerData, needsConversion) {
  const img = await loadImageFromBlob(stickerData.blob);
  const { borderMode, originalType, transparency } = await getStickerImageInfo(
    stickerData,
    img,
  );
  const imageUrls = await processImageForReload(
    stickerData,
    img,
    borderMode,
    originalType,
    transparency,
  );
  const position = await convertStickerPosition(stickerData, needsConversion);
  addProcessedStickerToDOM(stickerData, imageUrls, position, borderMode);
}

/**
 * IndexedDBからシールを読み込み
 */
export async function loadStickersFromDB() {
  const stickers = await loadStickerDataFromDB();
  const needsConversion = !localStorage.getItem("hybrid_coordinate_migrated");

  for (const stickerData of stickers) {
    await processStickerForReload(stickerData, needsConversion);
  }

  if (needsConversion && stickers.length > 0) {
    localStorage.setItem("hybrid_coordinate_migrated", "true");
    console.log("座標変換が完了しました");
  }
}
