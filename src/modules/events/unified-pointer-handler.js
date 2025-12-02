/**
 * unified-pointer-handler.js
 * マウスとタッチイベントを統一的に処理し、重複コードを削減
 */

import { state } from "../../state.js";
import { RESIZE_CONFIG, PASTE_AREA_CONFIG } from "../constants.js";
import {
  bringToFront,
  updateStickerSize,
  saveStickerChanges,
  removeSticker,
} from "../sticker.js";
import {
  elements,
  showToast,
  updateInfoButtonVisibility,
  setTrashDragOver,
  isOverTrashBtn,
  setOverlayDeleteMode,
  resetStickerTransformOrigin,
} from "../ui.js";
import { absoluteToHybrid } from "../coordinate-utils.js";
import { isPhysicsActive } from "../physics.js";
import { stopAutoLayout } from "../layout.js";
import {
  startDrag,
  handleDragMove,
  applyDragVelocity,
  startRotation,
  handleRotateMove,
  startPinchGesture,
  checkAndFixOutOfBounds,
  handleTapOrClick,
  checkDragThreshold,
} from "./gesture-handler.js";

let wheelTimeout = null;
let lastTouchTime = 0;

/**
 * 固定されたステッカーの操作処理（通常モード）
 * @param {Object} sticker - ステッカーオブジェクト
 * @param {number} id - ステッカーID
 * @param {boolean} isTouch - タッチイベントかどうか
 */
async function handlePinnedStickerInteraction(sticker, id, isTouch = false) {
  if (state.selectedSticker && state.selectedSticker.id !== id) {
    state.deselectAll();
    state.showUI();
    updateInfoButtonVisibility();
    return true;
  }

  if (!state.selectedSticker) {
    state.selectSticker(sticker);
    updateInfoButtonVisibility();
    await bringToFront(sticker);
  } else {
    if (isTouch) {
      state.possibleTap = true;
      state.tapStartTime = Date.now();
    } else {
      state.possibleClick = true;
      state.clickStartTime = Date.now();
    }
  }
  return true;
}

/**
 * ゴミ箱にドロップされた場合の削除処理
 * @param {number} clientX - X座標
 * @param {number} clientY - Y座標
 * @returns {Promise<boolean>} 削除した場合true
 */
async function handleTrashDrop(clientX, clientY) {
  if (state.isDragging && isOverTrashBtn(clientX, clientY)) {
    const stickerToDelete = state.selectedSticker;
    state.deselectAll();
    setTrashDragOver(false);
    setOverlayDeleteMode(false);
    await removeSticker(stickerToDelete.id);
    updateInfoButtonVisibility();
    return true;
  }
  return false;
}

/**
 * ドラッグ/回転の終了処理を行う
 */
async function finishInteraction() {
  if (!state.selectedSticker) return;

  state.selectedSticker.element.classList.remove("rotating", "resizing");
  await saveStickerChanges(state.selectedSticker);

  if (state.isDragging) {
    await checkAndFixOutOfBounds(state.selectedSticker);
  }
}

/**
 * キャンバスでのポインターダウン処理（統一）
 * @param {number} clientX - X座標
 * @param {number} clientY - Y座標
 * @param {boolean} isTouch - タッチイベントかどうか
 * @param {TouchList} touches - タッチリスト（タッチイベントの場合）
 */
function handleCanvasPointerDown(clientX, clientY, isTouch = false, touches = null) {
  if (!isTouch) {
    const now = Date.now();
    if (now - lastTouchTime < 500) {
      return;
    }
  } else {
    lastTouchTime = Date.now();
  }

  if (isTouch && touches && touches.length === 2 && state.selectedSticker && !state.selectedSticker.isPinned && !isPhysicsActive()) {
    startPinchGesture(touches[0], touches[1], state.selectedSticker);
    return;
  }

  if (isTouch && touches && touches.length === 1) {
    state.setLastTouchPosition(clientX, clientY);

    elements.pasteArea.style.left = `${clientX - 50}px`;
    elements.pasteArea.style.top = `${clientY - 50}px`;
    elements.pasteArea.style.width = `${PASTE_AREA_CONFIG.TOUCH_SIZE}px`;
    elements.pasteArea.style.height = `${PASTE_AREA_CONFIG.TOUCH_SIZE}px`;

    if (!state.selectedSticker) {
      state.canvasTapPending = true;
      state.canvasTapStartTime = Date.now();
      state.canvasTapX = clientX;
      state.canvasTapY = clientY;
    } else {
      state.canvasTapPending = true;
      state.canvasTapStartTime = Date.now();
      state.canvasTapX = clientX;
      state.canvasTapY = clientY;
    }
  } else if (!isTouch) {
    if (state.hasSelection()) {
      state.deselectAll();
      state.showUI();
      updateInfoButtonVisibility();
    } else {
      if (!state.isUIVisibleState()) {
        state.showUI();
        updateInfoButtonVisibility();
      }
    }
  }
}

/**
 * ステッカーでのポインターダウン処理（統一）
 * @param {number} id - ステッカーID
 * @param {number} clientX - X座標
 * @param {number} clientY - Y座標
 * @param {boolean} isTouch - タッチイベントかどうか
 * @param {boolean} shiftKey - Shiftキーが押されているか
 * @param {TouchList} touches - タッチリスト（タッチイベントの場合）
 */
async function handleStickerPointerDown(id, clientX, clientY, isTouch = false, shiftKey = false, touches = null) {
  stopAutoLayout();

  const sticker = state.getStickerById(id);
  if (!sticker) return;

  if (sticker.element && sticker.element.classList.contains("processing")) {
    return;
  }

  // 2本指タッチでピンチ開始
  if (isTouch && touches && touches.length === 2 && state.selectedSticker && state.selectedSticker.id === id && !state.selectedSticker.isPinned && !isPhysicsActive()) {
    startPinchGesture(touches[0], touches[1], state.selectedSticker);
    return;
  }

  if (isPhysicsActive() && (!isTouch || (touches && touches.length === 1))) {
    if (sticker.isPinned) {
      await bringToFront(sticker);
      return;
    }
    state.selectedSticker = sticker;
    await bringToFront(sticker);
    startDrag(clientX, clientY, sticker);
    return;
  }

  if (sticker.isPinned) {
    await handlePinnedStickerInteraction(sticker, id, isTouch);
    return;
  }

  if (state.selectedSticker && state.selectedSticker.id !== id) {
    state.deselectAll();
    state.showUI();
    updateInfoButtonVisibility();
    return;
  }

  if (state.selectedSticker && state.selectedSticker.id === id) {
    if (shiftKey && !isTouch) {
      const rect = sticker.element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const angle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
      startRotation(angle, sticker);
      return;
    }

    if (isTouch) {
      state.possibleTap = true;
      state.tapStartTime = Date.now();
    } else {
      state.possibleClick = true;
      state.clickStartTime = Date.now();
    }

    state.dragPrepareX = clientX;
    state.dragPrepareY = clientY;
    return;
  }

  state.selectSticker(sticker);
  updateInfoButtonVisibility();
  bringToFront(sticker);

  if (shiftKey && !isTouch) {
    const rect = sticker.element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
    startRotation(angle, sticker);
  } else {
    state.startDragging(clientX, clientY);
  }
}

/**
 * ポインター移動処理（統一）
 * @param {number} clientX - X座標
 * @param {number} clientY - Y座標
 * @param {boolean} isTouch - タッチイベントかどうか
 */
function handlePointerMove(clientX, clientY, isTouch = false) {
  if (!isTouch) {
    state.setLastMousePosition(clientX, clientY);
  }

  if (!state.selectedSticker) return;

  if (checkDragThreshold(clientX, clientY)) {
    state.startDragging(clientX, clientY);
  }

  if (state.isDragging) {
    handleDragMove(clientX, clientY);
  } else if (state.isRotating) {
    handleRotateMove(clientX, clientY);
  }
}

/**
 * ポインターアップ処理（統一）
 * @param {number} clientX - X座標
 * @param {number} clientY - Y座標
 * @param {boolean} isTouch - タッチイベントかどうか
 */
async function handlePointerUp(clientX, clientY, isTouch = false) {
  const possibleTapOrClick = isTouch ? state.possibleTap : state.possibleClick;
  const startTime = isTouch ? state.tapStartTime : state.clickStartTime;

  if (handleTapOrClick(possibleTapOrClick, startTime)) {
    state.deselectAll();
    state.showUI();
    updateInfoButtonVisibility();

    if (isTouch) {
      state.possibleTap = false;
    } else {
      state.possibleClick = false;
      state.dragPrepareX = undefined;
      state.dragPrepareY = undefined;
    }
    return;
  }

  if (isTouch) {
    state.possibleTap = false;
  } else {
    state.possibleClick = false;
    state.dragPrepareX = undefined;
    state.dragPrepareY = undefined;
  }

  if (state.isDragging || state.isRotating) {
    const wasDeleted = await handleTrashDrop(clientX, clientY);
    if (wasDeleted) {
      state.endInteraction();
      return;
    }

    applyDragVelocity(clientX, clientY);
    await finishInteraction();

    setTrashDragOver(false);
    setOverlayDeleteMode(false);
    resetStickerTransformOrigin();
    state.endInteraction();
  }
}

// エクスポート: マウスイベント用のラッパー
export function handleCanvasMouseDown(e) {
  if (e.target === elements.canvas || e.target === elements.pasteArea) {
    handleCanvasPointerDown(e.clientX, e.clientY, false);
  }
}

export function handleCanvasTouchStart(e) {
  if (e.target === elements.canvas || e.target === elements.pasteArea) {
    const touches = e.touches;
    if (touches.length > 0) {
      handleCanvasPointerDown(touches[0].clientX, touches[0].clientY, true, touches);
    }
  }
}

export async function handleStickerMouseDown(e, id) {
  e.preventDefault();
  e.stopPropagation();
  await handleStickerPointerDown(id, e.clientX, e.clientY, false, e.shiftKey);
}

export async function handleStickerTouchStart(e, id) {
  e.preventDefault();
  e.stopPropagation();
  const touches = e.touches;
  if (touches.length > 0) {
    await handleStickerPointerDown(id, touches[0].clientX, touches[0].clientY, true, false, touches);
  }
}

export function handleMouseMove(e) {
  handlePointerMove(e.clientX, e.clientY, false);
}

export function handleTouchMove(e) {
  const touches = e.touches;
  if (touches.length > 0) {
    handlePointerMove(touches[0].clientX, touches[0].clientY, true);
  }
}

export async function handleMouseUp(e) {
  await handlePointerUp(e.clientX, e.clientY, false);
}

export async function handleTouchEnd(e) {
  const touches = e.changedTouches;
  if (touches.length > 0) {
    await handlePointerUp(touches[0].clientX, touches[0].clientY, true);
  }
}

export async function handleWheel(e, id) {
  if (isPhysicsActive()) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  const sticker = state.getStickerById(id);
  if (!sticker) return;

  if (sticker.isPinned || (state.selectedSticker && state.selectedSticker.isPinned)) {
    return;
  }

  const targetSticker = state.selectedSticker || sticker;

  if (!state.selectedSticker) {
    state.selectSticker(sticker);
    updateInfoButtonVisibility();
    bringToFront(sticker);
  }

  const delta = e.deltaY > 0 ? -RESIZE_CONFIG.WHEEL_DELTA : RESIZE_CONFIG.WHEEL_DELTA;
  const newWidth = targetSticker.width + delta;
  updateStickerSize(targetSticker, newWidth);

  if (wheelTimeout) clearTimeout(wheelTimeout);
  wheelTimeout = setTimeout(async () => {
    await saveStickerChanges(targetSticker);
  }, RESIZE_CONFIG.DEBOUNCE_MS);
}

export async function handleCanvasWheel(e) {
  if (isPhysicsActive()) {
    return;
  }

  if (!state.selectedSticker) return;

  e.preventDefault();

  const delta = e.deltaY > 0 ? -RESIZE_CONFIG.WHEEL_DELTA : RESIZE_CONFIG.WHEEL_DELTA;
  const newWidth = state.selectedSticker.width + delta;
  updateStickerSize(state.selectedSticker, newWidth);

  if (wheelTimeout) clearTimeout(wheelTimeout);
  wheelTimeout = setTimeout(async () => {
    await saveStickerChanges(state.selectedSticker);
  }, RESIZE_CONFIG.DEBOUNCE_MS);
}

/**
 * すべてのイベントリスナーをステッカーに登録
 * @param {HTMLElement} wrapperElement - ステッカーのラッパー要素
 * @param {number} id - シールID
 */
export function attachStickerEventListeners(wrapperElement, id) {
  wrapperElement.addEventListener("mousedown", (e) => handleStickerMouseDown(e, id));
  wrapperElement.addEventListener("wheel", (e) => handleWheel(e, id));
  wrapperElement.addEventListener("touchstart", (e) => handleStickerTouchStart(e, id), { passive: false });
}
