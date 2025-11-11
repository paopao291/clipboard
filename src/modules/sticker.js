import { state } from "../state.js";
import { STICKER_DEFAULTS, HELP_STICKER_CONFIG } from "./constants.js";
import {
  saveStickerToDB,
  updateStickerInDB,
  deleteStickerFromDB,
} from "./db.js";
import { elements, showToast, updateInfoButtonVisibility, updateHelpStickerState, clearHelpStickerState } from "./ui.js";
import { attachStickerEventListeners } from "./events.js";
import { isPhysicsActive, addPhysicsBody, removePhysicsBody } from "./physics.js";

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
      ? Math.min(HELP_STICKER_CONFIG.MAX_WIDTH_DESKTOP, window.innerWidth * HELP_STICKER_CONFIG.MAX_WIDTH_MOBILE_PERCENT / 100)
      : HELP_STICKER_CONFIG.MAX_WIDTH_DESKTOP;
    return {
      minWidth: HELP_STICKER_CONFIG.MIN_WIDTH,
      maxWidth: maxWidth,
    };
  } else {
    const maxWidthByScreen = (window.innerWidth * STICKER_DEFAULTS.MAX_WIDTH_PERCENT) / 100;
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
 */
export async function addStickerFromBlob(
  blob,
  x,
  yPercent,
  width = STICKER_DEFAULTS.WIDTH,
  rotation = STICKER_DEFAULTS.ROTATION,
  id = null,
  zIndex = null,
) {
  const stickerId = id || Date.now();
  const url = URL.createObjectURL(blob);

  // DOMに追加
  const actualZIndex = addStickerToDOM(
    url,
    x,
    yPercent,
    width,
    rotation,
    stickerId,
    zIndex,
  );

  // IndexedDBに保存
  await saveStickerToDB({
    id: stickerId,
    blob: blob,
    x: x,
    yPercent: yPercent,
    width: width,
    rotation: rotation,
    zIndex: actualZIndex,
    timestamp: Date.now(),
  });

  // 追加したステッカーを選択状態にする
  const addedSticker = state.getStickerById(stickerId);
  if (addedSticker) {
    state.selectSticker(addedSticker);
    updateInfoButtonVisibility();
  }
}

/**
 * シール（画像）をDOMに追加
 * @param {string} url - 画像URL
 * @param {number} x - 画面中央からのX座標オフセット（px）
 * @param {number} yPercent - 画面高さに対するY座標の割合（0-100）
 * @param {number} width - 幅（px）
 * @param {number} rotation - 回転角度
 * @param {number|null} id - シールID
 * @param {number|null} zIndex - z-index
 * @returns {number} 実際のz-index
 */
export function addStickerToDOM(
  url,
  x,
  yPercent,
  width = STICKER_DEFAULTS.WIDTH,
  rotation = STICKER_DEFAULTS.ROTATION,
  id = null,
  zIndex = null,
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
    x: x,
    yPercent: yPercent,
    width: width,
    rotation: rotation,
    zIndex: actualZIndex,
    element: stickerDiv,
    imgWrapper: imgWrapper,
  };
  state.addSticker(stickerObject);
  
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
      x: sticker.x,
      yPercent: sticker.yPercent,
      width: sticker.width,
      rotation: sticker.rotation,
      zIndex: sticker.zIndex,
      element: sticker.element,
      imgWrapper: sticker.imgWrapper,
      isHelpSticker: sticker.isHelpSticker,
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
 * ステッカーを最前面に移動
 * @param {Object} sticker - シールオブジェクト
 */
export async function bringToFront(sticker) {
  const newZIndex = state.incrementZIndex();
  sticker.element.style.zIndex = newZIndex;
  sticker.zIndex = newZIndex;

  // ヘルプステッカーはDBに保存しない
  if (!sticker.isHelpSticker) {
    await updateStickerInDB(sticker.id, { zIndex: newZIndex });
  }
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
}

/**
 * シールの変更をDBに保存
 * @param {Object} sticker - シールオブジェクト
 */
export async function saveStickerChanges(sticker) {
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
    showToast('位置を保存しました');
  }
}
