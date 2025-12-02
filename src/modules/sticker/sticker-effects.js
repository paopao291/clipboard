/**
 * sticker-effects.js
 * 背景除去やその他のエフェクト処理を提供
 */

import { updateStickerInDB } from "../db.js";
import { showToast, updateInfoButtonVisibility } from "../ui.js";
import { blobURLManager } from "../blob-url-manager.js";
import { resizeImageBlob, getImageTypeInfo, getImageDimensions } from "./sticker-processing.js";
import { processBorderAndPadding, updateStickerImageUrl } from "./sticker-rendering.js";
import { releaseOldUrls } from "./sticker-core.js";

/**
 * 背景除去処理（@imgly/background-removalを使用）
 * @param {Blob} blob - 元の画像Blob
 * @returns {Promise<Blob>} 背景除去済みのBlob
 */
async function removeBgFromBlob(blob) {
  try {
    if (!window.removeBackground) {
      throw new Error("背景除去ライブラリが読み込まれていません");
    }

    const { blob: optimizedBlob } = await resizeImageBlob(blob, 800);

    const imageUrl = blobURLManager.createURL(optimizedBlob);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageUrl;
    });

    const resultBlob = await window.removeBackground(imageUrl);

    blobURLManager.revokeURL(imageUrl);

    const solidifiedBlob = await solidifyAlphaChannel(resultBlob);

    const isMostlyTransparent = await checkTransparencyRatio(
      solidifiedBlob,
      0.9,
    );
    if (isMostlyTransparent) {
      throw new Error("対象物が見つかりませんでした");
    }

    const trimResult = await trimTransparentEdges(solidifiedBlob);

    if (
      trimResult &&
      typeof trimResult === "object" &&
      trimResult.hasOwnProperty("blob")
    ) {
      if (!trimResult.isValid) {
        throw new Error("対象物が見つかりませんでした");
      }
      return trimResult.blob;
    }

    return solidifiedBlob;
  } catch (error) {
    throw error;
  }
}

/**
 * アルファチャンネルに閾値処理を適用してエッジをはっきりさせる
 * @param {Blob} blob - 背景除去済みの画像Blob
 * @param {number} threshold - 閾値（0-255、デフォルト128）
 * @returns {Promise<Blob>} 処理後のBlob
 */
async function solidifyAlphaChannel(blob, threshold = 128) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blobUrl = blobURLManager.createURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 3; i < data.length; i += 4) {
        const alpha = data[i];
        data[i] = alpha >= threshold ? 255 : 0;
      }

      ctx.putImageData(imageData, 0, 0);

      canvas.toBlob((resultBlob) => {
        blobURLManager.revokeURL(blobUrl);
        if (resultBlob) {
          resolve(resultBlob);
        } else {
          reject(new Error("Blob変換に失敗しました"));
        }
      }, "image/png");
    };
    img.onerror = () => {
      blobURLManager.revokeURL(blobUrl);
      reject(new Error("画像読み込み失敗"));
    };
    img.src = blobUrl;
  });
}

/**
 * 透明部分をトリミングして実際のコンテンツサイズにする
 * @param {Blob} blob - 処理する画像Blob
 * @returns {Promise<{blob: Blob, isValid: boolean}>}
 */
async function trimTransparentEdges(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blobUrl = blobURLManager.createURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const width = imageData.width;
      const height = imageData.height;

      let opaquePixels = 0;
      const totalPixels = width * height;

      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const alphaIndex = (y * width + x) * 4 + 3;
          if (data[alphaIndex] > 0) {
            opaquePixels++;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      const opaqueRatio = opaquePixels / totalPixels;
      console.log(
        `背景除去結果: 不透明ピクセル ${opaquePixels}/${totalPixels} (${(opaqueRatio * 100).toFixed(2)}%)`,
      );

      if (opaqueRatio < 0.01) {
        blobURLManager.revokeURL(blobUrl);
        console.warn(
          "背景除去後、対象物がほとんど見つかりませんでした。元の画像を使用します。",
        );
        resolve({ blob: blob, isValid: false });
        return;
      }

      const margin = 10;
      minX = Math.max(0, minX - margin);
      minY = Math.max(0, minY - margin);
      maxX = Math.min(width - 1, maxX + margin);
      maxY = Math.min(height - 1, maxY + margin);

      if (minX >= maxX || minY >= maxY) {
        blobURLManager.revokeURL(blobUrl);
        console.warn("トリミング範囲が無効です。元の画像を返します。");
        resolve({ blob: blob, isValid: false });
        return;
      }

      const trimWidth = maxX - minX + 1;
      const trimHeight = maxY - minY + 1;

      const trimmedCanvas = document.createElement("canvas");
      trimmedCanvas.width = trimWidth;
      trimmedCanvas.height = trimHeight;
      const trimmedCtx = trimmedCanvas.getContext("2d");

      trimmedCtx.drawImage(
        canvas,
        minX,
        minY,
        trimWidth,
        trimHeight,
        0,
        0,
        trimWidth,
        trimHeight,
      );

      trimmedCanvas.toBlob((resultBlob) => {
        blobURLManager.revokeURL(blobUrl);
        if (resultBlob) {
          resolve({ blob: resultBlob, isValid: true });
        } else {
          reject(new Error("トリミング後のBlob変換に失敗しました"));
        }
      }, "image/png");
    };
    img.onerror = () => {
      blobURLManager.revokeURL(blobUrl);
      reject(new Error("画像読み込み失敗"));
    };
    img.src = blobUrl;
  });
}

/**
 * 画像の透明度を分析してほとんどが透明かどうかをチェック
 * @param {Blob} blob - チェックする画像のBlob
 * @param {number} threshold - 透明率の閾値（0.0〜1.0）
 * @returns {Promise<boolean>}
 */
async function checkTransparencyRatio(blob, threshold = 0.9) {
  if (!blob || !(blob instanceof Blob)) {
    console.warn("無効なBlobが渡されました");
    return false;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const blobUrl = blobURLManager.createURL(blob);

    img.onload = () => {
      blobURLManager.revokeURL(blobUrl);

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      ctx.drawImage(img, 0, 0);

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const totalPixels = canvas.width * canvas.height;
        let transparentPixels = 0;

        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 10) {
            transparentPixels++;
          }
        }

        const transparentRatio = transparentPixels / totalPixels;
        console.log(
          `透明ピクセル: ${transparentPixels}/${totalPixels} (${(transparentRatio * 100).toFixed(2)}%)`,
        );

        resolve(transparentRatio >= threshold);
      } catch (e) {
        console.warn("透明度チェックエラー:", e);
        resolve(false);
      }
    };

    img.onerror = () => {
      blobURLManager.revokeURL(blobUrl);
      console.warn("画像読み込みエラー");
      resolve(false);
    };

    img.src = blobUrl;
  });
}

/**
 * ステッカーの背景を除去する（一方通行の処理）
 * @param {Object} sticker - ステッカーオブジェクト
 */
export async function toggleStickerBgRemoval(sticker) {
  try {
    if (sticker.bgRemovalProcessed) {
      console.log("既に背景除去済みです");
      return;
    }

    if (!sticker.blobUrl) {
      throw new Error("ステッカーのblobUrlが存在しません");
    }
    sticker.element.classList.add("processing");

    showToast("背景除去を開始しています...");

    let originalBlob;
    if (sticker.originalBlob) {
      originalBlob = sticker.originalBlob;
    } else {
      originalBlob = await fetchBlobFromUrl(sticker.blobUrl);
    }

    showToast("背景除去を処理中...");
    const removedBgBlob = await removeBgFromBlob(originalBlob);

    releaseOldUrls(sticker);
    updateStickerBaseImage(sticker, removedBgBlob);

    showToast("縁取りを適用中...");
    await applyBorderAndPadding(sticker);

    finalizeBgRemoval(sticker, removedBgBlob);
  } catch (error) {
    console.error("背景除去エラー:", error);
    sticker.element.classList.remove("processing");
    showToast(error.message || "背景除去に失敗しました");
  }
}

/**
 * URLからBlobを取得する
 * @param {string} url - 取得対象URL
 * @returns {Promise<Blob>}
 */
async function fetchBlobFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`画像の取得に失敗しました: ${response.status}`);
  }
  return await response.blob();
}

/**
 * ステッカーの基本画像を更新する
 * @param {Object} sticker - ステッカーオブジェクト
 * @param {Blob} newBlob - 新しい画像Blob
 */
function updateStickerBaseImage(sticker, newBlob) {
  sticker.originalBlob = newBlob;
  sticker.blob = newBlob;

  sticker.originalType = "image/png";
  sticker.hasTransparency = true;

  releaseOldUrls(sticker);

  const newBlobUrl = blobURLManager.createURL(newBlob, sticker.img);
  sticker.originalBlobUrl = newBlobUrl;
  sticker.blobUrl = newBlobUrl;
}

/**
 * 縁取りとパディングを適用する
 * @param {Object} sticker - ステッカーオブジェクト
 */
async function applyBorderAndPadding(sticker) {
  const hasBorder = sticker.hasBorder;
  const borderMode =
    sticker.borderMode !== undefined
      ? sticker.borderMode
      : 2;

  const imageDimensions = await getImageDimensions(sticker.originalBlob);

  const { type: originalType, hasTransparency: transparency } =
    await getImageTypeInfo({
      blob: sticker.originalBlob,
      sticker,
    });

  console.log(
    `applyBorderAndPadding: originalType=${originalType}, transparency=${transparency}`,
  );

  const result = await processBorderAndPadding(
    sticker.originalBlob,
    borderMode,
    imageDimensions.width,
    imageDimensions.height,
    originalType,
    transparency,
  );

  const oldBlobUrl = sticker.blobUrl;
  const oldBlobWithBorderUrl = sticker.blobWithBorderUrl;

  if (borderMode === 0 || !hasBorder) {
    sticker.blob = result.resultBlob;
    sticker.blobUrl = blobURLManager.createURL(result.resultBlob, sticker.img);
    sticker.blobWithBorder = null;
    sticker.blobWithBorderUrl = null;
  } else {
    sticker.blobWithBorder = result.borderBlob || result.resultBlob;
    sticker.blobWithBorderUrl = blobURLManager.createURL(
      sticker.blobWithBorder,
      sticker.img,
    );
    sticker.borderWidth = result.borderWidth;
  }

  if (sticker.img) {
    const newUrl = hasBorder ? sticker.blobWithBorderUrl : sticker.blobUrl;
    if (newUrl) {
      await blobURLManager.updateImageUrl(sticker.img, newUrl);

      setTimeout(() => {
        const currentSrc = sticker.img.src;
        if (oldBlobUrl && oldBlobUrl !== newUrl && oldBlobUrl !== currentSrc) {
          blobURLManager.revokeURL(oldBlobUrl, sticker.img);
        }
        if (
          oldBlobWithBorderUrl &&
          oldBlobWithBorderUrl !== newUrl &&
          oldBlobWithBorderUrl !== currentSrc
        ) {
          blobURLManager.revokeURL(oldBlobWithBorderUrl, sticker.img);
        }
      }, 100);
    }
  }
}

/**
 * 背景除去処理の完了処理
 * @param {Object} sticker - ステッカーオブジェクト
 * @param {Blob} removedBgBlob - 背景除去後の画像Blob
 */
async function finalizeBgRemoval(sticker, removedBgBlob) {
  sticker.bgRemovalProcessed = true;
  sticker.element.classList.remove("processing");

  updateStickerImageUrl(sticker);

  await updateStickerInDB(sticker.id, {
    originalBlob: removedBgBlob,
    blob: sticker.blob,
    blobWithBorder: sticker.blobWithBorder,
    bgRemovalProcessed: true,
    originalType: sticker.originalType,
    hasTransparency: sticker.hasTransparency,
  });

  updateInfoButtonVisibility();
  showToast("背景除去を適用しました");
}
