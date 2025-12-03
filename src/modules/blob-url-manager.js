/**
 * Blob URL管理モジュール
 * blob URLの作成、追跡、安全な解放を一元管理
 */

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
      logger.warn("Failed to revoke blob URL:", error);
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
        logger.warn("Failed to revoke temp URL:", error);
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

// グローバルなBlobURLManagerインスタンスをエクスポート
export const blobURLManager = new BlobURLManager();
export { BlobURLManager };
