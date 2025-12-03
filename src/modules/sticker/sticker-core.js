/**
 * sticker-core.js
 * ステッカーのDOM操作と基本的なCRUD機能を提供
 */

import { state } from "../../state.js";
import { logger } from "../../utils/logger.js";
import { STICKER_DEFAULTS, HELP_STICKER_CONFIG } from "../constants.js";
import {
  saveStickerToDB,
  updateStickerInDB,
  deleteStickerFromDB,
} from "../db.js";
import {
  elements,
  showToast,
  updateInfoButtonVisibility,
  updateHelpStickerState,
  clearHelpStickerState,
  updateHelpStickerBorder,
} from "../ui.js";
import { attachStickerEventListeners } from "../events.js";
import {
  isPhysicsActive,
  addPhysicsBody,
  removePhysicsBody,
} from "../physics.js";
import { blobURLManager } from "../blob-url-manager.js";
import { applyStickerTransform } from "./sticker-transforms.js";

/**
 * ステッカーの基準幅を取得
 * @param {Object} sticker - シールオブジェクト
 * @returns {number} 基準幅
 */
export function getBaseWidth(sticker) {
  return sticker.isHelpSticker
    ? HELP_STICKER_CONFIG.BASE_WIDTH
    : STICKER_DEFAULTS.BASE_WIDTH;
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
 * @param {boolean} bgRemovalProcessed - 背景除去済みフラグ
 * @param {Blob} originalBlob - リサイズ済み・パディング/縁取り前の元画像Blob（優先使用）
 * @param {string} originalType - 元の画像タイプ（WebP変換前）
 * @param {boolean} hasTransparencyFlag - 透過の有無
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
  originalBlobUrl = null,
  bgRemovalProcessed = false,
  originalBlob = null,
  originalType = null,
  hasTransparencyFlag = null,
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
  stickerDiv.style.width = `${STICKER_DEFAULTS.BASE_WIDTH}px`;
  stickerDiv.style.transform = `translate(-50%, -50%)`;

  // z-indexを設定
  let actualZIndex;
  if (zIndex !== null) {
    actualZIndex = zIndex;
    stickerDiv.style.zIndex = zIndex;
    state.updateZIndexCounter(zIndex);
  } else {
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
    originalBlobUrl: originalBlobUrl,
    originalBlob: originalBlob,
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
    originalType: originalType,
    hasTransparency: hasTransparencyFlag,
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
  stickerDiv.classList.add(`border-mode-${borderMode}`);

  // transformを適用（scaleと回転）- FOUCを防ぐため同期的に適用
  applyStickerTransform(stickerObject);

  // 物理モードが有効な場合は物理ボディを追加
  if (isPhysicsActive()) {
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
    sticker.element.classList.remove("being-deleted");
    sticker.element.style.display = "none";

    if (isPhysicsActive()) {
      removePhysicsBody(id);
    }

    if (sticker.img) {
      blobURLManager.revokeAllForImage(sticker.img);
    }

    state.showUI();
    updateInfoButtonVisibility();

    if (sticker.isHelpSticker) {
      clearHelpStickerState();
    }

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

    showToast("削除しました", {
      actionText: "戻す",
      duration: 4000,
      onAction: () => {
        if (deleteTimeout) {
          clearTimeout(deleteTimeout);
        }
        undoRemoveSticker(stickerData);
      },
    });

    deleteTimeout = setTimeout(async () => {
      sticker.element.remove();
      releaseOldUrls(sticker);
      if (sticker.paddedBlobUrl) URL.revokeObjectURL(sticker.paddedBlobUrl);

      if (!sticker.isHelpSticker) {
        await deleteStickerFromDB(id);
      }
    }, 5300);
  }
}

/**
 * シールの削除を取り消す
 * @param {Object} stickerData - シールデータ
 */
async function undoRemoveSticker(stickerData) {
  const { updateStickerPosition } = await import("./sticker-transforms.js");
  const { bringToFront } = await import("./sticker-transforms.js");

  stickerData.element.style.display = "";
  updateStickerPosition(stickerData, 0, 50);
  state.addSticker(stickerData);

  if (stickerData.isPinned) {
    stickerData.element.classList.add("pinned");
  }

  if (stickerData.hasBorder === false) {
    stickerData.element.classList.add("no-border");
  } else {
    stickerData.element.classList.remove("no-border");
  }

  state.selectSticker(stickerData);
  await bringToFront(stickerData);

  if (stickerData.isHelpSticker) {
    updateHelpStickerState(stickerData);
  }

  updateInfoButtonVisibility();
}

/**
 * シールの変更をDBに保存
 * @param {Object} sticker - シールオブジェクト
 */
export async function saveStickerChanges(sticker) {
  if (!sticker) {
    logger.warn("saveStickerChanges: sticker is null");
    return;
  }

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
    if (!sticker.isHelpSticker) {
      return saveStickerChanges(sticker);
    } else {
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

  if (sticker.isPinned) {
    sticker.element.classList.add("pinned");
  } else {
    sticker.element.classList.remove("pinned");
  }

  if (!sticker.isHelpSticker) {
    await updateStickerInDB(sticker.id, { isPinned: sticker.isPinned });
  } else {
    updateHelpStickerState(sticker);
  }

  updateInfoButtonVisibility();
}

/**
 * 古いURL参照を解放する（現在使用中のURLは除外）
 * @param {Object} sticker - ステッカーオブジェクト
 */
export function releaseOldUrls(sticker, keepUrl = null) {
  blobURLManager.revokeStickerUrls(sticker, keepUrl);
}
