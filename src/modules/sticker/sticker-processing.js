/**
 * sticker-processing.js
 * 画像のリサイズ、最適化、透過検出などの画像処理機能を提供
 */

import { IMAGE_PROCESSING_CONFIG } from "../constants.js";
import { blobURLManager } from "../blob-url-manager.js";
import { convertToWebP, supportsWebP } from "../image-converter.js";
import { logger } from "../../utils/logger.js";

// WebP対応状況（アプリ起動時にチェック）
let webpSupported = true;

/**
 * WebP対応状況を初期化
 * アプリ起動時に呼び出す
 */
export async function initWebPSupport() {
  webpSupported = await supportsWebP();
  logger.log(
    `WebP対応: ${webpSupported ? "サポートされています" : "サポートされていません（フォールバック）"}`,
  );
}

/**
 * 画像に透過があるかどうかを検出
 * @param {HTMLImageElement} img - チェックする画像
 * @returns {boolean} 透過がある場合はtrue
 */
export function hasTransparency(img) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(img.width, 100);
  canvas.height = Math.min(img.height, 100);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // 画像の周囲をサンプリングチェック
    for (let i = 0; i < canvas.width; i++) {
      const topIndex = i * 4 + 3;
      const bottomIndex = (canvas.height - 1) * canvas.width * 4 + i * 4 + 3;
      if (data[topIndex] < 255 || data[bottomIndex] < 255) {
        return true;
      }
    }

    for (let i = 0; i < canvas.height; i++) {
      const leftIndex = i * canvas.width * 4 + 3;
      const rightIndex = i * canvas.width * 4 + (canvas.width - 1) * 4 + 3;
      if (data[leftIndex] < 255 || data[rightIndex] < 255) {
        return true;
      }
    }

    // 内部のサンプリングチェック（中央付近）
    const centerX = Math.floor(canvas.width / 2);
    const centerY = Math.floor(canvas.height / 2);
    const radius = Math.min(20, Math.floor(canvas.width / 4));

    for (let y = centerY - radius; y < centerY + radius; y++) {
      for (let x = centerX - radius; x < centerX + radius; x++) {
        if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
          const index = (y * canvas.width + x) * 4 + 3;
          if (data[index] < 255) {
            return true;
          }
        }
      }
    }

    return false;
  } catch (e) {
    logger.warn("透過チェック中にエラー:", e);
    return false;
  }
}

/**
 * 画像のタイプと透過情報を取得・判定する統一関数
 * @param {Object} options - オプション
 * @param {Blob|null} options.blob - 画像Blob
 * @param {Object|null} options.sticker - ステッカーオブジェクト（保存情報を取得）
 * @param {string|null} options.storedType - 保存された画像タイプ
 * @param {boolean|null} options.storedTransparency - 保存された透過情報
 * @param {HTMLImageElement|null} options.img - 読み込み済みのimg要素（判定用）
 * @returns {Promise<{type: string, hasTransparency: boolean}>}
 */
export async function getImageTypeInfo({
  blob = null,
  sticker = null,
  storedType = null,
  storedTransparency = null,
  img = null,
} = {}) {
  const type = storedType || sticker?.originalType || blob?.type || "image/png";

  let transparency = storedTransparency;

  if (transparency === null || transparency === undefined) {
    transparency = sticker?.hasTransparency;
  }

  if (transparency === null || transparency === undefined) {
    if (img) {
      transparency = hasTransparency(img);
    } else if (blob) {
      const blobUrl = blobURLManager.createURL(blob);
      const newImg = new Image();
      transparency = await new Promise((resolve) => {
        newImg.onload = () => {
          const result = hasTransparency(newImg);
          blobURLManager.revokeURL(blobUrl);
          resolve(result);
        };
        newImg.onerror = () => {
          blobURLManager.revokeURL(blobUrl);
          resolve(false);
        };
        newImg.src = blobUrl;
      });
    } else {
      transparency = false;
    }
  }

  return { type, hasTransparency: transparency };
}

/**
 * Blobを適切なサイズにリサイズ（Safari最適化）
 * @param {Blob} blob - 元の画像blob
 * @param {number} maxSize - 長辺の最大サイズ（px）
 * @returns {Promise<{blob: Blob, originalType: string, hasTransparency: boolean}>}
 */
export async function resizeImageBlob(blob, maxSize = 1000) {
  const originalType = blob.type || "image/png";

  return new Promise((resolve) => {
    const img = new Image();
    const blobUrl = blobURLManager.createURL(blob);
    img.onload = async () => {
      const transparency = hasTransparency(img);

      let width = img.width;
      let height = img.height;

      if (width <= maxSize && height <= maxSize) {
        blobURLManager.revokeURL(blobUrl);
        if (webpSupported && blob.type !== "image/webp") {
          const webpBlob = await convertToWebP(blob, 0.9);
          resolve({
            blob: webpBlob,
            originalType,
            hasTransparency: transparency,
          });
        } else {
          resolve({ blob, originalType, hasTransparency: transparency });
        }
        return;
      }

      if (width > height) {
        height = (height / width) * maxSize;
        width = maxSize;
      } else {
        width = (width / height) * maxSize;
        height = maxSize;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      ctx.drawImage(img, 0, 0, width, height);

      const mimeType = webpSupported ? "image/webp" : blob.type || "image/png";
      const quality = 0.9;

      canvas.toBlob(
        (resizedBlob) => {
          blobURLManager.revokeURL(blobUrl);
          if (resizedBlob) {
            logger.log(
              `画像リサイズ: ${img.width}x${img.height} → ${width}x${height} (${mimeType}, ${Math.round(resizedBlob.size / 1024)}KB)`,
            );
            resolve({
              blob: resizedBlob,
              originalType,
              hasTransparency: transparency,
            });
          } else {
            logger.warn("リサイズ失敗、元の画像を使用");
            resolve({ blob, originalType, hasTransparency: transparency });
          }
        },
        mimeType,
        quality,
      );
    };

    img.onerror = () => {
      blobURLManager.revokeURL(blobUrl);
      logger.warn("画像読み込み失敗、元の画像を使用");
      resolve({ blob, originalType, hasTransparency: false });
    };

    img.src = blobUrl;
  });
}

/**
 * 画像Blobの準備とリサイズ、検証を実行
 * @param {Blob} blob - 元の画像Blob
 * @param {number} maxSize - リサイズ後の最大サイズ
 * @returns {Promise<{blob: Blob, originalType: string, hasTransparency: boolean}>}
 */
export async function prepareImageBlob(
  blob,
  maxSize = IMAGE_PROCESSING_CONFIG.MAX_SIZE,
) {
  const {
    blob: resizedBlob,
    originalType,
    hasTransparency,
  } = await resizeImageBlob(blob, maxSize);

  if (!resizedBlob || resizedBlob.size === 0) {
    throw new Error("画像のリサイズに失敗しました");
  }

  logger.log(
    `画像準備完了: ${Math.round(resizedBlob.size / 1024)}KB, タイプ=${originalType}, 透過=${hasTransparency}`,
  );

  return { blob: resizedBlob, originalType, hasTransparency };
}

/**
 * 画像Blobのサイズを取得
 * @param {Blob} blob - 画像Blob
 * @returns {Promise<{width: number, height: number}>}
 */
export async function getImageDimensions(blob) {
  return new Promise((resolve) => {
    const img = new Image();
    const blobUrl = blobURLManager.createURL(blob);
    img.onload = () => {
      blobURLManager.revokeURL(blobUrl);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      blobURLManager.revokeURL(blobUrl);
      resolve({ width: 0, height: 0, error: true });
    };
    img.src = blobUrl;
  });
}

/**
 * URLからBlobを取得（ヘルパー関数）
 * @param {string} url - 画像URL
 * @returns {Promise<Blob|null>} Blob
 */
export async function getBlobFromURL(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return blob;
  } catch (error) {
    logger.warn("URLからBlobの取得に失敗:", error);
    return null;
  }
}
