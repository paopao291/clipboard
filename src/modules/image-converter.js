/**
 * 画像変換モジュール
 * WebP変換、フォーマット変換などの画像変換処理
 */

import { logger } from "../utils/logger.js";

/**
 * 画像をWebPに変換
 * @param {Blob} blob - 元の画像Blob
 * @param {number} quality - 品質（0.0-1.0、デフォルト0.9）
 * @returns {Promise<Blob>} WebP Blob
 */
export async function convertToWebP(blob, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Canvasに描画
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");

      // 透過を保持するための設定
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      // WebPに変換
      canvas.toBlob(
        (webpBlob) => {
          if (webpBlob) {
            logger.log(
              `WebP変換: ${Math.round(blob.size / 1024)}KB → ${Math.round(webpBlob.size / 1024)}KB (${Math.round((1 - webpBlob.size / blob.size) * 100)}%削減)`,
            );
            resolve(webpBlob);
          } else {
            // WebP変換失敗の場合は元のBlobを返す
            logger.warn("WebP変換失敗: 元の画像を使用します");
            resolve(blob);
          }
        },
        "image/webp",
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      logger.warn("画像読み込みエラー: 元の画像を使用します");
      // エラー時は元のBlobを返す（フォールバック）
      resolve(blob);
    };

    img.src = url;
  });
}

/**
 * WebP対応チェック
 * @returns {Promise<boolean>}
 */
export async function supportsWebP() {
  // 簡易的なWebP対応チェック（1x1ピクセルの透過WebP画像）
  return new Promise((resolve) => {
    const webP =
      "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=";
    const img = new Image();

    img.onload = () => {
      // 画像が正しく読み込まれ、サイズが正しいかチェック
      resolve(img.width === 1 && img.height === 1);
    };

    img.onerror = () => {
      resolve(false);
    };

    img.src = webP;
  });
}

/**
 * 画像のMIMEタイプを取得
 * @param {Blob} blob - 画像Blob
 * @returns {string} MIMEタイプ（例: 'image/png', 'image/webp'）
 */
export function getImageMimeType(blob) {
  return blob.type || "image/png";
}

/**
 * BlobがWebP形式かどうかを判定
 * @param {Blob} blob - 画像Blob
 * @returns {boolean}
 */
export function isWebP(blob) {
  return blob.type === "image/webp";
}

/**
 * 画像を指定フォーマットに変換（汎用関数）
 * @param {Blob} blob - 元の画像Blob
 * @param {string} mimeType - 変換後のMIMEタイプ（例: 'image/webp', 'image/png'）
 * @param {number} quality - 品質（0.0-1.0）
 * @returns {Promise<Blob>}
 */
export async function convertImageFormat(blob, mimeType, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (convertedBlob) => {
          if (convertedBlob) {
            resolve(convertedBlob);
          } else {
            logger.warn(`${mimeType}変換失敗: 元の画像を使用します`);
            resolve(blob);
          }
        },
        mimeType,
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      logger.warn("画像読み込みエラー: 元の画像を使用します");
      resolve(blob);
    };

    img.src = url;
  });
}
