import { state } from "../state.js";
import { RESIZE_CONFIG, PASTE_AREA_CONFIG, MESSAGES } from "./constants.js";
import {
  addStickerFromBlob,
  bringToFront,
  updateStickerPosition,
  updateStickerRotation,
  updateStickerSize,
  saveStickerChanges,
  removeSticker,
} from "./sticker.js";
import {
  elements,
  showToast,
  updateInfoButtonVisibility,
  setTrashDragOver,
  isOverTrashBtn,
} from "./ui.js";
import { showConfirmDialog } from "./dialog.js";

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

  // 画像以外がペーストされた場合
  if (!hasImage) {
    console.log("No image found in clipboard");

    // 確認ダイアログを表示
    showConfirmDialog("クリップボードに画像がありません", "写真を選択", () => {
      elements.galleryInput.click();
    });
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

  // 別のステッカーが選択中の場合は選択解除
  if (state.selectedSticker && state.selectedSticker.id !== id) {
    console.log("Different sticker clicked - deselecting current selection");
    state.deselectAll();
    updateInfoButtonVisibility();
    return;
  }

  // 同じステッカーが既に選択されている場合
  if (state.selectedSticker && state.selectedSticker.id === id) {
    // クリック判定用のフラグを立てる（mouseupで判定）
    state.possibleClick = true;
    state.clickStartTime = Date.now();

    // ドラッグ準備（実際のドラッグはmousemoveで開始）
    state.dragPrepareX = e.clientX;
    state.dragPrepareY = e.clientY;

    if (e.shiftKey) {
      const rect = sticker.element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const angle =
        Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
      state.startRotating(angle);
      sticker.element.classList.add("rotating");
    }
    return;
  }

  // 選択していない状態からの操作：自動選択
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

  // ドラッグ準備状態からドラッグ開始
  if (state.possibleClick && state.dragPrepareX !== undefined) {
    const moveDistance = Math.sqrt(
      Math.pow(e.clientX - state.dragPrepareX, 2) +
        Math.pow(e.clientY - state.dragPrepareY, 2),
    );

    // 5px以上動いたらドラッグ開始
    if (moveDistance > 5) {
      state.possibleClick = false;
      state.startDragging(e.clientX, e.clientY); // ゴミ箱を表示
    }
  }

  if (state.isDragging) {
    const newX = e.clientX - state.dragStartX;
    const newY = e.clientY - state.dragStartY;
    updateStickerPosition(state.selectedSticker, newX, newY);

    // ゴミ箱エリアとの重なり判定
    const isOver = isOverTrashBtn(e.clientX, e.clientY);
    setTrashDragOver(isOver);
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
  // クリック判定（選択中のステッカーをクリックで解除）
  if (state.possibleClick && state.selectedSticker) {
    const clickDuration = Date.now() - (state.clickStartTime || 0);
    console.log("Click check:", {
      clickDuration,
      isDragging: state.isDragging,
      isRotating: state.isRotating,
    });
    // 200ms以内かつドラッグしていない場合はクリックとみなす
    if (clickDuration < 200 && !state.isDragging && !state.isRotating) {
      console.log("Deselecting via click");
      state.deselectAll();
      updateInfoButtonVisibility();
      state.possibleClick = false;
      state.dragPrepareX = undefined;
      state.dragPrepareY = undefined;
      return;
    }
  }
  state.possibleClick = false;
  state.dragPrepareX = undefined;
  state.dragPrepareY = undefined;

  if (state.isDragging || state.isRotating) {
    if (state.selectedSticker) {
      // ゴミ箱エリアに重なっていたら削除
      if (state.isDragging && isOverTrashBtn(e.clientX, e.clientY)) {
        const stickerToDelete = state.selectedSticker;
        state.deselectAll();
        await removeSticker(stickerToDelete.id);
        updateInfoButtonVisibility();
        state.endInteraction();
        return;
      }

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

  // 別のステッカーが選択中の場合は選択解除
  if (state.selectedSticker && state.selectedSticker.id !== id) {
    state.deselectAll();
    updateInfoButtonVisibility();
    return;
  }

  // 未選択の場合は自動選択
  if (!state.selectedSticker) {
    state.selectSticker(sticker);
    updateInfoButtonVisibility();
    bringToFront(sticker);
  }

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

  // 別のステッカーが選択中の場合は選択解除
  if (state.selectedSticker && state.selectedSticker.id !== id) {
    state.deselectAll();
    updateInfoButtonVisibility();
    return;
  }

  // 同じステッカーが既に選択されている場合
  if (state.selectedSticker && state.selectedSticker.id === id) {
    // タップ判定用のフラグを立てる（touchendで判定）
    state.possibleTap = true;
    state.tapStartTime = Date.now();

    // ドラッグ準備（実際のドラッグはtouchmoveで開始）
    const touches = e.touches;
    if (touches.length === 1) {
      state.touchPrepareX = touches[0].clientX;
      state.touchPrepareY = touches[0].clientY;
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
    return;
  }

  // 選択していない状態からの操作：自動選択
  if (!state.selectedSticker) {
    state.selectSticker(sticker);
    updateInfoButtonVisibility();
    bringToFront(sticker);
  }

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

  // ドラッグ準備状態からドラッグ開始
  if (
    state.possibleTap &&
    state.touchPrepareX !== undefined &&
    touches.length === 1
  ) {
    const moveDistance = Math.sqrt(
      Math.pow(touches[0].clientX - state.touchPrepareX, 2) +
        Math.pow(touches[0].clientY - state.touchPrepareY, 2),
    );

    // 10px以上動いたらドラッグ開始
    if (moveDistance > 10) {
      state.possibleTap = false;
      state.startDragging(touches[0].clientX, touches[0].clientY);
    }
  }

  if (state.isDragging && touches.length === 1) {
    e.preventDefault();

    const newX = touches[0].clientX - state.dragStartX;
    const newY = touches[0].clientY - state.dragStartY;
    updateStickerPosition(state.selectedSticker, newX, newY);

    // ゴミ箱ボタンとの重なり判定
    const isOver = isOverTrashBtn(touches[0].clientX, touches[0].clientY);
    setTrashDragOver(isOver);
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
  // タップ判定（選択中のステッカーをタップで解除）
  if (state.possibleTap && state.selectedSticker) {
    const tapDuration = Date.now() - (state.tapStartTime || 0);
    // 200ms以内かつドラッグしていない場合はタップとみなす
    if (tapDuration < 200 && !state.isDragging) {
      state.deselectAll();
      updateInfoButtonVisibility();
      state.possibleTap = false;
      state.touchPrepareX = undefined;
      state.touchPrepareY = undefined;
      return;
    }
  }
  state.possibleTap = false;
  state.touchPrepareX = undefined;
  state.touchPrepareY = undefined;

  if (state.isDragging || state.isRotating) {
    if (state.selectedSticker) {
      // ゴミ箱エリアに重なっていたら削除
      if (state.isDragging && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        if (isOverTrashBtn(touch.clientX, touch.clientY)) {
          const stickerToDelete = state.selectedSticker;
          state.deselectAll();
          await removeSticker(stickerToDelete.id);
          updateInfoButtonVisibility();
          state.endInteraction();
          return;
        }
      }

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
