import { state } from "../state.js";
import {
  STICKER_DEFAULTS,
  HELP_STICKER_CONFIG,
  BORDER_WIDTHS,
} from "./constants.js";
import {
  saveStickerToDB,
  updateStickerInDB,
  deleteStickerFromDB,
} from "./db.js";
import {
  elements,
  showToast,
  updateInfoButtonVisibility,
  updateHelpStickerState,
  clearHelpStickerState,
  updateHelpStickerBorder,
} from "./ui.js";
import { attachStickerEventListeners } from "./events.js";
import {
  isPhysicsActive,
  addPhysicsBody,
  removePhysicsBody,
} from "./physics.js";

/**
 * Blob URL管理クラス
 * blob URLの作成、追跡、安全な解放を一元管理
 */
class BlobURLManager {
  constructor() {
    // 使用中のblob URLを追跡（img要素とURLのマッピング）
    this.activeUrls = new Map(); // img要素 -> Set<blobUrl>
    // 一時的なblob URL（すぐに解放される）
    this.tempUrls = new Set();
  }

  /**
   * BlobからURLを作成
   * @param {Blob} blob - Blobオブジェクト
   * @param {HTMLImageElement|null} imgElement - このURLを使用するimg要素（オプション）
   * @returns {string} blob URL
   */
  createURL(blob, imgElement = null) {
    if (!blob || !(blob instanceof Blob)) {
      throw new Error("Invalid blob provided");
    }
    const url = URL.createObjectURL(blob);

    if (imgElement) {
      // img要素に関連付けて追跡
      if (!this.activeUrls.has(imgElement)) {
        this.activeUrls.set(imgElement, new Set());
      }
      this.activeUrls.get(imgElement).add(url);
    } else {
      // 一時的なURLとしてマーク
      this.tempUrls.add(url);
    }

    return url;
  }

  /**
   * 使用中のURLかどうかを確認
   * @param {string} url - 確認するURL
   * @param {HTMLImageElement|null} imgElement - 確認するimg要素（オプション）
   * @returns {boolean} 使用中の場合true
   */
  isActive(url, imgElement = null) {
    if (imgElement) {
      const urls = this.activeUrls.get(imgElement);
      return urls && urls.has(url);
    }

    // すべてのimg要素で使用中か確認
    for (const urls of this.activeUrls.values()) {
      if (urls.has(url)) {
        return true;
      }
    }

    return false;
  }

  /**
   * URLを安全に解放
   * @param {string} url - 解放するURL
   * @param {HTMLImageElement|null} imgElement - このURLを使用しているimg要素（オプション）
   * @returns {boolean} 解放に成功した場合true
   */
  revokeURL(url, imgElement = null) {
    if (!url || !url.startsWith("blob:")) {
      return false;
    }

    // 使用中でないことを確認
    if (this.isActive(url, imgElement)) {
      // 使用中のURLを保護（これは正常な動作）
      return false;
    }

    try {
      URL.revokeObjectURL(url);

      // 追跡から削除
      if (imgElement && this.activeUrls.has(imgElement)) {
        this.activeUrls.get(imgElement).delete(url);
        if (this.activeUrls.get(imgElement).size === 0) {
          this.activeUrls.delete(imgElement);
        }
      }
      this.tempUrls.delete(url);

      return true;
    } catch (error) {
      console.warn("Failed to revoke blob URL:", error);
      return false;
    }
  }

  /**
   * img要素に関連付けられたすべてのURLを解放
   * @param {HTMLImageElement} imgElement - img要素
   * @param {string} keepUrl - 保持するURL（オプション）
   */
  revokeAllForImage(imgElement, keepUrl = null) {
    if (!imgElement) return;

    const urls = this.activeUrls.get(imgElement);
    if (!urls) return;

    const urlsToRevoke = Array.from(urls).filter((url) => url !== keepUrl);
    urlsToRevoke.forEach((url) => this.revokeURL(url, imgElement));

    if (keepUrl) {
      // keepUrlのみを残す
      this.activeUrls.set(imgElement, new Set([keepUrl]));
    } else {
      this.activeUrls.delete(imgElement);
    }
  }

  /**
   * 画像の読み込みを待つ
   * @param {HTMLImageElement} img - 画像要素
   * @param {string} url - 読み込むURL
   * @param {number} timeout - タイムアウト（ミリ秒、デフォルト5000）
   * @returns {Promise<void>}
   */
  async waitForImageLoad(img, url, timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (!img) {
        resolve();
        return;
      }

      let isResolved = false;

      const cleanup = () => {
        if (isResolved) return;
        isResolved = true;
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onError);
      };

      const onLoad = () => {
        cleanup();
        // 画像が確実に読み込まれたことを確認
        if (img.naturalWidth > 0) {
          resolve();
        } else {
          // naturalWidthが0の場合はエラー
          reject(new Error("Image loaded but naturalWidth is 0"));
        }
      };

      const onError = () => {
        cleanup();
        reject(new Error("Image load failed"));
      };

      img.addEventListener("load", onLoad);
      img.addEventListener("error", onError);

      // 既に読み込まれている場合
      if (img.complete && img.naturalWidth > 0) {
        setTimeout(onLoad, 10);
      } else {
        // タイムアウトを設定
        setTimeout(() => {
          if (!isResolved) {
            cleanup();
            reject(new Error("Image load timeout"));
          }
        }, timeout);
      }

      // URLを設定（既に設定されている場合はスキップ）
      if (img.src !== url) {
        img.src = url;
      } else if (img.complete && img.naturalWidth > 0) {
        // 同じURLで既に読み込まれている場合
        setTimeout(onLoad, 10);
      }
    });
  }

  /**
   * 画像URLを安全に更新（古いURLを解放してから新しいURLを設定）
   * @param {HTMLImageElement} img - 画像要素
   * @param {string} newUrl - 新しいURL
   * @param {number} waitDelay - 古いURLを解放するまでの待機時間（ミリ秒、デフォルト100）
   * @returns {Promise<void>}
   */
  async updateImageUrl(img, newUrl, waitDelay = 100) {
    if (!img) return;

    const oldUrl = img.src;

    // 新しいURLが設定されるまで待つ
    await this.waitForImageLoad(img, newUrl);

    // 少し待ってから古いURLを解放（確実に新しいURLが使用されていることを確認）
    setTimeout(() => {
      const currentSrc = img.src;
      // 現在使用中のURLでない場合のみ解放
      if (
        oldUrl &&
        oldUrl !== newUrl &&
        oldUrl !== currentSrc &&
        oldUrl.startsWith("blob:")
      ) {
        this.revokeURL(oldUrl, img);
      }
    }, waitDelay);
  }

  /**
   * すべての一時的なURLを解放
   */
  revokeAllTemp() {
    this.tempUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn("Failed to revoke temp URL:", error);
      }
    });
    this.tempUrls.clear();
  }

  /**
   * ステッカーオブジェクトの古いURLを安全に解放
   * @param {Object} sticker - ステッカーオブジェクト
   * @param {string} keepUrl - 保持するURL（オプション）
   */
  revokeStickerUrls(sticker, keepUrl = null) {
    if (!sticker || !sticker.img) return;

    const currentSrc = sticker.img.src;
    const urlsToCheck = [
      sticker.originalBlobUrl,
      sticker.blobUrl,
      sticker.blobWithBorderUrl,
      sticker.paddedBlobUrl,
    ].filter((url) => url && url !== keepUrl && url !== currentSrc);

    urlsToCheck.forEach((url) => {
      this.revokeURL(url, sticker.img);
    });
  }
}

// グローバルなBlobURLManagerインスタンス
const blobURLManager = new BlobURLManager();

/**
 * 縁取りの設定
 */
const OUTLINE_CONFIG = {
  RATIO: 0.05, // 画像サイズに対する縁取りの比率（5%）
  MIN_WIDTH: 8, // 最小縁取り幅（px）- 後方互換性のために残す
  COLOR: "#ffffff", // 縁取りの色
};

/**
 * 画像に透過があるかどうかを検出
 * @param {HTMLImageElement} img - チェックする画像
 * @returns {boolean} 透過がある場合はtrue
 */
function hasTransparency(img) {
  // キャンバスに描画して分析
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(img.width, 100); // パフォーマンスのため小さく
  canvas.height = Math.min(img.height, 100);
  const ctx = canvas.getContext("2d");

  // 画像を描画
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  try {
    // エッジ（縁）のピクセルをチェック（透過PNGの場合、端が透明になる可能性が高い）
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // 画像の周囲をサンプリングチェック
    for (let i = 0; i < canvas.width; i++) {
      // 上端と下端
      const topIndex = i * 4 + 3;
      const bottomIndex = (canvas.height - 1) * canvas.width * 4 + i * 4 + 3;
      if (data[topIndex] < 255 || data[bottomIndex] < 255) {
        return true;
      }
    }

    for (let i = 0; i < canvas.height; i++) {
      // 左端と右端
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
    console.warn("透過チェック中にエラー:", e);
    return false; // エラーの場合は透過なしと判断
  }
}

/**
 * 画像の種類と透過有無に応じたオフセットを生成
 * @param {number} borderWidth - 縁取りの太さ
 * @param {string} imageType - 画像の種類（"image/jpeg", "image/png"など）
 * @param {boolean} hasTransparency - 画像に透過があるかどうか
 * @returns {Array<{x: number, y: number}>} オフセット配列
 */
function generateOutlineOffsets(
  borderWidth,
  imageType = "",
  hasTransparency = false,
) {
  // JPEGまたは透過のないPNGの場合は四角形の縁取り（8方向）
  if (
    imageType === "image/jpeg" ||
    (imageType === "image/png" && !hasTransparency)
  ) {
    return [
      { x: -borderWidth, y: 0 }, // 左
      { x: borderWidth, y: 0 }, // 右
      { x: 0, y: -borderWidth }, // 上
      { x: 0, y: borderWidth }, // 下
      { x: -borderWidth, y: -borderWidth }, // 左上
      { x: borderWidth, y: -borderWidth }, // 右上
      { x: -borderWidth, y: borderWidth }, // 左下
      { x: borderWidth, y: borderWidth }, // 右下
    ];
  }
  // 透過のあるPNGの場合は円形の縁取り（36方向）
  else {
    const offsets = [];

    // 0度から350度まで、10度ずつ36方向を生成
    for (let angle = 0; angle < 360; angle += 10) {
      // 角度をラジアンに変換
      const angleRad = angle * (Math.PI / 180);

      // 三角関数でx,y座標を計算（cos,sin）
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
 * 画像サイズから縁取りの太さを計算
 * @param {number} width - 画像の幅
 * @param {number} height - 画像の高さ
 * @param {number} borderMode - 縁取りモード（0:なし, 1:2.5%, 2:5%）
 * @returns {number} 縁取りの太さ（px）
 */
export function calculateBorderWidth(width, height, borderMode = 2) {
  // borderModeが0（縁取りなし）の場合は0を返す
  if (borderMode === 0) {
    return 0;
  }

  const imageSize = Math.max(width, height);

  // borderModeに基づいて画像サイズに応じた縁取り幅を計算
  if (borderMode > 0 && borderMode < BORDER_WIDTHS.length) {
    const ratio = BORDER_WIDTHS[borderMode];
    // 最低でもOUTLINE_CONFIG.MIN_WIDTHピクセル確保
    return Math.max(OUTLINE_CONFIG.MIN_WIDTH, Math.round(imageSize * ratio));
  }

  // 後方互換性のために残す（従来の動的計算）
  return Math.max(
    OUTLINE_CONFIG.MIN_WIDTH,
    Math.round(imageSize * OUTLINE_CONFIG.RATIO),
  );
}

/**
 * 白い縁取り用の画像を作成（画像の形状に沿った白い画像）
 * @param {HTMLImageElement|HTMLCanvasElement} source - 元の画像またはcanvas
 * @returns {HTMLCanvasElement} 白い縁取り用のCanvas
 */
function createWhiteMaskedImage(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");

  // 白い矩形を描画
  ctx.fillStyle = OUTLINE_CONFIG.COLOR;
  ctx.fillRect(0, 0, source.width, source.height);

  // 画像のアルファチャンネルでマスク（画像の形状に沿った白い画像）
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(source, 0, 0);

  return canvas;
}

/**
 * 画像を縮小して中身部分のcanvasを作成
 * @param {HTMLImageElement} img - 元の画像
 * @param {number} borderWidth - 縁取り幅（この分だけ縮小される）
 * @returns {HTMLCanvasElement} 縮小された中身部分のcanvas
 */
function createResizedContentCanvas(img, borderWidth) {
  const contentWidth = img.width - borderWidth * 2;
  const contentHeight = img.height - borderWidth * 2;

  const canvas = document.createElement("canvas");
  canvas.width = contentWidth;
  canvas.height = contentHeight;
  const ctx = canvas.getContext("2d");

  // 高品質な縮小
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 元画像の縦横比を維持して描画
  ctx.drawImage(
    img,
    0,
    0,
    img.width,
    img.height,
    0,
    0,
    contentWidth,
    contentHeight,
  );

  return canvas;
}

/**
 * 中身canvasに透明paddingまたは縁取りを追加
 * @param {HTMLCanvasElement} contentCanvas - 中身部分のcanvas
 * @param {number} borderWidth - 縁取り幅
 * @param {boolean} withOutline - 縁取りを追加するか（falseの場合は透明padding）
 * @param {number} finalWidth - 最終的な幅
 * @param {number} finalHeight - 最終的な高さ
 * @param {string} imageType - 画像の種類（"image/jpeg", "image/png"など）
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
    // 縁取りを追加
    ctx.globalCompositeOperation = "source-over";

    // 白い縁取り用の画像を作成
    const whiteMaskedImage = createWhiteMaskedImage(contentCanvas);

    // 画像タイプと透過有無に応じたオフセットを生成
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

  // 中身を中央に描画
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
        console.warn(errorMessage);
        resolve(fallbackBlob);
      }
    }, "image/png");
  });
}

/**
 * blobから画像を読み込んで処理を実行
 * @param {Blob} blob - 元の画像blob
 * @param {Function} processImage - 画像処理関数 (img) => result
 * @param {*} fallbackResult - エラー時に返す値
 * @returns {Promise<*>} 処理結果
 */
function loadImageAndProcess(blob, processImage, fallbackResult) {
  return new Promise((resolve) => {
    const img = new Image();
    const blobUrl = blobURLManager.createURL(blob); // 一時的なURLとして作成

    img.onload = () => {
      try {
        const result = processImage(img);
        blobURLManager.revokeURL(blobUrl);
        resolve(result);
      } catch (error) {
        console.warn("画像処理エラー:", error);
        blobURLManager.revokeURL(blobUrl);
        resolve(fallbackResult);
      }
    };

    img.onerror = () => {
      console.warn("画像読み込み失敗");
      blobURLManager.revokeURL(blobUrl);
      resolve(fallbackResult);
    };

    img.src = blobUrl;
  });
}

/**
 * 画像を縮小して透明なpaddingを追加（縁取りあり版と同じサイズにする）
 * @param {Blob} blob - 元の画像blob
 * @param {number} borderWidth - 追加するpadding幅
 * @returns {Promise<Blob>} padding付き画像blob
 */
export async function addPaddingToImage(blob, borderWidth) {
  console.log("パディング追加: borderWidth =", borderWidth);
  return loadImageAndProcess(
    blob,
    async (img) => {
      // パディング幅の確認 - 最低8pxを確保
      if (borderWidth <= 0) {
        console.log("パディング幅が0px以下です。最低8pxを使用");
        borderWidth = 8; // 最小値を設定
      }

      // オリジナルサイズのcanvasを作成
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");

      // 元画像をそのまま描画
      ctx.drawImage(img, 0, 0, img.width, img.height);

      // 新しいキャンバスを作成（パディング付き）
      const finalWidth = img.width + borderWidth * 2;
      const finalHeight = img.height + borderWidth * 2;

      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = finalWidth;
      finalCanvas.height = finalHeight;
      const finalCtx = finalCanvas.getContext("2d");

      // 透明な背景（デフォルト）
      finalCtx.clearRect(0, 0, finalWidth, finalHeight);

      // 元画像を中央に描画
      finalCtx.drawImage(canvas, borderWidth, borderWidth);

      console.log(
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
 * @param {number} borderMode - 縁取りモード（0:なし, 1:2.5%, 2:5%）
 * @returns {Promise<{blob: Blob, borderWidth: number}>} 縁取りが焼き込まれたblobと縁取りの幅
 */
export async function applyOutlineFilter(blob, borderMode = 2) {
  return loadImageAndProcess(
    blob,
    async (img) => {
      // borderWidthが0なら縁取りなし（モード0）
      if (borderMode === 0) {
        return { blob, borderWidth: 0, borderMode: 0 };
      }

      // 計算された縁取り幅
      const borderWidth = calculateBorderWidth(
        img.width,
        img.height,
        borderMode,
      );

      if (borderWidth <= 0) {
        console.warn("縁取り幅が0以下です。縁取りを適用しません");
        return { blob, borderWidth: 0, borderMode };
      }

      // 元画像のサイズを保存
      const originalWidth = img.width;
      const originalHeight = img.height;

      // コンテンツキャンバスを作成（縮小せず、元画像そのもの）
      const canvas = document.createElement("canvas");
      canvas.width = originalWidth;
      canvas.height = originalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      // 画像の種類と透過の有無を判定
      const imageType = blob.type || "image/png";
      const transparency = hasTransparency(img);

      console.log(
        `縁取り適用: モード${borderMode}, 幅${borderWidth}px, 画像サイズ${originalWidth}x${originalHeight}`,
      );

      // 透過とファイルタイプの両方を考慮したaddBorderOrPadding関数の呼び出し
      // 最終サイズは元のサイズ + 縁取り幅*2
      const finalCanvas = addBorderOrPadding(
        canvas,
        borderWidth,
        true,
        originalWidth + borderWidth * 2,
        originalHeight + borderWidth * 2,
        imageType,
        transparency,
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
 * Blobを適切なサイズにリサイズ（Safari最適化）
 * @param {Blob} blob - 元の画像blob
 * @param {number} maxSize - 長辺の最大サイズ（px）
 * @returns {Promise<Blob>} リサイズ済みのblob
 */
async function resizeImageBlob(blob, maxSize = 1200) {
  return new Promise((resolve) => {
    const img = new Image();
    const blobUrl = blobURLManager.createURL(blob); // 一時的なURL
    img.onload = () => {
      // 縦横比を維持してリサイズ
      let width = img.width;
      let height = img.height;

      // 既に小さい画像はそのまま返す
      if (width <= maxSize && height <= maxSize) {
        blobURLManager.revokeURL(blobUrl);
        resolve(blob);
        return;
      }

      // 長辺をmaxSizeに合わせる
      if (width > height) {
        height = (height / width) * maxSize;
        width = maxSize;
      } else {
        width = (width / height) * maxSize;
        height = maxSize;
      }

      // Canvasでリサイズ
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      // 高品質なリサイズ設定
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      ctx.drawImage(img, 0, 0, width, height);

      // 元の画像フォーマットを判定
      const mimeType = blob.type || "image/png";
      const isPNG = mimeType === "image/png";
      const quality = isPNG ? 1.0 : 0.9; // PNGは品質指定不要、JPEGは90%

      // Blobに変換（元のフォーマットを維持）
      canvas.toBlob(
        (resizedBlob) => {
          blobURLManager.revokeURL(blobUrl);
          if (resizedBlob) {
            console.log(
              `画像リサイズ: ${img.width}x${img.height} → ${width}x${height} (${mimeType})`,
            );
            resolve(resizedBlob);
          } else {
            console.warn("リサイズ失敗、元の画像を使用");
            resolve(blob);
          }
        },
        mimeType,
        quality,
      );
    };

    img.onerror = () => {
      blobURLManager.revokeURL(blobUrl);
      console.warn("画像読み込み失敗、元の画像を使用");
      resolve(blob);
    };

    img.src = blobUrl;
  });
}

/**
 * 画像をリサイズし、縁取りあり版も生成
 * @param {Blob} blob - 元の画像blob
 * @param {number} maxSize - 長辺の最大サイズ（px）
 * @param {number} borderMode - 縁取りモード（0:なし, 1:4px, 2:8px）
 * @returns {Promise<{blob: Blob, blobWithBorder: Blob}>} 縁取りなし版と縁取りあり版
 */
async function resizeImageBlobWithBorder(blob, maxSize = 1200, borderMode = 2) {
  // まずリサイズ
  const resizedBlob = await resizeImageBlob(blob, maxSize);

  // 縁取りあり版を生成
  const blobWithBorder = await applyOutlineFilter(resizedBlob, borderMode);

  return {
    blob: resizedBlob,
    blobWithBorder: blobWithBorder,
  };
}

/**
 * ステッカーの基準幅を取得
 * @param {Object} sticker - シールオブジェクト
 * @returns {number} 基準幅
 */
function getBaseWidth(sticker) {
  return sticker.isHelpSticker
    ? HELP_STICKER_CONFIG.BASE_WIDTH
    : STICKER_DEFAULTS.BASE_WIDTH;
}

/**
 * ステッカーのscaleを計算
 * @param {Object} sticker - シールオブジェクト
 * @returns {number} scale値
 */
function calculateScale(sticker) {
  return sticker.width / getBaseWidth(sticker);
}

/**
 * ステッカーのサイズ制限設定を取得
 * @param {Object} sticker - シールオブジェクト
 * @returns {Object} {minWidth, maxWidth}
 */
function getSizeConstraints(sticker) {
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
function applyStickerTransform(sticker) {
  if (sticker.imgWrapper) {
    const scale = calculateScale(sticker);
    sticker.imgWrapper.style.transform = `rotate(${sticker.rotation}deg) scale(${scale})`;
  }
}

/**
 * Blobからシールを追加
 * @param {Blob} blob - 画像Blob
 * @param {number} x - 画面中央からのX座標オフセット（px）
 * @param {number} yPercent - 画面高さに対するY座標の割合（0-100）
 * @param {number} width - 幅（px）
 * @param {number} rotation - 回転角度
 * @param {number|null} id - シールID
 * @param {number|null} zIndex - z-index
 * @param {boolean} hasBorder - 縁取りあり
 * @param {number} borderMode - 縁取りモード（0:なし, 1:4px, 2:8px）
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
  // まずリサイズだけ実行（高速）
  const resizedBlob = await resizeImageBlob(blob, 1200);

  const stickerId = id || Date.now();

  // 画像サイズを取得して縁取り幅を計算
  const imageDimensions = await new Promise((resolve) => {
    const img = new Image();
    const tempBlobUrl = blobURLManager.createURL(resizedBlob); // 一時的なURL
    img.onload = () => {
      blobURLManager.revokeURL(tempBlobUrl);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      blobURLManager.revokeURL(tempBlobUrl);
      resolve({ width: 800, height: 800 }); // エラー時のフォールバック値
    };
    img.src = tempBlobUrl;
  });

  // モード2（5%）の最大縁取り幅を計算
  const maxBorderWidth = Math.max(
    8, // 最小値
    Math.round(
      Math.max(imageDimensions.width, imageDimensions.height) *
        BORDER_WIDTHS[2],
    ),
  );

  // 現在のモードの縁取り幅
  const borderWidth =
    borderMode === 0
      ? 0
      : Math.max(
          8,
          Math.round(
            Math.max(imageDimensions.width, imageDimensions.height) *
              BORDER_WIDTHS[borderMode],
          ),
        );

  // リサイズ済み画像をベース画像として保存（パディングや縁取りを適用する前の状態）
  // これが全ての処理の基準となる「元画像」
  // 注意: この時点ではimg要素がまだ作成されていないため、後で関連付ける
  const originalBlobUrl = blobURLManager.createURL(resizedBlob);

  // borderModeが未定義の場合はデフォルト値を使用
  if (borderMode === undefined) {
    borderMode = STICKER_DEFAULTS.BORDER_MODE;
  }

  console.log(`アップロード: 使用する縁取りモード = ${borderMode}`);

  let url, blobUrl, blobWithBorderUrl, paddedBlobUrl;

  // 元画像URLを保持
  blobUrl = originalBlobUrl;

  // アップロード時の処理をシンプルに
  // 注意: この時点ではimg要素がまだ作成されていないため、後でaddStickerToDOMで関連付ける
  if (borderMode === 0) {
    // モード0（縁取りなし）: 5%パディングを追加
    console.log(`アップロード: モード0 - 5%パディングを追加`);
    const paddedBlob = await addPaddingToImage(resizedBlob, maxBorderWidth);
    url = blobURLManager.createURL(paddedBlob);
    blobWithBorderUrl = null;
    paddedBlobUrl = url;
  } else if (borderMode === 1) {
    // モード1（2.5%）: 2.5%縁取り + 残りパディング
    console.log(`アップロード: モード1 - 2.5%縁取り + 残りパディング`);
    const { blob: borderBlob } = await applyOutlineFilter(resizedBlob, 1);
    const paddedBorderBlob = await addPaddingToImage(
      borderBlob,
      maxBorderWidth - borderWidth,
    );
    blobWithBorderUrl = blobURLManager.createURL(paddedBorderBlob);

    // パディング付き画像も生成（縁取りなし表示用）
    const paddedBlob = await addPaddingToImage(resizedBlob, maxBorderWidth);
    paddedBlobUrl = blobURLManager.createURL(paddedBlob);

    url = hasBorder ? blobWithBorderUrl : paddedBlobUrl;
  } else {
    // モード2（5%縁取り）: 標準（パディングなし）
    console.log(`アップロード: モード2 - 5%縁取り（パディングなし）`);
    const { blob: borderBlob } = await applyOutlineFilter(resizedBlob, 2);
    blobWithBorderUrl = blobURLManager.createURL(borderBlob);

    // パディング付き画像も生成（縁取りなし表示用）
    const paddedBlob = await addPaddingToImage(resizedBlob, maxBorderWidth);
    paddedBlobUrl = blobURLManager.createURL(paddedBlob);

    url = hasBorder ? blobWithBorderUrl : paddedBlobUrl;
  }

  // DOMに追加（即座に表示）
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
    false, // isPinned（新規追加時は常に未固定）
    hasBorder,
    borderWidth, // borderWidthを渡す
    borderMode, // borderModeを渡す
    originalBlobUrl, // オリジナル画像URL
    null, // removedBgBlobUrl
    null, // removedBgBlobWithBorderUrl
    false, // hasBgRemoved
    false, // bgRemovalProcessed
    null, // removedBgBlob
    null, // removedBgBlobWithBorder
    resizedBlob, // originalBlob（Blobオブジェクト）
  );

  // バックグラウンド処理は不要（既に生成済み）
  // 少し待機してから状態の確認と保存を行う
  setTimeout(async () => {
    try {
      const addedSticker = state.getStickerById(stickerId);
      if (addedSticker) {
        // モード0やモード1での追加パディングを保持するため、現在のURLを保存
        addedSticker.borderWidth = borderWidth;
        addedSticker.borderMode = borderMode;

        // すでに適切な画像が表示されているので、変更しない
        // サーバー保存とDBへの追加のみ行う

        // 現在表示中の画像を取得
        let blobForBorder = null;
        if (blobWithBorderUrl) {
          try {
            blobForBorder = await fetch(blobWithBorderUrl).then((r) =>
              r.blob(),
            );
          } catch (fetchErr) {
            console.warn("画像取得エラー:", fetchErr);
          }
        }

        // 元画像と現在表示中の画像をDBに保存
        await saveStickerToDB({
          id: stickerId,
          blob: resizedBlob, // 表示用の画像
          originalBlob: resizedBlob, // リサイズ済み・縁取り/パディング前の元画像
          blobWithBorder: blobForBorder, // 現在表示中の画像
          x: addedSticker.x,
          yPercent: addedSticker.yPercent,
          width: addedSticker.width,
          rotation: addedSticker.rotation,
          zIndex: addedSticker.zIndex,
          isPinned: addedSticker.isPinned,
          hasBorder: addedSticker.hasBorder,
          borderMode: addedSticker.borderMode, // 縁取りモードを保存
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.warn("ステッカー保存エラー:", err);
    }
  }, 100); // 少し待ってから処理

  // 初期データをIndexedDBに保存（詳細なバージョンは後でsetTimeout内で保存）
  await saveStickerToDB({
    id: stickerId,
    blob: resizedBlob,
    originalBlob: resizedBlob, // リサイズ済み・縁取り/パディング前の元画像
    x: x,
    yPercent: yPercent,
    width: width,
    rotation: rotation,
    zIndex: actualZIndex,
    isPinned: false,
    hasBorder: hasBorder,
    borderMode: borderMode, // 縁取りモードを保存
    timestamp: Date.now(),
    // この時点では縁取り版のBlobは保存しない（後で追加される）
  });

  console.log(`ステッカー初期保存: borderMode = ${borderMode}`);

  // 追加したステッカーを選択状態にする
  const addedSticker = state.getStickerById(stickerId);
  if (addedSticker) {
    state.selectSticker(addedSticker);
    updateInfoButtonVisibility();
  }
}

/**
 * シール（画像）をDOMに追加
 * @param {string} url - 現在表示する画像URL
 * @param {string} blobUrl - 縁取りなし版のURL
 * @param {string} blobWithBorderUrl - 縁取りあり版のURL
 * @param {number} x - 画面中央からのX座標オフセット（px）
 * @param {number} yPercent - 画面高さに対するY座標の割合（0-100）
 * @param {number} width - 幅（px）
 * @param {number} rotation - 回転角度
 * @param {number|null} id - シールID
 * @param {number|null} zIndex - z-index
 * @param {boolean} isPinned - 固定状態
 * @param {boolean} hasBorder - 縁取りあり
 * @param {number} borderWidth - 縁取りの幅（px）
 * @param {number} borderMode - 縁取りモード（0:なし, 1:2.5%, 2:5%）
 * @param {string} [originalBlobUrl] - リサイズ済み・パディング/縁取り前の元画像URL
 * @returns {number} 実際のz-index
 */
export function addStickerToDOM(
  url,
  blobUrl,
  blobWithBorderUrl,
  x,
  yPercent,
  width = STICKER_DEFAULTS.WIDTH,
  rotation = STICKER_DEFAULTS.ROTATION,
  id = null,
  zIndex = null,
  isPinned = false,
  hasBorder = STICKER_DEFAULTS.HAS_BORDER,
  borderWidth = 0,
  borderMode = STICKER_DEFAULTS.BORDER_MODE,
  originalBlobUrl = null, // リサイズ済み・パディング/縁取り前の元画像URL
  _removedBgBlobUrl = null, // 廃止予定（後方互換性のため残す）
  _removedBgBlobWithBorderUrl = null, // 廃止予定（後方互換性のため残す）
  _hasBgRemoved = false, // 廃止予定（後方互換性のため残す）
  bgRemovalProcessed = false,
  _removedBgBlob = null, // 廃止予定（後方互換性のため残す）
  _removedBgBlobWithBorder = null, // 廃止予定（後方互換性のため残す）
  originalBlob = null, // リサイズ済み・パディング/縁取り前の元画像Blob（優先使用）
) {
  const stickerId = id || Date.now();

  // シールコンテナを作成
  const stickerDiv = document.createElement("div");
  stickerDiv.className = "sticker appearing";
  stickerDiv.dataset.id = stickerId;

  // アニメーション終了後にappearingクラスを削除
  setTimeout(() => {
    stickerDiv.classList.remove("appearing");
  }, 400);

  // 画像要素を作成
  const img = document.createElement("img");
  img.src = url;

  // すべてのblob URLをimg要素に関連付けて追跡
  // 注意: paddedBlobUrlは後でstickerオブジェクトに追加される可能性があるため、ここでは追跡しない
  const urlsToTrack = [url, blobUrl, blobWithBorderUrl, originalBlobUrl].filter(
    (url) => url && url.startsWith("blob:"),
  );

  if (urlsToTrack.length > 0) {
    if (!blobURLManager.activeUrls.has(img)) {
      blobURLManager.activeUrls.set(img, new Set());
    }
    urlsToTrack.forEach((url) => {
      blobURLManager.activeUrls.get(img).add(url);
    });
  }

  // 画像ラッパー（回転とスケール用）
  const imgWrapper = document.createElement("div");
  imgWrapper.className = "sticker-img-wrapper";
  imgWrapper.appendChild(img);

  stickerDiv.appendChild(imgWrapper);

  // スタイルを設定（X:画面中央基準のピクセル値、Y:パーセント値）
  stickerDiv.style.left = `calc(50% + ${x}px)`;
  stickerDiv.style.top = `${yPercent}%`;
  stickerDiv.style.width = `${STICKER_DEFAULTS.BASE_WIDTH}px`; // 固定幅
  stickerDiv.style.transform = `translate(-50%, -50%)`;

  // z-indexを設定
  let actualZIndex;
  if (zIndex !== null) {
    // 読み込み時：保存されたz-indexを使用
    actualZIndex = zIndex;
    stickerDiv.style.zIndex = zIndex;
    state.updateZIndexCounter(zIndex);
  } else {
    // 新規追加時：新しいz-indexを割り当て
    actualZIndex = state.incrementZIndex();
    stickerDiv.style.zIndex = actualZIndex;
  }

  // イベントリスナーを登録（imgWrapperに設定）
  attachStickerEventListeners(imgWrapper, stickerId);

  // DOMに追加
  elements.canvas.appendChild(stickerDiv);

  // 状態に追加
  const stickerObject = {
    id: stickerId,
    url: url,
    blobUrl: blobUrl,
    originalBlobUrl: originalBlobUrl, // 常に元の画像（処理前のオリジナル）のURLを保持
    originalBlob: originalBlob, // リサイズ済み・パディング/縁取り前の元画像Blob（優先使用）
    blobWithBorderUrl: blobWithBorderUrl,
    x: x,
    yPercent: yPercent,
    width: width,
    rotation: rotation,
    zIndex: actualZIndex,
    element: stickerDiv,
    bgRemovalProcessed: bgRemovalProcessed,
    imgWrapper: imgWrapper,
    img: img,
    isPinned: isPinned,
    hasBorder: hasBorder,
    borderWidth: borderWidth,
    borderMode: borderMode,
  };
  state.addSticker(stickerObject);

  // 固定状態を反映
  if (isPinned) {
    stickerDiv.classList.add("pinned");
  }

  // 縁取り状態を反映
  if (!hasBorder) {
    stickerDiv.classList.add("no-border");
  }

  // 縁取りモードを反映（CSSクラスで識別）
  console.log(`ステッカーDOM追加: borderMode = ${borderMode}`);
  stickerDiv.classList.add(`border-mode-${borderMode}`);

  // 画像ステッカーのpadding設定は削除（ヘルプステッカーのみ使用）

  // transformを適用（scaleと回転）
  applyStickerTransform(stickerObject);

  // 物理モードが有効な場合は物理ボディを追加
  if (isPhysicsActive()) {
    // DOMが完全にレンダリングされるまで少し待つ
    setTimeout(() => {
      addPhysicsBody(stickerObject);
    }, 10);
  }

  // インフォボタンの表示状態を更新
  updateInfoButtonVisibility();

  return actualZIndex;
}

/**
 * シールを削除（戻す機能付き）
 * @param {number} id - シールID
 */
export async function removeSticker(id) {
  const sticker = state.removeSticker(id);

  if (sticker) {
    // being-deletedクラスを削除（ゴミ箱ドラッグ時の赤い影を解除）
    sticker.element.classList.remove("being-deleted");

    // DOM要素を非表示にする（削除はしない）
    sticker.element.style.display = "none";

    // 物理モードが有効な場合は物理ボディも削除
    if (isPhysicsActive()) {
      removePhysicsBody(id);
    }

    // すべてのblob URLを解放
    if (sticker.img) {
      blobURLManager.revokeAllForImage(sticker.img);
    }

    // 削除時にUIを表示
    state.showUI();

    // インフォボタンの表示状態を更新
    updateInfoButtonVisibility();

    // ヘルプステッカーの場合はlocalStorageから削除
    if (sticker.isHelpSticker) {
      clearHelpStickerState();
    }

    // 削除データを一時保存（戻すために必要なデータ）
    const stickerData = {
      id: sticker.id,
      url: sticker.url,
      blobUrl: sticker.blobUrl,
      blobWithBorderUrl: sticker.blobWithBorderUrl,
      img: sticker.img,
      x: sticker.x,
      yPercent: sticker.yPercent,
      width: sticker.width,
      rotation: sticker.rotation,
      zIndex: sticker.zIndex,
      element: sticker.element,
      imgWrapper: sticker.imgWrapper,
      isHelpSticker: sticker.isHelpSticker,
      isPinned: sticker.isPinned,
      hasBorder: sticker.hasBorder,
    };

    let deleteTimeout = null;

    // 「戻す」トーストを表示
    showToast("削除しました", {
      actionText: "戻す",
      duration: 4000, // 4秒間表示
      onAction: () => {
        // タイムアウトをキャンセル
        if (deleteTimeout) {
          clearTimeout(deleteTimeout);
        }
        // 戻す処理
        undoRemoveSticker(stickerData);
      },
    });

    // 5秒後に完全削除（戻すが押されなかった場合）
    deleteTimeout = setTimeout(async () => {
      // DOM要素を完全に削除
      sticker.element.remove();

      // すべてのblob URLを解放
      releaseOldUrls(sticker);
      if (sticker.paddedBlobUrl) URL.revokeObjectURL(sticker.paddedBlobUrl);

      // ヘルプステッカーでない場合のみIndexedDBから削除
      if (!sticker.isHelpSticker) {
        await deleteStickerFromDB(id);
      }
    }, 5300); // トーストのフェードアウト時間を考慮して少し長めに設定
  }
}

/**
 * シールの削除を取り消す
 * @param {Object} stickerData - シールデータ
 */
async function undoRemoveSticker(stickerData) {
  // DOM要素を再表示
  stickerData.element.style.display = "";

  // 中央に移動
  updateStickerPosition(stickerData, 0, 50);

  // 状態に再追加
  state.addSticker(stickerData);

  // 固定状態を復元
  if (stickerData.isPinned) {
    stickerData.element.classList.add("pinned");
  }

  // 縁取り状態を復元
  if (stickerData.hasBorder === false) {
    stickerData.element.classList.add("no-border");
  } else {
    stickerData.element.classList.remove("no-border");
  }

  // 選択状態にする
  state.selectSticker(stickerData);

  // 最前面に移動
  await bringToFront(stickerData);

  // ヘルプステッカーの場合は状態を復元
  if (stickerData.isHelpSticker) {
    updateHelpStickerState(stickerData);
  }

  // インフォボタンの表示状態を更新
  updateInfoButtonVisibility();
}

/**
 * ステッカーのz-indexを更新してDBに保存
 * @param {Object} sticker - シールオブジェクト
 * @param {number} newZIndex - 新しいz-index
 */
async function updateStickerZIndex(sticker, newZIndex) {
  sticker.element.style.zIndex = newZIndex;
  sticker.zIndex = newZIndex;

  // ヘルプステッカーはlocalStorageに、通常ステッカーはDBに保存
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
  // 現在の最小z-indexを見つける
  const minZIndex = Math.min(...state.stickers.map((s) => s.zIndex));

  // 最小値-1を設定（ただし1以上を保持）
  const newZIndex = Math.max(1, minZIndex - 1);
  await updateStickerZIndex(sticker, newZIndex);

  showToast("最背面に移動しました");
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
  // サイズ制限を取得
  const { minWidth, maxWidth } = getSizeConstraints(sticker);

  // サイズを制限して保存
  sticker.width = Math.max(minWidth, Math.min(maxWidth, width));

  // 固定幅を設定
  const baseWidth = getBaseWidth(sticker);
  sticker.element.style.width = `${baseWidth}px`;

  // transformを適用（scaleと回転）
  applyStickerTransform(sticker);

  // ヘルプステッカーのボーダーは初期値のみ設定し、transform: scale()でスケールされるため
  // サイズ変更時は再計算しない
}

/**
 * シールの変更をDBに保存
 * @param {Object} sticker - シールオブジェクト
 */
export async function saveStickerChanges(sticker) {
  // nullチェック
  if (!sticker) {
    console.warn("saveStickerChanges: sticker is null");
    return;
  }

  // ヘルプステッカーはlocalStorageに保存
  if (sticker.isHelpSticker) {
    updateHelpStickerState(sticker);
    return;
  }

  await updateStickerInDB(sticker.id, {
    x: sticker.x,
    yPercent: sticker.yPercent,
    width: sticker.width,
    rotation: sticker.rotation,
  });
}

/**
 * 複数のステッカーの位置を一括保存
 * @param {Array} stickers - 保存するステッカーの配列
 * @param {Object} options - オプション
 * @param {boolean} options.showToastOnComplete - 完了時にトーストを表示するか
 * @returns {Promise<void>}
 */
export async function saveAllStickerPositions(stickers, options = {}) {
  const promises = stickers.map((sticker) => {
    // ヘルプステッカーでない場合のみDB保存
    if (!sticker.isHelpSticker) {
      return saveStickerChanges(sticker);
    } else {
      // ヘルプステッカーはlocalStorageに保存
      updateHelpStickerState(sticker);
      return Promise.resolve();
    }
  });

  await Promise.all(promises);

  if (options.showToastOnComplete) {
    showToast("位置を保存しました");
  }
}

/**
 * ステッカーの固定状態をトグル
 * @param {Object} sticker - シールオブジェクト
 */
export async function toggleStickerPin(sticker) {
  sticker.isPinned = !sticker.isPinned;

  // DOMクラスを更新
  if (sticker.isPinned) {
    sticker.element.classList.add("pinned");
  } else {
    sticker.element.classList.remove("pinned");
  }

  // ヘルプステッカーでない場合はDBに保存
  if (!sticker.isHelpSticker) {
    await updateStickerInDB(sticker.id, { isPinned: sticker.isPinned });
  } else {
    // ヘルプステッカーはlocalStorageに保存
    updateHelpStickerState(sticker);
  }

  // ボタンの表示状態を更新
  updateInfoButtonVisibility();
}

/**
 * 指定されたモードに基づいて画像の縁取りとパディングを処理する共通関数
 * @param {Blob} originalBlob - 元画像のBlob
 * @param {number} borderMode - 縁取りモード（0:なし, 1:2.5%, 2:5%）
 * @param {number} width - 画像の幅（計算用）
 * @param {number} height - 画像の高さ（計算用）
 * @returns {Promise<{resultBlob: Blob, borderBlob: Blob, paddedBlob: Blob, borderWidth: number}>} 処理結果
 */
async function processBorderAndPadding(
  originalBlob,
  borderMode,
  width,
  height,
) {
  // 各モードの最大サイズ（モード2の5%幅）を計算
  const maxBorderWidth = calculateBorderWidth(width, height, 2);

  // 各モードに応じたパディング幅を計算
  let paddingWidth;

  if (borderMode === 0) {
    // モード0: 5%相当の幅をすべてパディングに
    paddingWidth = maxBorderWidth;
  } else if (borderMode === 1) {
    // モード1: 5%相当の幅から2.5%縁取り分を引いた残りをパディングに
    const borderWidth = calculateBorderWidth(width, height, 1);
    paddingWidth = Math.max(0, maxBorderWidth - borderWidth);
  } else {
    // モード2: 縁取りなし表示用には5%相当のパディングを使用
    paddingWidth = maxBorderWidth;
  }

  // モード別の処理
  if (borderMode === 0) {
    // モード0（縁取りなし）: 5%パディングを追加
    console.log(`モード${borderMode}: 5%パディングを追加（${paddingWidth}px）`);

    // パディング付き画像を生成
    const paddedBlob = await addPaddingToImage(originalBlob, paddingWidth);

    return {
      resultBlob: paddedBlob,
      borderBlob: null,
      paddedBlob: paddedBlob,
      borderWidth: 0,
    };
  } else if (borderMode === 1) {
    // モード1（2.5%）: 2.5%の縁取り + 残りはパディングで合計5%確保
    const { blob: borderBlob, borderWidth } = await applyOutlineFilter(
      originalBlob,
      1,
    );

    // 縁取り画像にパディングを追加（5%相当）
    console.log(
      `モード${borderMode}: 縁取り${borderWidth}px + パディング${paddingWidth}px（合計${borderWidth + paddingWidth}px）`,
    );
    const paddedBorderBlob = await addPaddingToImage(borderBlob, paddingWidth);

    // 縁取りなし用のパディング付き画像も生成（5%相当のパディング）
    console.log(`モード${borderMode}: 縁取りなし用に5%パディング追加`);
    const paddedBlob = await addPaddingToImage(originalBlob, maxBorderWidth);

    return {
      resultBlob: paddedBorderBlob,
      borderBlob: paddedBorderBlob,
      paddedBlob: paddedBlob,
      borderWidth: borderWidth,
    };
  } else {
    // モード2（5%）: 通常の5%縁取り（パディングなし）
    const { blob: borderBlob, borderWidth } = await applyOutlineFilter(
      originalBlob,
      2,
    );

    // 5%縁取りはパディング不要
    console.log(
      `モード${borderMode}: 縁取り${borderWidth}px（パディングなし）`,
    );

    // 縁取りなし用のパディング付き画像は生成（5%相当のパディング）
    console.log(`モード${borderMode}: 縁取りなし用に5%パディング追加`);
    const paddedBlob = await addPaddingToImage(originalBlob, maxBorderWidth);

    return {
      resultBlob: borderBlob, // パディングなし
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
  // 現在のborderModeを取得（未設定の場合はデフォルト値）
  const currentBorderMode =
    sticker.borderMode !== undefined
      ? sticker.borderMode
      : STICKER_DEFAULTS.BORDER_MODE;

  // 次のモードを設定（0:なし → 1:2.5% → 2:5% → 0:なし...）
  let nextBorderMode = (currentBorderMode + 1) % BORDER_WIDTHS.length;
  sticker.borderMode = nextBorderMode;

  // 縁取りの有無設定（モード0の場合はfalse、それ以外はtrue）
  sticker.hasBorder = nextBorderMode !== 0;

  console.log(
    `縁取りモード変更: ${currentBorderMode} → ${nextBorderMode}, hasBorder: ${sticker.hasBorder}`,
  );

  // 既存のborder-modeクラスをすべて削除
  for (let i = 0; i < BORDER_WIDTHS.length; i++) {
    sticker.element.classList.remove(`border-mode-${i}`);
  }

  // 新しいborder-modeクラスを追加
  sticker.element.classList.add(`border-mode-${nextBorderMode}`);

  // 画像URLを切り替え
  if (sticker.img && sticker.blobUrl) {
    // 元のオリジナル画像を取得（優先順位：originalBlob > originalBlobUrl > blobUrl）
    let originalBlob = null;

    // まず、Blobオブジェクトが直接利用可能か確認
    if (sticker.originalBlob) {
      originalBlob = sticker.originalBlob;
      console.log("縁取りモード変更: originalBlobを直接使用");
    } else {
      // Blobオブジェクトがない場合は、URLから取得を試みる
      const originalBlobUrl = sticker.originalBlobUrl || sticker.blobUrl;
      console.log(
        "縁取りモード変更: オリジナルBlobURLから取得:",
        originalBlobUrl,
      );

      try {
        originalBlob = await getBlobFromURL(originalBlobUrl);
        if (!originalBlob) {
          // URLからの取得に失敗した場合、blobプロパティを試す
          if (sticker.blob) {
            originalBlob = sticker.blob;
            console.log("縁取りモード変更: URL取得失敗、sticker.blobを使用");
          }
        }
      } catch (err) {
        console.warn(
          "縁取りモード変更: URLからの取得に失敗、sticker.blobを使用:",
          err,
        );
        // エラー時はsticker.blobを使用
        if (sticker.blob) {
          originalBlob = sticker.blob;
        }
      }
    }

    if (originalBlob) {
      // 元画像の実際のサイズを取得
      const imageDimensions = await getImageDimensions(originalBlob);
      console.log("元画像の実際のサイズ:", imageDimensions);

      // 共通関数を使用して画像処理
      const result = await processBorderAndPadding(
        originalBlob,
        nextBorderMode,
        imageDimensions.width,
        imageDimensions.height,
      );

      // 古いURLを保存
      const oldBlobUrl = sticker.blobUrl;
      const oldBlobWithBorderUrl = sticker.blobWithBorderUrl;
      const oldPaddedBlobUrl = sticker.paddedBlobUrl;

      // 処理結果を保存
      if (nextBorderMode === 0) {
        // モード0（縁取りなし）: パディング付き画像のURLをセット
        const newURL = blobURLManager.createURL(result.resultBlob, sticker.img);
        const oldCurrentUrl = sticker.img?.src; // 現在のURLを保存

        // blobUrlも更新（updateStickerImageUrlが参照するため）
        sticker.blobUrl = newURL;
        sticker.blobWithBorderUrl = null; // 縁取りなしなのでnull
        sticker.paddedBlobUrl = newURL;
        sticker.url = newURL;

        // 画像を設定して読み込みを待つ
        await new Promise((resolve) => {
          const img = sticker.img;
          if (!img) {
            resolve();
            return;
          }
          const onLoad = () => {
            img.removeEventListener("load", onLoad);
            img.removeEventListener("error", onError);
            // 古いURLを解放（現在使用中のURLは除外）
            if (
              oldBlobUrl &&
              oldBlobUrl !== newURL &&
              oldBlobUrl !== oldCurrentUrl
            )
              blobURLManager.revokeURL(oldBlobUrl, img);
            if (
              oldBlobWithBorderUrl &&
              oldBlobWithBorderUrl !== newURL &&
              oldBlobWithBorderUrl !== oldCurrentUrl
            )
              blobURLManager.revokeURL(oldBlobWithBorderUrl, img);
            if (
              oldPaddedBlobUrl &&
              oldPaddedBlobUrl !== newURL &&
              oldPaddedBlobUrl !== oldCurrentUrl
            )
              blobURLManager.revokeURL(oldPaddedBlobUrl, img);
            resolve();
          };
          const onError = () => {
            img.removeEventListener("load", onLoad);
            img.removeEventListener("error", onError);
            resolve();
          };
          img.addEventListener("load", onLoad);
          img.addEventListener("error", onError);
          img.src = newURL;
          if (img.complete) onLoad();
        });
      } else {
        // モード1,2（縁取りあり）: 縁取り+パディング付き画像のURLをセット
        const newURL = blobURLManager.createURL(result.resultBlob, sticker.img);
        const paddedBlobUrl = blobURLManager.createURL(
          result.paddedBlob,
          sticker.img,
        );

        sticker.borderWidth = result.borderWidth;
        sticker.blobWithBorderUrl = newURL;
        sticker.paddedBlobUrl = paddedBlobUrl;
        // blobUrlも更新（hasBorderがfalseの場合に使用される）
        sticker.blobUrl = paddedBlobUrl;

        // モードに応じた画像を表示
        console.log(
          `モード${nextBorderMode}の画像を表示: hasBorder=${sticker.hasBorder}`,
        );

        // 古いURLを保存（updateStickerImageUrlを呼ぶ前に）
        const oldCurrentUrl = sticker.img?.src;

        // モード0: 常にパディング付き画像
        // モード1,2: 縁取りONなら縁取り画像、OFFならパディング付き画像
        // 背景除去状態も考慮して表示画像を決定
        updateStickerImageUrl(sticker);

        // 新しいURLが設定された後に古いURLを解放
        const newCurrentUrl = sticker.img?.src;
        await new Promise((resolve) => {
          const img = sticker.img;
          if (!img) {
            // imgがない場合は古いURLを解放して終了
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

            // 画像が確実に読み込まれたことを確認
            if (img.naturalWidth > 0) {
              // 少し待ってから古いURLを解放（確実に新しいURLが使用されていることを確認）
              setTimeout(() => {
                const currentSrc = img.src;
                // 現在使用中のURLは除外
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

          // 既に読み込まれている場合でも、naturalWidthを確認
          if (img.complete && img.naturalWidth > 0) {
            setTimeout(onLoad, 10);
          } else {
            // タイムアウトを設定（5秒）
            setTimeout(() => {
              if (!isResolved) {
                onLoad(); // タイムアウトでも続行
              }
            }, 5000);
          }
        });
      }
    }
  }

  // DOMクラスを更新
  if (!sticker.hasBorder) {
    sticker.element.classList.add("no-border");
  } else {
    sticker.element.classList.remove("no-border");
  }

  // ヘルプステッカーの場合は縁取りを更新
  if (sticker.isHelpSticker) {
    updateHelpStickerBorder(sticker);
  }

  // ヘルプステッカーでない場合はDBに保存
  if (!sticker.isHelpSticker) {
    await updateStickerInDB(sticker.id, {
      hasBorder: sticker.hasBorder,
      borderMode: sticker.borderMode,
    });
  } else {
    // ヘルプステッカーはlocalStorageに保存
    updateHelpStickerState(sticker);
  }

  // ボタンの表示状態を更新
  updateInfoButtonVisibility();
}

/**
 * 背景除去処理（@imgly/background-removalを使用）
 * @param {Blob} blob - 元の画像Blob
 * @returns {Promise<Blob>} 背景除去済みのBlob
 */
async function removeBgFromBlob(blob) {
  try {
    // window.removeBackgroundはindex.htmlで定義されている
    if (!window.removeBackground) {
      throw new Error("背景除去ライブラリが読み込まれていません");
    }

    // パフォーマンス最適化: 背景除去前に画像を小さくリサイズ（800px以下）
    // 背景除去ライブラリは高解像度画像では遅いため、処理速度を優先
    const optimizedBlob = await resizeImageBlob(blob, 800);

    // Blobをbase64に変換
    const imageUrl = blobURLManager.createURL(optimizedBlob); // 一時的なURL
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageUrl;
    });

    // 背景除去を実行
    const resultBlob = await window.removeBackground(imageUrl);

    // クリーンアップ
    blobURLManager.revokeURL(imageUrl);

    // アルファチャンネルに閾値処理を適用（エッジをはっきりさせる）
    const solidifiedBlob = await solidifyAlphaChannel(resultBlob);

    // 透明ピクセルの比率を確認
    const isMostlyTransparent = await checkTransparencyRatio(
      solidifiedBlob,
      0.9,
    );
    if (isMostlyTransparent) {
      throw new Error("対象物が見つかりませんでした");
    }

    // 透明部分をトリミングして実際のコンテンツサイズにする
    const trimResult = await trimTransparentEdges(solidifiedBlob);

    // trimTransparentEdges関数が{blob, isValid}を返すように変更されている場合の対応
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

    return solidifiedBlob; // トリミングできなかった場合はsolidifiedBlobを返す
  } catch (error) {
    // エラーをそのまま上位に投げる（ログは上位で出力）
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
    const blobUrl = blobURLManager.createURL(blob); // 一時的なURL
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      // 画像を描画
      ctx.drawImage(img, 0, 0);

      // ピクセルデータを取得
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // アルファチャンネルに閾値処理を適用
      for (let i = 3; i < data.length; i += 4) {
        const alpha = data[i];
        // 閾値以上なら完全に不透明、以下なら完全に透明
        data[i] = alpha >= threshold ? 255 : 0;
      }

      // 処理後のデータを描画
      ctx.putImageData(imageData, 0, 0);

      // Blobに変換
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
 * また、画像が大部分透明になっていないかチェックする
 * @param {Blob} blob - 処理する画像Blob
 * @returns {Promise<{blob: Blob, isValid: boolean}>} トリミング後のBlobと有効性フラグ
 */
async function trimTransparentEdges(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blobUrl = blobURLManager.createURL(blob); // 一時的なURL
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      // 画像を描画
      ctx.drawImage(img, 0, 0);

      // ピクセルデータを取得
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const width = imageData.width;
      const height = imageData.height;

      // 不透明なピクセルをカウント
      let opaquePixels = 0;
      const totalPixels = width * height;

      // 不透明なピクセルの境界を見つける
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;

      // 境界を探索と不透明ピクセル数のカウント
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

      // 不透明ピクセルの割合を計算（0.0〜1.0）
      const opaqueRatio = opaquePixels / totalPixels;
      console.log(
        `背景除去結果: 不透明ピクセル ${opaquePixels}/${totalPixels} (${(opaqueRatio * 100).toFixed(2)}%)`,
      );

      // 不透明ピクセルが極端に少ない場合（例: 1%未満）は無効とする
      if (opaqueRatio < 0.01) {
        blobURLManager.revokeURL(blobUrl);
        console.warn(
          "背景除去後、対象物がほとんど見つかりませんでした。元の画像を使用します。",
        );
        resolve({ blob: blob, isValid: false });
        return;
      }

      // 安全マージン（px）
      const margin = 10;
      minX = Math.max(0, minX - margin);
      minY = Math.max(0, minY - margin);
      maxX = Math.min(width - 1, maxX + margin);
      maxY = Math.min(height - 1, maxY + margin);

      // トリミング範囲が有効か確認（内容がない場合）
      if (minX >= maxX || minY >= maxY) {
        blobURLManager.revokeURL(blobUrl);
        console.warn("トリミング範囲が無効です。元の画像を返します。");
        resolve({ blob: blob, isValid: false });
        return;
      }

      // トリミング後のサイズを計算
      const trimWidth = maxX - minX + 1;
      const trimHeight = maxY - minY + 1;

      // トリミングした画像を新しいキャンバスに描画
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

      // Blobに変換
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

// この関数は不要になったので削除（`toggleStickerBgRemoval`内で直接処理するようにリファクタリング）

/**
 * 画像の透明度を分析してほとんどが透明かどうかをチェック
 * @param {Blob} blob - チェックする画像のBlob
 * @param {number} threshold - 透明率の閾値（0.0〜1.0）
 * @returns {Promise<boolean>} ほとんどが透明ならtrue
 */
async function checkTransparencyRatio(blob, threshold = 0.9) {
  // blobが有効かチェック
  if (!blob || !(blob instanceof Blob)) {
    console.warn("無効なBlobが渡されました");
    return false;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const blobUrl = blobURLManager.createURL(blob); // 一時的なURL

    img.onload = () => {
      // 使用後にURLを解放
      blobURLManager.revokeURL(blobUrl);

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      // 画像を描画
      ctx.drawImage(img, 0, 0);

      try {
        // ピクセルデータを取得
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const totalPixels = canvas.width * canvas.height;
        let transparentPixels = 0;

        // 透明なピクセル（アルファ値が10未満）をカウント
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 10) {
            // アルファ値がほぼ0
            transparentPixels++;
          }
        }

        const transparentRatio = transparentPixels / totalPixels;
        console.log(
          `透明ピクセル: ${transparentPixels}/${totalPixels} (${(transparentRatio * 100).toFixed(2)}%)`,
        );

        // 閾値以上の透明度ならtrue
        resolve(transparentRatio >= threshold);
      } catch (e) {
        console.warn("透明度チェックエラー:", e);
        resolve(false); // エラーの場合は透明でないと判断
      }
    };

    img.onerror = () => {
      // エラー時にもURLを解放
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
    // 既に処理済みなら何もしない
    if (sticker.bgRemovalProcessed) {
      console.log("既に背景除去済みです");
      return;
    }

    // 前処理
    if (!sticker.blobUrl) {
      throw new Error("ステッカーのblobUrlが存在しません");
    }
    sticker.element.classList.add("processing"); // 処理中アニメーション表示

    // 背景除去開始のトースト表示
    showToast("背景除去を開始しています...");

    // ステップ1: 元画像を取得（originalBlobがあれば優先）
    let originalBlob;
    if (sticker.originalBlob) {
      originalBlob = sticker.originalBlob;
    } else {
      originalBlob = await fetchBlobFromUrl(sticker.blobUrl);
    }

    // ステップ2: 背景除去処理（画像は内部で最適化される）
    showToast("背景除去を処理中...");
    const removedBgBlob = await removeBgFromBlob(originalBlob);

    // ステップ3: 元画像の更新
    releaseOldUrls(sticker);
    updateStickerBaseImage(sticker, removedBgBlob);

    // ステップ4: 現在のモードに応じた縁取り・パディング適用
    showToast("縁取りを適用中...");
    await applyBorderAndPadding(sticker);

    // ステップ5: 完了処理
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
 * @returns {Promise<Blob>} - 取得したBlob
 */
async function fetchBlobFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`画像の取得に失敗しました: ${response.status}`);
  }
  return await response.blob();
}

/**
 * 古いURL参照を解放する（現在使用中のURLは除外）
 * @param {Object} sticker - ステッカーオブジェクト
 */
function releaseOldUrls(sticker, keepUrl = null) {
  // BlobURLManagerを使用して安全に解放
  blobURLManager.revokeStickerUrls(sticker, keepUrl);
}

/**
 * ステッカーの基本画像を更新する
 * @param {Object} sticker - ステッカーオブジェクト
 * @param {Blob} newBlob - 新しい画像Blob
 */
function updateStickerBaseImage(sticker, newBlob) {
  // 背景除去版を新しい「元画像」として扱う
  sticker.originalBlob = newBlob; // 元画像を背景除去版に置き換え
  sticker.blob = newBlob; // 表示用画像も背景除去版に

  // 古いURLを解放
  releaseOldUrls(sticker);

  // 新しいURLを設定（img要素に関連付けて追跡）
  const newBlobUrl = blobURLManager.createURL(newBlob, sticker.img);
  sticker.originalBlobUrl = newBlobUrl;
  sticker.blobUrl = newBlobUrl;
}

/**
 * 縁取りとパディングを適用する
 * @param {Object} sticker - ステッカーオブジェクト
 */
async function applyBorderAndPadding(sticker) {
  // 現在の設定を取得
  const hasBorder = sticker.hasBorder;
  const borderMode =
    sticker.borderMode !== undefined
      ? sticker.borderMode
      : STICKER_DEFAULTS.BORDER_MODE;

  // 画像サイズを取得
  const imageDimensions = await getImageDimensions(sticker.originalBlob);

  // 縁取り/パディング処理
  const result = await processBorderAndPadding(
    sticker.originalBlob,
    borderMode,
    imageDimensions.width,
    imageDimensions.height,
  );

  // 古いURLを保存（新しいURLを設定する前に）
  const oldBlobUrl = sticker.blobUrl;
  const oldBlobWithBorderUrl = sticker.blobWithBorderUrl;

  // モードに応じて画像を設定
  if (borderMode === 0 || !hasBorder) {
    // 縁取りなしの場合はパディング付き画像を使用
    sticker.blob = result.resultBlob;
    sticker.blobUrl = blobURLManager.createURL(result.resultBlob, sticker.img);
    sticker.blobWithBorder = null;
    sticker.blobWithBorderUrl = null;
  } else {
    // 縁取りありの場合は縁取り画像を設定
    sticker.blobWithBorder = result.borderBlob || result.resultBlob;
    sticker.blobWithBorderUrl = blobURLManager.createURL(
      sticker.blobWithBorder,
      sticker.img,
    );
    sticker.borderWidth = result.borderWidth;
  }

  // 新しいURLをDOMに設定してから、古いURLを解放（画像が読み込まれるまで待つ）
  if (sticker.img) {
    const newUrl = hasBorder ? sticker.blobWithBorderUrl : sticker.blobUrl;
    if (newUrl) {
      // BlobURLManagerを使用して安全に画像URLを更新
      await blobURLManager.updateImageUrl(sticker.img, newUrl);

      // 古いURLを解放（現在使用中のURLは除外）
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

  // 画像URLを更新（縁取り状態に応じて）
  updateStickerImageUrl(sticker);

  // DBに保存（背景除去後は元画像が更新されているため、通常の保存でOK）
  await updateStickerInDB(sticker.id, {
    originalBlob: removedBgBlob, // 元画像を更新（背景除去版）
    blob: sticker.blob, // 表示用画像（パディングあり/なし）
    blobWithBorder: sticker.blobWithBorder, // 縁取り版
    bgRemovalProcessed: true,
  });

  // UI更新
  updateInfoButtonVisibility();
  showToast("背景除去を適用しました");
}

/**
 * ステッカーの画像URLを更新（縁取り状態に応じて）
 * @param {Object} sticker - シールオブジェクト
 */
function updateStickerImageUrl(sticker) {
  if (!sticker.img) return;

  let newUrl;

  // 縁取りの状態のみを考慮（背景除去後は元画像が背景除去版になっている）
  newUrl = sticker.hasBorder ? sticker.blobWithBorderUrl : sticker.blobUrl;

  if (newUrl) {
    sticker.img.src = newUrl;
    sticker.url = newUrl;
  }
}

/**
 * URLからBlobを取得（ヘルパー関数）
 * @param {string} url - 画像URL
 * @returns {Promise<Blob|null>} Blob
 */
async function getBlobFromURL(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return blob;
  } catch (error) {
    console.warn("URLからBlobの取得に失敗:", error);
    return null;
  }
}

/**
 * 画像Blobのサイズを取得（デバッグ用）
 * @param {Blob} blob - 画像Blob
 * @returns {Promise<{width: number, height: number}>} 画像サイズ
 */
async function getImageDimensions(blob) {
  return new Promise((resolve) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      resolve({ width: 0, height: 0, error: true });
    };
    img.src = blobUrl;
  });
}

/**
 * ステッカーをコピー（UI操作用）
 * @param {Object} sticker - コピーするステッカー
 * @returns {Promise<boolean>} 成功した場合はtrue
 */
export async function copySticker(sticker) {
  if (!sticker) {
    console.warn("コピーするステッカーが指定されていません");
    return false;
  }

  try {
    // state.jsのcopySticker関数を使ってステッカー情報をメモリに保存（非同期対応）
    const identifier = await state.copySticker(sticker);

    // システムクリップボードに特殊識別子をコピー（Safari対応）
    try {
      await navigator.clipboard.writeText(identifier);
    } catch (clipboardErr) {
      // SafariでクリップボードAPIが失敗する場合、メモリ保存のみで続行
      console.warn(
        "クリップボードへの書き込みに失敗しました（メモリ保存は成功）:",
        clipboardErr,
      );
      // メモリ保存は成功しているので、コピーは成功とみなす
    }

    // コピー成功を通知
    showToast("コピーしました");
    return true;
  } catch (err) {
    console.warn("ステッカーのコピーに失敗しました:", err);
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
  // メモリからコピーデータを取得
  const copiedData = state.getCopiedStickerData();

  if (!copiedData) {
    // リロード直後など復元が未完了の可能性があるため、復元を試みる
    try {
      if (typeof state.restoreCopiedStickerData === "function") {
        await state.restoreCopiedStickerData();
      }
    } catch (e) {
      // 復元失敗は後続のnullチェックで処理
    }
    const retried = state.getCopiedStickerData();
    if (!retried) {
      console.warn("コピーされたステッカーがありません");
      return false;
    }
    // 復元できた場合は以降の処理で使用
    return await pasteSticker(x, yPercent);
  }

  try {
    // 座標の調整
    const adjustedYPercent = typeof yPercent === "number" ? yPercent : 50;
    const xOffset = typeof x === "number" ? x : 0;

    let blob = null;

    // 優先順位：1. Blobデータ 2. URL
    if (copiedData.originalBlob) {
      // IndexedDBから復元したBlobデータを直接使用
      blob = copiedData.originalBlob;
    } else if (copiedData.originalBlobUrl || copiedData.blobUrl) {
      // 後方互換性のために残す：URLがある場合はfetchしてみる
      try {
        const url = copiedData.originalBlobUrl || copiedData.blobUrl;
        const blobResponse = await fetch(url);
        blob = await blobResponse.blob();
      } catch (fetchErr) {
        console.warn("URLからのBlob取得に失敗:", fetchErr);
        throw new Error("コピーしたステッカーデータを取得できません");
      }
    } else {
      throw new Error("コピーしたステッカーデータが無効です");
    }

    if (!blob) {
      throw new Error("有効な画像データがありません");
    }

    // 新しいステッカーとして追加
    await addStickerFromBlob(
      blob,
      xOffset,
      adjustedYPercent,
      copiedData.width,
      copiedData.rotation,
      null, // 新しいIDが自動生成される
      null, // 新しいz-indexが自動生成される
      copiedData.hasBorder,
      copiedData.borderMode,
    );

    return true;
  } catch (err) {
    console.warn("ステッカーのペーストに失敗しました:", err);
    showToast("ペーストに失敗しました");
    return false;
  }
}
