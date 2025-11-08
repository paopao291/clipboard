import { state } from "../state.js";
import { RESIZE_CONFIG, PASTE_AREA_CONFIG, MESSAGES } from "./constants.js";
import {
  addStickerFromBlob,
  bringToFront,
  updateStickerPosition,
  updateStickerRotation,
  updateStickerSize,
  saveStickerChanges,
} from "./sticker.js";
import { elements, showToast, updateInfoButtonVisibility } from "./ui.js";

let wheelTimeout = null;

/**
 * ペーストイベントハンドラー
 * @param {ClipboardEvent} e
 */
export async function handlePaste(e) {
  e.preventDefault();

  console.log("Paste event triggered");
  console.log("clipboardData:", e.clipboardData);
  console.log("items:", e.clipboardData?.items);

  const items = e.clipboardData.items;
  let hasImage = false;

  if (!items) {
    console.error("clipboardData.items is not available");
    showToast("ペースト機能が利用できません");
    return;
  }

  for (let item of items) {
    console.log("Item type:", item.type);
    if (item.type.indexOf("image") !== -1) {
      hasImage = true;
      const blob = item.getAsFile();
      console.log("Image blob:", blob);

      // タッチ位置があればその位置に、なければ中央に配置
      const x = state.lastTouchX || window.innerWidth / 2;
      const y = state.lastTouchY || window.innerHeight / 2;

      // Blobを追加
      await addStickerFromBlob(blob, x, y);

      showToast(MESSAGES.IMAGE_ADDED);

      // ペーストエリアのフォーカスを外す
      elements.pasteArea.blur();

      break;
    }
  }

  // 画像以外がペーストされた場合、写真ライブラリを開く
  if (!hasImage) {
    console.log("No image found in clipboard");
    elements.galleryInput.click();
    showToast(MESSAGES.SELECT_FROM_LIBRARY);
  }
}

/**
 * ファイル選択ハンドラー
 * @param {Event} e
 */
export async function handleFileSelect(e) {
  const files = e.target.files;

  if (files.length === 0) return;

  let addedCount = 0;

  for (let file of files) {
    if (file.type.indexOf("image") !== -1) {
      // 画像を少しずつずらして配置
      const offsetX = addedCount * 30;
      const offsetY = addedCount * 30;
      const x = state.lastTouchX
        ? state.lastTouchX + offsetX
        : window.innerWidth / 2 + offsetX;
      const y = state.lastTouchY
        ? state.lastTouchY + offsetY
        : window.innerHeight / 2 + offsetY;
      await addStickerFromBlob(file, x, y);

      addedCount++;
    }
  }

  if (addedCount > 0) {
    showToast(MESSAGES.IMAGES_ADDED(addedCount));
  }

  // 入力をリセット
  e.target.value = "";
}

/**
 * キャンバスマウスダウン（選択解除）
 * @param {MouseEvent} e
 */
export function handleCanvasMouseDown(e) {
  if (e.target === elements.canvas || e.target === elements.pasteArea) {
    state.deselectAll();
    updateInfoButtonVisibility();
  }
}

/**
 * キャンバスタッチスタート（フォーカス用と選択解除）
 * @param {TouchEvent} e
 */
export function handleCanvasTouchStart(e) {
  if (e.target === elements.canvas || e.target === elements.pasteArea) {
    const touch = e.touches[0];
    state.setLastTouchPosition(touch.clientX, touch.clientY);

    // ペーストエリアをタッチ位置に移動
    elements.pasteArea.style.left = `${touch.clientX - 50}px`;
    elements.pasteArea.style.top = `${touch.clientY - 50}px`;
    elements.pasteArea.style.width = `${PASTE_AREA_CONFIG.TOUCH_SIZE}px`;
    elements.pasteArea.style.height = `${PASTE_AREA_CONFIG.TOUCH_SIZE}px`;

    state.deselectAll();
    updateInfoButtonVisibility();

    // ペーストエリアにフォーカス
    elements.pasteArea.focus();
  }
}

/**
 * シールマウスダウンイベント
 * @param {MouseEvent} e
 * @param {number} id - シールID
 */
export function handleStickerMouseDown(e, id) {
  e.preventDefault();
  e.stopPropagation();

  const sticker = state.getStickerById(id);
  if (!sticker) return;

  state.selectSticker(sticker);
  updateInfoButtonVisibility();
  bringToFront(sticker);

  // Shiftキーが押されていたら回転モード
  if (e.shiftKey) {
    const rect = sticker.element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const angle =
      Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    state.startRotating(angle);
    sticker.element.classList.add("rotating");
  } else {
    // ドラッグモード
    state.startDragging(e.clientX, e.clientY);
  }
}

/**
 * マウス移動イベント
 * @param {MouseEvent} e
 */
export function handleMouseMove(e) {
  if (!state.selectedSticker) return;

  if (state.isDragging) {
    const newX = e.clientX - state.dragStartX;
    const newY = e.clientY - state.dragStartY;
    updateStickerPosition(state.selectedSticker, newX, newY);
  } else if (state.isRotating) {
    const rect = state.selectedSticker.element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const angle =
      Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    const rotation = angle - state.startAngle;
    updateStickerRotation(state.selectedSticker, rotation);
  }
}

/**
 * マウスアップイベント
 * @param {MouseEvent} e
 */
export async function handleMouseUp(e) {
  if (state.isDragging || state.isRotating) {
    if (state.selectedSticker) {
      state.selectedSticker.element.classList.remove("rotating");
      await saveStickerChanges(state.selectedSticker);
    }
    state.endInteraction();
  }
}

/**
 * マウスホイールイベント（拡大縮小）
 * @param {WheelEvent} e
 * @param {number} id - シールID
 */
export async function handleWheel(e, id) {
  e.preventDefault();
  e.stopPropagation();

  const sticker = state.getStickerById(id);
  if (!sticker) return;

  const delta =
    e.deltaY > 0 ? -RESIZE_CONFIG.WHEEL_DELTA : RESIZE_CONFIG.WHEEL_DELTA;
  const newWidth = sticker.width + delta;
  updateStickerSize(sticker, newWidth);

  // デバウンスしてDBに保存
  if (wheelTimeout) clearTimeout(wheelTimeout);
  wheelTimeout = setTimeout(async () => {
    await saveStickerChanges(sticker);
  }, RESIZE_CONFIG.DEBOUNCE_MS);
}

/**
 * シールタッチスタートイベント
 * @param {TouchEvent} e
 * @param {number} id - シールID
 */
export function handleStickerTouchStart(e, id) {
  e.preventDefault();
  e.stopPropagation();

  const sticker = state.getStickerById(id);
  if (!sticker) return;

  state.selectSticker(sticker);
  updateInfoButtonVisibility();
  bringToFront(sticker);

  const touches = e.touches;

  if (touches.length === 1) {
    // 1本指：ドラッグ
    state.startDragging(touches[0].clientX, touches[0].clientY);
  } else if (touches.length === 2) {
    // 2本指：拡大縮小と回転
    const touch1 = touches[0];
    const touch2 = touches[1];

    // 初期距離を保存（拡大縮小用）
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    state.startPinch(distance, sticker.width);

    // 初期角度を保存（回転用）
    const angle =
      Math.atan2(
        touch2.clientY - touch1.clientY,
        touch2.clientX - touch1.clientX,
      ) *
      (180 / Math.PI);
    state.startRotating(angle);
  }
}

/**
 * タッチ移動イベント
 * @param {TouchEvent} e
 */
export function handleTouchMove(e) {
  if (!state.selectedSticker) return;

  const touches = e.touches;

  if (state.isDragging && touches.length === 1) {
    e.preventDefault();

    const newX = touches[0].clientX - state.dragStartX;
    const newY = touches[0].clientY - state.dragStartY;
    updateStickerPosition(state.selectedSticker, newX, newY);
  } else if (state.isRotating && touches.length === 2) {
    e.preventDefault();

    const touch1 = touches[0];
    const touch2 = touches[1];

    // 拡大縮小
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const scale = distance / state.initialPinchDistance;
    const newWidth = state.initialWidth * scale;
    updateStickerSize(state.selectedSticker, newWidth);

    // 回転
    const angle =
      Math.atan2(
        touch2.clientY - touch1.clientY,
        touch2.clientX - touch1.clientX,
      ) *
      (180 / Math.PI);
    const rotation = angle - state.startAngle;
    updateStickerRotation(state.selectedSticker, rotation);
  }
}

/**
 * タッチ終了イベント
 * @param {TouchEvent} e
 */
export async function handleTouchEnd(e) {
  if (state.isDragging || state.isRotating) {
    if (state.selectedSticker) {
      state.selectedSticker.element.classList.remove("rotating");
      await saveStickerChanges(state.selectedSticker);
    }
    state.endInteraction();
  }
}

/**
 * ペーストエリアブラーイベント
 */
export function handlePasteAreaBlur() {
  // テキストをクリア
  elements.pasteArea.value = "";

  // ペーストエリアを元の位置に戻す
  elements.pasteArea.style.left = "0";
  elements.pasteArea.style.top = "0";
  elements.pasteArea.style.width = "100%";
  elements.pasteArea.style.height = "100%";
}

/**
 * ペーストエリア入力イベント
 * @param {Event} e
 */
export function handlePasteAreaInput(e) {
  // 画像以外のコンテンツがペーストされた場合、すぐにクリア
  setTimeout(() => {
    elements.pasteArea.value = "";
  }, PASTE_AREA_CONFIG.CLEAR_DELAY_MS);
}

/**
 * キーダウンイベント（キーボード入力を防ぐ）
 * @param {KeyboardEvent} e
 */
export function handlePasteAreaKeydown(e) {
  // ペースト操作のみ許可
  if ((e.ctrlKey || e.metaKey) && e.key === "v") {
    return;
  }
  e.preventDefault();
}

/**
 * すべてのイベントリスナーをシールに登録
 * @param {HTMLElement} stickerElement - シール要素
 * @param {number} id - シールID
 */
export function attachStickerEventListeners(stickerElement, id) {
  stickerElement.addEventListener("mousedown", (e) =>
    handleStickerMouseDown(e, id),
  );
  stickerElement.addEventListener("wheel", (e) => handleWheel(e, id));
  stickerElement.addEventListener(
    "touchstart",
    (e) => handleStickerTouchStart(e, id),
    { passive: false },
  );
}
