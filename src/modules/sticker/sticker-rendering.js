/**
 * sticker-rendering.js
 * 縁取り、パディング、ボーダーなどのレンダリング処理を提供
 */

import { BORDER_WIDTHS, STICKER_DEFAULTS } from "../constants.js";
import { blobURLManager } from "../blob-url-manager.js";
import { updateStickerInDB } from "../db.js";
import { logger } from "../../utils/logger.js";
import {
  showToast,
  updateInfoButtonVisibility,
  updateHelpStickerState,
  updateHelpStickerBorder,
} from "../ui.js";
import {
  getImageTypeInfo,
  getImageDimensions,
  getBlobFromURL,
} from "./sticker-processing.js";

/**
 * 縁取りの設定
 */
const OUTLINE_CONFIG = {
  RATIO: 0.05,
  MIN_WIDTH: 8,
  COLOR: "#ffffff",
};

/**
 * 画像サイズから縁取りの太さを計算
 * @param {number} width - 画像の幅
 * @param {number} height - 画像の高さ
 * @param {number} borderMode - 縁取りモード（0:なし, 1:2.5%, 2:5%）
 * @returns {number} 縁取りの太さ（px）
 */
export function calculateBorderWidth(width, height, borderMode = 2) {
  if (borderMode === 0) {
    return 0;
  }

  const imageSize = Math.max(width, height);

  if (borderMode > 0 && borderMode < BORDER_WIDTHS.length) {
    const ratio = BORDER_WIDTHS[borderMode];
    return Math.max(OUTLINE_CONFIG.MIN_WIDTH, Math.round(imageSize * ratio));
  }

  return Math.max(
    OUTLINE_CONFIG.MIN_WIDTH,
    Math.round(imageSize * OUTLINE_CONFIG.RATIO),
  );
}

/**
 * 画像の種類と透過有無に応じたオフセットを生成
 * @param {number} borderWidth - 縁取りの太さ
 * @param {string} imageType - 画像の種類
 * @param {boolean} hasTransparency - 画像に透過があるかどうか
 * @returns {Array<{x: number, y: number}>} オフセット配列
 */
function generateOutlineOffsets(
  borderWidth,
  imageType = "",
  hasTransparency = false,
) {
  if (
    imageType === "image/jpeg" ||
    (imageType === "image/png" && !hasTransparency)
  ) {
    return [
      { x: -borderWidth, y: 0 },
      { x: borderWidth, y: 0 },
      { x: 0, y: -borderWidth },
      { x: 0, y: borderWidth },
      { x: -borderWidth, y: -borderWidth },
      { x: borderWidth, y: -borderWidth },
      { x: -borderWidth, y: borderWidth },
      { x: borderWidth, y: borderWidth },
    ];
  } else {
    const offsets = [];
    for (let angle = 0; angle < 360; angle += 10) {
      const angleRad = angle * (Math.PI / 180);
      const x = Math.cos(angleRad) * borderWidth;
      const y = Math.sin(angleRad) * borderWidth;
      offsets.push({
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
      });
    }
    return offsets;
  }
}

/**
 * 白い縁取り用の画像を作成
 * @param {HTMLImageElement|HTMLCanvasElement} source - 元の画像またはcanvas
 * @returns {HTMLCanvasElement} 白い縁取り用のCanvas
 */
function createWhiteMaskedImage(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = OUTLINE_CONFIG.COLOR;
  ctx.fillRect(0, 0, source.width, source.height);

  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(source, 0, 0);

  return canvas;
}

/**
 * 中身canvasに透明paddingまたは縁取りを追加
 * @param {HTMLCanvasElement} contentCanvas - 中身部分のcanvas
 * @param {number} borderWidth - 縁取り幅
 * @param {boolean} withOutline - 縁取りを追加するか
 * @param {number} finalWidth - 最終的な幅
 * @param {number} finalHeight - 最終的な高さ
 * @param {string} imageType - 画像の種類
 * @param {boolean} hasTransparency - 画像に透過があるかどうか
 * @returns {HTMLCanvasElement} 完成したcanvas
 */
function addBorderOrPadding(
  contentCanvas,
  borderWidth,
  withOutline,
  finalWidth,
  finalHeight,
  imageType = "",
  hasTransparency = false,
) {
  const canvas = document.createElement("canvas");
  canvas.width = finalWidth;
  canvas.height = finalHeight;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (withOutline) {
    ctx.globalCompositeOperation = "source-over";

    const whiteMaskedImage = createWhiteMaskedImage(contentCanvas);
    const offsets = generateOutlineOffsets(
      borderWidth,
      imageType,
      hasTransparency,
    );
    for (const offset of offsets) {
      ctx.drawImage(
        whiteMaskedImage,
        offset.x + borderWidth,
        offset.y + borderWidth,
      );
    }
  }

  ctx.drawImage(contentCanvas, borderWidth, borderWidth);

  return canvas;
}

/**
 * canvasをblobに変換
 * @param {HTMLCanvasElement} canvas - 変換するcanvas
 * @param {Blob} fallbackBlob - エラー時に返すblob
 * @param {string} errorMessage - エラーメッセージ
 * @returns {Promise<Blob>} 変換されたblob
 */
function canvasToBlob(canvas, fallbackBlob, errorMessage) {
  return new Promise((resolve) => {
    canvas.toBlob((resultBlob) => {
      if (resultBlob) {
        resolve(resultBlob);
      } else {
        logger.warn(errorMessage);
        resolve(fallbackBlob);
      }
    }, "image/png");
  });
}

/**
 * blobから画像を読み込んで処理を実行
 * @param {Blob} blob - 元の画像blob
 * @param {Function} processImage - 画像処理関数
 * @param {*} fallbackResult - エラー時に返す値
 * @returns {Promise<*>} 処理結果
 */
function loadImageAndProcess(blob, processImage, fallbackResult) {
  return new Promise((resolve) => {
    const img = new Image();
    const blobUrl = blobURLManager.createURL(blob);

    img.onload = () => {
      try {
        const result = processImage(img);
        blobURLManager.revokeURL(blobUrl);
        resolve(result);
      } catch (error) {
        logger.warn("画像処理エラー:", error);
        blobURLManager.revokeURL(blobUrl);
        resolve(fallbackResult);
      }
    };

    img.onerror = () => {
      logger.warn("画像読み込み失敗");
      blobURLManager.revokeURL(blobUrl);
      resolve(fallbackResult);
    };

    img.src = blobUrl;
  });
}

/**
 * 画像を縮小して透明なpaddingを追加
 * @param {Blob} blob - 元の画像blob
 * @param {number} borderWidth - 追加するpadding幅
 * @returns {Promise<Blob>} padding付き画像blob
 */
export async function addPaddingToImage(blob, borderWidth) {
  logger.log("パディング追加: borderWidth =", borderWidth);
  return loadImageAndProcess(
    blob,
    async (img) => {
      if (borderWidth <= 0) {
        logger.log("パディング幅が0px以下です。最低8pxを使用");
        borderWidth = 8;
      }

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");

      ctx.drawImage(img, 0, 0, img.width, img.height);

      const finalWidth = img.width + borderWidth * 2;
      const finalHeight = img.height + borderWidth * 2;

      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = finalWidth;
      finalCanvas.height = finalHeight;
      const finalCtx = finalCanvas.getContext("2d");

      finalCtx.clearRect(0, 0, finalWidth, finalHeight);
      finalCtx.drawImage(canvas, borderWidth, borderWidth);

      logger.log(
        `パディング追加: ${img.width}x${img.height} → ${finalCanvas.width}x${finalCanvas.height}`,
      );
      return await canvasToBlob(
        finalCanvas,
        blob,
        "padding追加失敗、元の画像を使用",
      );
    },
    blob,
  );
}

/**
 * 画像タイプと透過有無に応じた縁取り画像を生成
 * @param {Blob} blob - 元の画像blob
 * @param {number} borderMode - 縁取りモード
 * @param {string} originalType - 元の画像タイプ
 * @param {boolean} transparency - 透過の有無
 * @returns {Promise<{blob: Blob, borderWidth: number, borderMode: number}>}
 */
export async function applyOutlineFilter(
  blob,
  borderMode = 2,
  originalType = null,
  transparency = null,
) {
  return loadImageAndProcess(
    blob,
    async (img) => {
      if (borderMode === 0) {
        return { blob, borderWidth: 0, borderMode: 0 };
      }

      const borderWidth = calculateBorderWidth(
        img.width,
        img.height,
        borderMode,
      );

      if (borderWidth <= 0) {
        logger.warn("縁取り幅が0以下です。縁取りを適用しません");
        return { blob, borderWidth: 0, borderMode };
      }

      const originalWidth = img.width;
      const originalHeight = img.height;

      const canvas = document.createElement("canvas");
      canvas.width = originalWidth;
      canvas.height = originalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const { type: imageType, hasTransparency: hasTransparencyFlag } =
        await getImageTypeInfo({
          blob,
          storedType: originalType,
          storedTransparency: transparency,
          img,
        });

      logger.log(
        `縁取り適用: モード${borderMode}, 幅${borderWidth}px, 画像サイズ${originalWidth}x${originalHeight}, タイプ=${imageType}, 透過=${hasTransparencyFlag}`,
      );

      const finalCanvas = addBorderOrPadding(
        canvas,
        borderWidth,
        true,
        originalWidth + borderWidth * 2,
        originalHeight + borderWidth * 2,
        imageType,
        hasTransparencyFlag,
      );

      const resultBlob = await canvasToBlob(
        finalCanvas,
        blob,
        "縁取り画像生成失敗、元の画像を使用",
      );
      return { blob: resultBlob, borderWidth, borderMode };
    },
    { blob: blob, borderWidth: 0, borderMode },
  );
}

/**
 * 縁取り設定を計算（幅とモード）
 * @param {string} originalType - 元の画像タイプ
 * @param {boolean} hasTransparency - 透過の有無
 * @param {number} borderMode - 縁取りモード
 * @param {number} imageWidth - 画像の幅
 * @param {number} imageHeight - 画像の高さ
 * @returns {{borderWidth: number, maxBorderWidth: number, borderMode: number}}
 */
export function calculateBorderSettings(
  originalType,
  hasTransparency,
  borderMode,
  imageWidth,
  imageHeight,
) {
  const actualBorderMode = borderMode ?? STICKER_DEFAULTS.BORDER_MODE;

  const maxBorderWidth = Math.max(
    OUTLINE_CONFIG.MIN_WIDTH,
    Math.round(Math.max(imageWidth, imageHeight) * BORDER_WIDTHS[2]),
  );

  let borderWidth = 0;
  if (actualBorderMode > 0) {
    borderWidth = Math.max(
      OUTLINE_CONFIG.MIN_WIDTH,
      Math.round(
        Math.max(imageWidth, imageHeight) * BORDER_WIDTHS[actualBorderMode],
      ),
    );
  }

  logger.log(
    `縁取り設定: モード=${actualBorderMode}, 幅=${borderWidth}px, 最大=${maxBorderWidth}px`,
  );

  return {
    borderWidth,
    maxBorderWidth,
    borderMode: actualBorderMode,
  };
}

/**
 * 指定されたモードに基づいて画像の縁取りとパディングを処理する共通関数
 * @param {Blob} originalBlob - 元画像のBlob
 * @param {number} borderMode - 縁取りモード
 * @param {number} width - 画像の幅
 * @param {number} height - 画像の高さ
 * @param {string} originalType - 元の画像タイプ
 * @param {boolean} hasTransparency - 透過の有無
 * @returns {Promise<{resultBlob: Blob, borderBlob: Blob, paddedBlob: Blob, borderWidth: number}>}
 */
export async function processBorderAndPadding(
  originalBlob,
  borderMode,
  width,
  height,
  originalType = null,
  hasTransparency = null,
) {
  const maxBorderWidth = calculateBorderWidth(width, height, 2);

  let paddingWidth;

  if (borderMode === 0) {
    paddingWidth = maxBorderWidth;
  } else if (borderMode === 1) {
    const borderWidth = calculateBorderWidth(width, height, 1);
    paddingWidth = Math.max(0, maxBorderWidth - borderWidth);
  } else {
    paddingWidth = maxBorderWidth;
  }

  if (borderMode === 0) {
    logger.log(`モード${borderMode}: 5%パディングを追加（${paddingWidth}px）`);

    const paddedBlob = await addPaddingToImage(originalBlob, paddingWidth);

    return {
      resultBlob: paddedBlob,
      borderBlob: null,
      paddedBlob: paddedBlob,
      borderWidth: 0,
    };
  } else if (borderMode === 1) {
    const { blob: borderBlob, borderWidth } = await applyOutlineFilter(
      originalBlob,
      1,
      originalType,
      hasTransparency,
    );

    logger.log(
      `モード${borderMode}: 縁取り${borderWidth}px + パディング${paddingWidth}px（合計${borderWidth + paddingWidth}px）`,
    );
    const paddedBorderBlob = await addPaddingToImage(borderBlob, paddingWidth);

    logger.log(`モード${borderMode}: 縁取りなし用に5%パディング追加`);
    const paddedBlob = await addPaddingToImage(originalBlob, maxBorderWidth);

    return {
      resultBlob: paddedBorderBlob,
      borderBlob: paddedBorderBlob,
      paddedBlob: paddedBlob,
      borderWidth: borderWidth,
    };
  } else {
    const { blob: borderBlob, borderWidth } = await applyOutlineFilter(
      originalBlob,
      2,
      originalType,
      hasTransparency,
    );

    logger.log(`モード${borderMode}: 縁取り${borderWidth}px（パディングなし）`);

    logger.log(`モード${borderMode}: 縁取りなし用に5%パディング追加`);
    const paddedBlob = await addPaddingToImage(originalBlob, maxBorderWidth);

    return {
      resultBlob: borderBlob,
      borderBlob: borderBlob,
      paddedBlob: paddedBlob,
      borderWidth: borderWidth,
    };
  }
}

/**
 * ステッカーの縁取りモードをトグル
 * @param {Object} sticker - シールオブジェクト
 */
export async function toggleStickerBorder(sticker) {
  const currentBorderMode =
    sticker.borderMode !== undefined
      ? sticker.borderMode
      : STICKER_DEFAULTS.BORDER_MODE;

  let nextBorderMode = (currentBorderMode + 1) % BORDER_WIDTHS.length;
  sticker.borderMode = nextBorderMode;
  sticker.hasBorder = nextBorderMode !== 0;

  logger.log(
    `縁取りモード変更: ${currentBorderMode} → ${nextBorderMode}, hasBorder: ${sticker.hasBorder}`,
  );

  for (let i = 0; i < BORDER_WIDTHS.length; i++) {
    sticker.element.classList.remove(`border-mode-${i}`);
  }

  sticker.element.classList.add(`border-mode-${nextBorderMode}`);

  if (sticker.img && sticker.blobUrl) {
    let originalBlob = null;

    if (sticker.originalBlob) {
      originalBlob = sticker.originalBlob;
      logger.log("縁取りモード変更: originalBlobを直接使用");
    } else {
      const originalBlobUrl = sticker.originalBlobUrl || sticker.blobUrl;
      logger.log(
        "縁取りモード変更: オリジナルBlobURLから取得:",
        originalBlobUrl,
      );

      try {
        originalBlob = await getBlobFromURL(originalBlobUrl);
        if (!originalBlob) {
          if (sticker.blob) {
            originalBlob = sticker.blob;
            logger.log("縁取りモード変更: URL取得失敗、sticker.blobを使用");
          }
        }
      } catch (err) {
        logger.warn(
          "縁取りモード変更: URLからの取得に失敗、sticker.blobを使用:",
          err,
        );
        if (sticker.blob) {
          originalBlob = sticker.blob;
        }
      }
    }

    if (originalBlob) {
      const imageDimensions = await getImageDimensions(originalBlob);
      logger.log("元画像の実際のサイズ:", imageDimensions);

      const { type: originalType, hasTransparency: transparency } =
        await getImageTypeInfo({
          blob: originalBlob,
          sticker,
        });

      logger.log(
        `縁取りモード変更: originalType=${originalType}, transparency=${transparency}`,
      );

      const result = await processBorderAndPadding(
        originalBlob,
        nextBorderMode,
        imageDimensions.width,
        imageDimensions.height,
        originalType,
        transparency,
      );

      const oldBlobUrl = sticker.blobUrl;
      const oldBlobWithBorderUrl = sticker.blobWithBorderUrl;
      const oldPaddedBlobUrl = sticker.paddedBlobUrl;

      const borderBlobUrl = blobURLManager.createURL(
        result.resultBlob,
        sticker.img,
      );
      const paddedBlobUrl = blobURLManager.createURL(
        result.paddedBlob,
        sticker.img,
      );

      sticker.borderWidth = result.borderWidth;
      sticker.blobWithBorderUrl = borderBlobUrl;
      sticker.paddedBlobUrl = paddedBlobUrl;
      sticker.blobUrl = paddedBlobUrl;

      logger.log(
        `モード${nextBorderMode}の画像を設定: borderWidth=${result.borderWidth}px, hasBorder=${sticker.hasBorder}`,
      );

      const oldCurrentUrl = sticker.img?.src;

      updateStickerImageUrl(sticker);

      const newCurrentUrl = sticker.img?.src;
      await new Promise((resolve) => {
        const img = sticker.img;
        if (!img) {
          if (oldBlobUrl && oldBlobUrl !== newCurrentUrl)
            blobURLManager.revokeURL(oldBlobUrl);
          if (oldBlobWithBorderUrl && oldBlobWithBorderUrl !== newCurrentUrl)
            blobURLManager.revokeURL(oldBlobWithBorderUrl);
          if (oldPaddedBlobUrl && oldPaddedBlobUrl !== newCurrentUrl)
            blobURLManager.revokeURL(oldPaddedBlobUrl);
          resolve();
          return;
        }

        let isResolved = false;

        const onLoad = () => {
          if (isResolved) return;
          isResolved = true;
          img.removeEventListener("load", onLoad);
          img.removeEventListener("error", onError);

          if (img.naturalWidth > 0) {
            setTimeout(() => {
              const currentSrc = img.src;
              if (
                oldBlobUrl &&
                oldBlobUrl !== newCurrentUrl &&
                oldBlobUrl !== currentSrc
              ) {
                blobURLManager.revokeURL(oldBlobUrl, img);
              }
              if (
                oldBlobWithBorderUrl &&
                oldBlobWithBorderUrl !== newCurrentUrl &&
                oldBlobWithBorderUrl !== currentSrc
              ) {
                blobURLManager.revokeURL(oldBlobWithBorderUrl, img);
              }
              if (
                oldPaddedBlobUrl &&
                oldPaddedBlobUrl !== newCurrentUrl &&
                oldPaddedBlobUrl !== currentSrc
              ) {
                blobURLManager.revokeURL(oldPaddedBlobUrl, img);
              }
            }, 100);
          }
          resolve();
        };

        const onError = () => {
          if (isResolved) return;
          isResolved = true;
          img.removeEventListener("load", onLoad);
          img.removeEventListener("error", onError);
          resolve();
        };

        img.addEventListener("load", onLoad);
        img.addEventListener("error", onError);

        if (img.complete && img.naturalWidth > 0) {
          setTimeout(onLoad, 10);
        } else {
          setTimeout(() => {
            if (!isResolved) {
              onLoad();
            }
          }, 5000);
        }
      });
    }
  }

  if (!sticker.hasBorder) {
    sticker.element.classList.add("no-border");
  } else {
    sticker.element.classList.remove("no-border");
  }

  if (sticker.isHelpSticker) {
    updateHelpStickerBorder(sticker);
  }

  if (!sticker.isHelpSticker) {
    await updateStickerInDB(sticker.id, {
      hasBorder: sticker.hasBorder,
      borderMode: sticker.borderMode,
    });
  } else {
    updateHelpStickerState(sticker);
  }

  updateInfoButtonVisibility();
}

/**
 * ステッカーの画像URLを更新（縁取り状態に応じて）
 * @param {Object} sticker - シールオブジェクト
 */
export function updateStickerImageUrl(sticker) {
  if (!sticker.img) return;

  let newUrl;
  newUrl = sticker.hasBorder ? sticker.blobWithBorderUrl : sticker.blobUrl;

  if (newUrl) {
    sticker.img.src = newUrl;
    sticker.url = newUrl;
  }
}
