import { state } from "../state.js";
import { STICKER_DEFAULTS, MESSAGES, HELP_STICKER_CONFIG } from "./constants.js";
import {
  saveStickerToDB,
  updateStickerInDB,
  deleteStickerFromDB,
} from "./db.js";
import { elements, showToast, updateInfoButtonVisibility, updateHelpStickerState, clearHelpStickerState } from "./ui.js";
import { attachStickerEventListeners } from "./events.js";

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

  // 画像ラッパー（回転用）
  const imgWrapper = document.createElement("div");
  imgWrapper.className = "sticker-img-wrapper";
  imgWrapper.style.transform = `rotate(${rotation}deg)`;
  imgWrapper.appendChild(img);

  stickerDiv.appendChild(imgWrapper);

  // スタイルを設定（X:画面中央基準のピクセル値、Y:パーセント値）
  stickerDiv.style.left = `calc(50% + ${x}px)`;
  stickerDiv.style.top = `${yPercent}%`;
  stickerDiv.style.width = `${width}px`;
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

  // イベントリスナーを登録
  attachStickerEventListeners(stickerDiv, stickerId);

  // DOMに追加
  elements.canvas.appendChild(stickerDiv);

  // 状態に追加
  state.addSticker({
    id: stickerId,
    url: url,
    x: x,
    yPercent: yPercent,
    width: width,
    rotation: rotation,
    zIndex: actualZIndex,
    element: stickerDiv,
    imgWrapper: imgWrapper,
  });

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
      duration: 5000, // 5秒間表示
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
  // ヘルプステッカーなどimgWrapperがない場合はスキップ
  if (sticker.imgWrapper) {
    // ヘルプステッカーの場合はscaleも考慮
    if (sticker.isHelpSticker) {
      const scale = sticker.width / HELP_STICKER_CONFIG.BASE_WIDTH;
      sticker.imgWrapper.style.transform = `rotate(${rotation}deg) scale(${scale})`;
    } else {
      sticker.imgWrapper.style.transform = `rotate(${rotation}deg)`;
    }
  }
}

/**
 * シールのサイズを更新
 * @param {Object} sticker - シールオブジェクト
 * @param {number} width - 幅（px）
 */
export function updateStickerSize(sticker, width) {
  // ヘルプステッカーの場合はscaleを使用
  if (sticker.isHelpSticker) {
    // デスクトップでは固定最大値、スマホでは画面幅に応じて
    const isMobile = window.innerWidth <= 768;
    const maxWidth = isMobile 
      ? Math.min(HELP_STICKER_CONFIG.MAX_WIDTH_DESKTOP, window.innerWidth * HELP_STICKER_CONFIG.MAX_WIDTH_MOBILE_PERCENT / 100)
      : HELP_STICKER_CONFIG.MAX_WIDTH_DESKTOP;
    
    const constrainedWidth = Math.max(
      HELP_STICKER_CONFIG.MIN_WIDTH,
      Math.min(maxWidth, width),
    );
    
    const scale = constrainedWidth / HELP_STICKER_CONFIG.BASE_WIDTH;
    sticker.width = constrainedWidth;
    sticker.element.style.width = `${HELP_STICKER_CONFIG.BASE_WIDTH}px`; // 固定幅
    
    // scaleとrotationの両方を適用
    if (sticker.imgWrapper) {
      sticker.imgWrapper.style.transform = `rotate(${sticker.rotation}deg) scale(${scale})`;
    }
    return;
  }
  
  // 通常のステッカー
  // 画面幅に応じた最大サイズを計算
  const maxWidthByScreen = (window.innerWidth * STICKER_DEFAULTS.MAX_WIDTH_PERCENT) / 100;
  const effectiveMaxWidth = Math.min(STICKER_DEFAULTS.MAX_WIDTH, maxWidthByScreen);
  
  const constrainedWidth = Math.max(
    STICKER_DEFAULTS.MIN_WIDTH,
    Math.min(effectiveMaxWidth, width),
  );

  sticker.width = constrainedWidth;
  sticker.element.style.width = `${constrainedWidth}px`;
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
