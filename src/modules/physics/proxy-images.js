/**
 * プロキシ画像管理モジュール
 * 物理モード中のパフォーマンス最適化のために低解像度プロキシ画像を管理
 */

import { state } from "../../state.js";
import { logger } from "../../utils/logger.js";
import { resizeImageBlob } from "../sticker.js";

// ========================================
// プロキシ画像管理
// ========================================
const proxyUrlMap = new Map(); // stickerId -> proxy blob URL
const originalUrlMap = new Map(); // stickerId -> original high-res URL

/**
 * 全ステッカーの低解像度プロキシ画像を生成
 */
export async function generateProxyImages() {
  const PROXY_SIZE = 400; // プロキシ画像のサイズ（元画像1000pxから縮小）

  const proxyPromises = state.stickers.map(async (sticker) => {
    // ヘルプステッカーや固定されたステッカーはスキップ
    if (sticker.isHelpSticker || sticker.isPinned) {
      return;
    }

    // img要素を取得
    const img = sticker.imgWrapper?.querySelector("img");
    if (!img || !img.src) {
      return;
    }

    try {
      // 現在表示されている画像URLからBlobを取得
      const response = await fetch(img.src);
      const sourceBlob = await response.blob();

      // 低解像度プロキシを生成（現在表示されている縁取り付き画像から）
      const { blob: proxyBlob } = await resizeImageBlob(sourceBlob, PROXY_SIZE);
      const proxyUrl = URL.createObjectURL(proxyBlob);

      // 元のURLを保存
      originalUrlMap.set(sticker.id, img.src);

      // プロキシURLを保存
      proxyUrlMap.set(sticker.id, proxyUrl);

      // 画像をプロキシに切り替え
      img.src = proxyUrl;
    } catch (error) {
      logger.warn(
        `プロキシ画像の生成に失敗: ステッカーID ${sticker.id}`,
        error,
      );
    }
  });

  await Promise.all(proxyPromises);
  logger.log(`物理モード: ${proxyUrlMap.size}個のプロキシ画像を生成しました`);
}

/**
 * プロキシ画像を元の高解像度画像に戻す
 */
export async function restoreOriginalImages() {
  const restorePromises = Array.from(originalUrlMap.entries()).map(
    async ([stickerId, originalUrl]) => {
      const sticker = state.getStickerById(stickerId);
      if (!sticker) return;

      const img = sticker.imgWrapper?.querySelector("img");
      if (!img) return;

      // 元の画像に戻す
      img.src = originalUrl;

      // プロキシURLをクリーンアップ
      const proxyUrl = proxyUrlMap.get(stickerId);
      if (proxyUrl) {
        URL.revokeObjectURL(proxyUrl);
      }
    },
  );

  await Promise.all(restorePromises);

  // マップをクリア
  proxyUrlMap.clear();
  originalUrlMap.clear();

  logger.log("物理モード: 元の高解像度画像に復元しました");
}
