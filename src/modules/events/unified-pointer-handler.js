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
  startDragWithoutSelection,
  handleDragMove,
  applyDragVelocity,
  startRotation,
  handleRotateMove,
  startPinchGesture,
  handlePinchMove,
  handlePinchRotationMove,
  checkAndFixOutOfBounds,
  handleTapOrClick,
  checkDragThreshold,
} from "./gesture-handler.js";

let wheelTimeout = null;
let lastTouchTime = 0;

/**
 * タップ/クリック判定の準備を行う
 * @param {number} clientX - X座標
 * @param {number} clientY - Y座標
 * @param {boolean} isTouch - タッチイベントかどうか
 * @param {number} stickerId - ステッカーID（オプション）
 */
function prepareTapOrClick(clientX, clientY, isTouch, stickerId = null) {
  if (isTouch) {
    state.possibleTap = true;
    state.tapStartTime = Date.now();
    state.touchPrepareX = clientX;
    state.touchPrepareY = clientY;
  } else {
    state.possibleClick = true;
    state.clickStartTime = Date.now();
    state.dragPrepareX = clientX;
    state.dragPrepareY = clientY;
  }
  
  if (stickerId !== null) {
    state.pendingStickerId = stickerId;
  }
}

/**
 * タップ/クリック状態をクリアする
 * @param {boolean} isTouch - タッチイベントかどうか
 */
function clearTapOrClickState(isTouch) {
  if (isTouch) {
    state.possibleTap = false;
    state.touchPrepareX = undefined;
    state.touchPrepareY = undefined;
  } else {
    state.possibleClick = false;
    state.dragPrepareX = undefined;
    state.dragPrepareY = undefined;
  }
}

/**
 * ピンチ操作が可能かどうかを判定
 * @param {Object} sticker - ステッカーオブジェクト
 * @returns {boolean} ピンチ可能な場合true
 */
function canPinch(sticker) {
  return !sticker.isPinned && !isPhysicsActive();
}

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
    prepareTapOrClick(0, 0, isTouch);
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
  
  // ドラッグで選択しなかった場合、選択状態をクリア
  if (state.shouldClearSelectionOnDragEnd) {
    state.selectedSticker = null;
    state.shouldClearSelectionOnDragEnd = false;
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

  if (isTouch && touches && touches.length === 2 && state.selectedSticker && canPinch(state.selectedSticker)) {
    startPinchGesture(touches[0], touches[1], state.selectedSticker, true);
    return;
  }

  if (isTouch && touches && touches.length === 1) {
    state.setLastTouchPosition(clientX, clientY);

    elements.pasteArea.style.left = `${clientX - 50}px`;
    elements.pasteArea.style.top = `${clientY - 50}px`;
    elements.pasteArea.style.width = `${PASTE_AREA_CONFIG.TOUCH_SIZE}px`;
    elements.pasteArea.style.height = `${PASTE_AREA_CONFIG.TOUCH_SIZE}px`;

    state.canvasTapPending = true;
    state.canvasTapStartTime = Date.now();
    state.canvasTapX = clientX;
    state.canvasTapY = clientY;
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
  if (isTouch && touches && touches.length === 2 && canPinch(sticker)) {
    const isSelected = state.selectedSticker && state.selectedSticker.id === id;
    startPinchGesture(touches[0], touches[1], sticker, isSelected);
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
    // 別のステッカーが選択中の場合、選択解除してからタップ判定の準備
    state.deselectAll();
    state.showUI();
    updateInfoButtonVisibility();
    prepareTapOrClick(clientX, clientY, isTouch, id);
    return;
  }

  if (state.selectedSticker && state.selectedSticker.id === id) {
    // 選択状態のステッカーをタッチ/クリック
    // Shift+クリックで回転開始（選択状態を維持）
    if (shiftKey && !isTouch) {
      const rect = sticker.element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const angle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
      startRotation(angle, sticker, true);
      return;
    }

    // タップ判定の準備（選択解除の可能性）
    prepareTapOrClick(clientX, clientY, isTouch);
    return;
  }

  // 未選択のステッカーをタッチ/クリック
  // Shift+クリックで回転開始（選択状態にしない）
  if (shiftKey && !isTouch) {
    const rect = sticker.element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
    startRotation(angle, sticker, false);
    return;
  }
  
  // タップ判定の準備（ドラッグでは選択しない）
  prepareTapOrClick(clientX, clientY, isTouch, id);
}

/**
 * ポインター移動処理（統一）
 * @param {number} clientX - X座標
 * @param {number} clientY - Y座標
 * @param {boolean} isTouch - タッチイベントかどうか
 * @param {TouchList} touches - タッチリスト（タッチイベントの場合）
 */
function handlePointerMove(clientX, clientY, isTouch = false, touches = null) {
  if (!isTouch) {
    state.setLastMousePosition(clientX, clientY);
  }

  // pendingStickerIdがある場合（未選択のステッカーをドラッグ開始）
  if (state.pendingStickerId && !state.selectedSticker) {
    if (checkDragThreshold(clientX, clientY, isTouch)) {
      // ドラッグ開始（選択しない）
      const sticker = state.getStickerById(state.pendingStickerId);
      if (sticker) {
        startDragWithoutSelection(clientX, clientY, sticker);
        state.pendingStickerId = null; // クリア
      }
    }
  }

  if (!state.selectedSticker) return;

  // 2本指タッチの場合、ピンチ処理
  if (isTouch && touches && touches.length === 2 && state.isRotating) {
    handlePinchMove(touches[0], touches[1], state.selectedSticker);
    handlePinchRotationMove(touches[0], touches[1], state.selectedSticker);
    return;
  }

  // 1本指またはマウスの場合
  if (checkDragThreshold(clientX, clientY, isTouch)) {
    state.startDragging(clientX, clientY);
    // pendingStickerIdをクリア（ドラッグ開始したので選択しない）
    state.pendingStickerId = null;
  }

  if (state.isDragging) {
    handleDragMove(clientX, clientY);
  } else if (state.isRotating && !isTouch) {
    // マウスでの回転（Shift+ドラッグ）
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

  // タップ/クリック判定
  if (handleTapOrClick(possibleTapOrClick, startTime)) {
    // pendingStickerIdがある場合（未選択のステッカーをタップ）
    if (state.pendingStickerId) {
      const sticker = state.getStickerById(state.pendingStickerId);
      if (sticker) {
        state.selectSticker(sticker);
        updateInfoButtonVisibility();
        bringToFront(sticker);
      }
      state.pendingStickerId = null;
    } else if (state.selectedSticker) {
      // 選択状態のステッカーをタップ → 選択解除
      state.deselectAll();
      state.showUI();
      updateInfoButtonVisibility();
    }

    clearTapOrClickState(isTouch);
    return;
  }

  // ドラッグが開始されなかった場合、pendingStickerIdをクリア
  if (state.pendingStickerId && !state.isDragging) {
    state.pendingStickerId = null;
  }

  clearTapOrClickState(isTouch);

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
  
  // 2本指タッチの場合、ピンチ操作を開始または継続
  if (touches.length === 2) {
    // ピンチ中の処理
    if (state.isRotating && state.selectedSticker && canPinch(state.selectedSticker)) {
      handlePinchMove(touches[0], touches[1], state.selectedSticker);
      handlePinchRotationMove(touches[0], touches[1], state.selectedSticker);
      return;
    }
    
    // まだピンチが開始されていない場合
    // 選択状態のステッカーがある場合、どこをピンチしてもそのステッカーを拡大縮小できる
    if (state.selectedSticker && canPinch(state.selectedSticker) && !state.isDragging) {
      startPinchGesture(touches[0], touches[1], state.selectedSticker, true);
      return;
    }
    
    // 未選択のステッカーの場合は、handleStickerPointerDownで処理される
    return;
  }

  // 1本指タッチの場合
  if (touches.length > 0) {
    handlePointerMove(touches[0].clientX, touches[0].clientY, true, touches);
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

/**
 * ホイールでステッカーのサイズを変更
 * @param {Object} sticker - 対象のステッカー
 * @param {number} deltaY - ホイールのdeltaY値
 */
function resizeStickerWithWheel(sticker, deltaY) {
  const delta = deltaY > 0 ? -RESIZE_CONFIG.WHEEL_DELTA : RESIZE_CONFIG.WHEEL_DELTA;
  const newWidth = sticker.width + delta;
  updateStickerSize(sticker, newWidth);

  if (wheelTimeout) clearTimeout(wheelTimeout);
  wheelTimeout = setTimeout(async () => {
    await saveStickerChanges(sticker);
  }, RESIZE_CONFIG.DEBOUNCE_MS);
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

  // 未選択のステッカーの場合、選択状態にしない（内部的にはselectedStickerを設定）
  if (!state.selectedSticker) {
    state.selectedSticker = sticker;
    bringToFront(sticker);
  }

  resizeStickerWithWheel(targetSticker, e.deltaY);
}

export async function handleCanvasWheel(e) {
  if (isPhysicsActive() || !state.selectedSticker) {
    return;
  }

  e.preventDefault();
  resizeStickerWithWheel(state.selectedSticker, e.deltaY);
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
