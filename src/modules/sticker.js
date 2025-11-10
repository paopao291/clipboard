import { state } from "../state.js";
import { STICKER_DEFAULTS, MESSAGES } from "./constants.js";
import {
  saveStickerToDB,
  updateStickerInDB,
  deleteStickerFromDB,
} from "./db.js";
import { elements, showToast, updateInfoButtonVisibility } from "./ui.js";
import { attachStickerEventListeners } from "./events.js";

/**
 * Blobからシールを追加
 * @param {Blob} blob - 画像Blob
 * @param {number} x - 画面中央からのX座標オフセット
 * @param {number} y - 画面中央からのY座標オフセット
 * @param {number} width - 幅
 * @param {number} rotation - 回転角度
 * @param {number|null} id - シールID
 * @param {number|null} zIndex - z-index
 */
export async function addStickerFromBlob(
  blob,
  x,
  y,
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
    y,
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
    y: y,
    width: width,
    rotation: rotation,
    zIndex: actualZIndex,
    timestamp: Date.now(),
  });
}

/**
 * シール（画像）をDOMに追加
 * @param {string} url - 画像URL
 * @param {number} x - 画面中央からのX座標オフセット
 * @param {number} y - 画面中央からのY座標オフセット
 * @param {number} width - 幅
 * @param {number} rotation - 回転角度
 * @param {number|null} id - シールID
 * @param {number|null} zIndex - z-index
 * @returns {number} 実際のz-index
 */
export function addStickerToDOM(
  url,
  x,
  y,
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

  // スタイルを設定（画面中央からのオフセット）
  stickerDiv.style.left = `calc(50% + ${x}px)`;
  stickerDiv.style.top = `calc(50% + ${y}px)`;
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
    y: y,
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
 * シールを削除（元に戻す機能付き）
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

    // 削除データを一時保存（元に戻すために必要なデータ）
    const stickerData = {
      id: sticker.id,
      url: sticker.url,
      x: sticker.x,
      y: sticker.y,
      width: sticker.width,
      rotation: sticker.rotation,
      zIndex: sticker.zIndex,
      element: sticker.element,
      imgWrapper: sticker.imgWrapper,
    };

    let deleteTimeout = null;

    // 「元に戻す」トーストを表示
    showToast("削除しました", {
      actionText: "元に戻す",
      duration: 5000, // 5秒間表示
      onAction: () => {
        // タイムアウトをキャンセル
        if (deleteTimeout) {
          clearTimeout(deleteTimeout);
        }
        // 元に戻す処理
        undoRemoveSticker(stickerData);
      },
    });

    // 5秒後に完全削除（元に戻すが押されなかった場合）
    deleteTimeout = setTimeout(async () => {
      // DOM要素を完全に削除
      sticker.element.remove();

      // IndexedDBから削除
      await deleteStickerFromDB(id);
    }, 5300); // トーストのフェードアウト時間を考慮して少し長めに設定
  }
}

/**
 * シールの削除を取り消す
 * @param {Object} stickerData - シールデータ
 */
function undoRemoveSticker(stickerData) {
  // DOM要素を再表示
  stickerData.element.style.display = "";

  // 状態に再追加
  state.addSticker(stickerData);

  // インフォボタンの表示状態を更新
  updateInfoButtonVisibility();

  // 元に戻したことを通知
  showToast("元に戻しました");
}

/**
 * ステッカーを最前面に移動
 * @param {Object} sticker - シールオブジェクト
 */
export async function bringToFront(sticker) {
  const newZIndex = state.incrementZIndex();
  sticker.element.style.zIndex = newZIndex;
  sticker.zIndex = newZIndex;

  // IndexedDBに保存
  await updateStickerInDB(sticker.id, { zIndex: newZIndex });
}

/**
 * シールの位置を更新
 * @param {Object} sticker - シールオブジェクト
 * @param {number} x - 画面中央からのX座標オフセット
 * @param {number} y - 画面中央からのY座標オフセット
 */
export function updateStickerPosition(sticker, x, y) {
  sticker.x = x;
  sticker.y = y;
  sticker.element.style.left = `calc(50% + ${x}px)`;
  sticker.element.style.top = `calc(50% + ${y}px)`;
}

/**
 * シールの回転を更新
 * @param {Object} sticker - シールオブジェクト
 * @param {number} rotation - 回転角度
 */
export function updateStickerRotation(sticker, rotation) {
  sticker.rotation = rotation;
  sticker.imgWrapper.style.transform = `rotate(${rotation}deg)`;
}

/**
 * シールのサイズを更新
 * @param {Object} sticker - シールオブジェクト
 * @param {number} width - 幅
 */
export function updateStickerSize(sticker, width) {
  const constrainedWidth = Math.max(
    STICKER_DEFAULTS.MIN_WIDTH,
    Math.min(STICKER_DEFAULTS.MAX_WIDTH, width),
  );

  sticker.width = constrainedWidth;
  sticker.element.style.width = `${constrainedWidth}px`;
}

/**
 * シールの変更をDBに保存
 * @param {Object} sticker - シールオブジェクト
 */
export async function saveStickerChanges(sticker) {
  await updateStickerInDB(sticker.id, {
    x: sticker.x,
    y: sticker.y,
    width: sticker.width,
    rotation: sticker.rotation,
  });
}
