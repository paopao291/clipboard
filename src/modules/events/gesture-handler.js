/**
 * gesture-handler.js
 * ドラッグ、ピンチ、回転などのジェスチャー処理を提供
 */

import { state } from "../../state.js";
import { INTERACTION_CONFIG } from "../constants.js";
import {
  updateStickerPosition,
  updateStickerRotation,
  updateStickerSize,
  saveStickerChanges,
} from "../sticker.js";
import {
  showToast,
  setTrashDragOver,
  isOverTrashBtn,
  setOverlayDeleteMode,
  updateInfoButtonVisibility,
} from "../ui.js";
import {
  isPhysicsActive,
  setStickerPhysicsPosition,
  updateStickerPhysicsPositionDuringDrag,
  applyStickerVelocity,
} from "../physics.js";
import { absoluteToHybrid } from "../coordinate-utils.js";

// 物理モード用：ドラッグの速度追跡
let lastDragX = 0;
let lastDragY = 0;
let lastDragTime = 0;

/**
 * ステッカーを選択状態に設定する（UI的には選択しない場合も可）
 * @param {Object} sticker - ステッカーオブジェクト
 * @param {boolean} selectSticker - 選択状態にするかどうか
 */
function setStickerSelection(sticker, selectSticker) {
  if (selectSticker && state.selectedSticker !== sticker) {
    state.selectSticker(sticker);
  } else if (!selectSticker) {
    // 選択状態にしない場合、内部的にはselectedStickerを設定するが、UI的には選択しない
    state.selectedSticker = sticker;
    state.shouldClearSelectionOnDragEnd = true;
  }
}

/**
 * ドラッグを開始（選択状態にする）
 * @param {number} clientX - X座標
 * @param {number} clientY - Y座標
 * @param {Object} sticker - ステッカーオブジェクト
 */
export function startDrag(clientX, clientY, sticker) {
  state.selectedSticker = sticker;
  state.isDragging = true;
  const coords = absoluteToHybrid(clientX, clientY);
  state.dragStartX = coords.x - sticker.x;
  state.dragStartYPercent = coords.yPercent - sticker.yPercent;

  // 速度追跡の初期化
  lastDragX = clientX;
  lastDragY = clientY;
  lastDragTime = Date.now();
}

/**
 * ドラッグを開始（選択状態にしない）
 * @param {number} clientX - X座標
 * @param {number} clientY - Y座標
 * @param {Object} sticker - ステッカーオブジェクト
 */
export function startDragWithoutSelection(clientX, clientY, sticker) {
  // 選択状態にせずにドラッグ開始
  setStickerSelection(sticker, false);
  state.isDragging = true;
  const coords = absoluteToHybrid(clientX, clientY);
  state.dragStartX = coords.x - sticker.x;
  state.dragStartYPercent = coords.yPercent - sticker.yPercent;

  // 速度追跡の初期化
  lastDragX = clientX;
  lastDragY = clientY;
  lastDragTime = Date.now();
}

/**
 * ドラッグ中の処理
 * @param {number} clientX - X座標
 * @param {number} clientY - Y座標
 */
export function handleDragMove(clientX, clientY) {
  if (!state.isDragging || !state.selectedSticker) return;

  const coords = absoluteToHybrid(clientX, clientY);
  const newX = coords.x - state.dragStartX;
  const newYPercent = coords.yPercent - state.dragStartYPercent;

  // 物理モード中はゴミ箱判定とオーバーレイを無効化
  if (isPhysicsActive()) {
    updateStickerPosition(state.selectedSticker, newX, newYPercent);

    const now = Date.now();
    const rect = state.selectedSticker.element.getBoundingClientRect();
    const physicsX = rect.left + rect.width / 2;
    const physicsY = rect.top + rect.height / 2;

    updateStickerPhysicsPositionDuringDrag(
      state.selectedSticker.id,
      physicsX,
      physicsY,
    );

    lastDragX = clientX;
    lastDragY = clientY;
    lastDragTime = now;
  } else {
    // ゴミ箱判定（未選択のドラッグでも削除可能）
    const isOver = isOverTrashBtn(clientX, clientY);
    setTrashDragOver(isOver);
    setOverlayDeleteMode(isOver);

    if (!isOver) {
      updateStickerPosition(state.selectedSticker, newX, newYPercent);
    }

    // ドラッグ中にゴミ箱を表示するためボタンの表示状態を更新
    updateInfoButtonVisibility();
  }
}

/**
 * ドラッグ終了時の速度適用（物理モード）
 * @param {number} clientX - X座標
 * @param {number} clientY - Y座標
 */
export function applyDragVelocity(clientX, clientY) {
  if (!isPhysicsActive() || !state.isDragging || !state.selectedSticker) {
    return;
  }

  const now = Date.now();
  const deltaTime = now - lastDragTime;

  if (deltaTime > 0 && deltaTime < 100) {
    const vx = ((clientX - lastDragX) / deltaTime) * 16;
    const vy = ((clientY - lastDragY) / deltaTime) * 16;

    const maxVelocity = 20;
    const velocityMagnitude = Math.sqrt(vx * vx + vy * vy);
    if (velocityMagnitude > maxVelocity) {
      const scale = maxVelocity / velocityMagnitude;
      applyStickerVelocity(state.selectedSticker.id, vx * scale, vy * scale);
    } else {
      applyStickerVelocity(state.selectedSticker.id, vx, vy);
    }
  }
}

/**
 * 回転を開始
 * @param {number} angle - 初期角度
 * @param {Object} sticker - ステッカーオブジェクト
 * @param {boolean} selectSticker - 選択状態にするかどうか（デフォルト: true）
 */
export function startRotation(angle, sticker, selectSticker = true) {
  setStickerSelection(sticker, selectSticker);
  state.startRotating(angle);
  if (sticker && sticker.element) {
    sticker.element.classList.add("rotating");
  }
}

/**
 * 回転中の処理
 * @param {number} clientX - X座標
 * @param {number} clientY - Y座標
 */
export function handleRotateMove(clientX, clientY) {
  if (!state.isRotating || !state.selectedSticker) return;

  if (isPhysicsActive()) return;

  const rect = state.selectedSticker.element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const angle =
    Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
  const rotation = angle - state.startAngle;
  updateStickerRotation(state.selectedSticker, rotation);
}

/**
 * 2本指ピンチ操作を開始
 * @param {Object} touch1 - 1本目の指
 * @param {Object} touch2 - 2本目の指
 * @param {Object} targetSticker - 対象のステッカー
 * @param {boolean} selectSticker - 選択状態にするかどうか（デフォルト: true）
 * @returns {boolean} ピンチを開始したかどうか
 */
export function startPinchGesture(
  touch1,
  touch2,
  targetSticker,
  selectSticker = true,
) {
  if (targetSticker.isPinned) {
    return false;
  }

  setStickerSelection(targetSticker, selectSticker);

  // 2本指間の距離と角度を計算
  const dx = touch2.clientX - touch1.clientX;
  const dy = touch2.clientY - touch1.clientY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  state.startPinch(distance, targetSticker.width);
  state.startRotating(angle);

  // ピンチ中クラスを追加（CSSトランジション無効化用）
  if (targetSticker.element) {
    targetSticker.element.classList.add("resizing", "rotating");
  }

  return true;
}

/**
 * ピンチ移動処理（2本指での拡大縮小）
 * @param {Object} touch1 - 1本目の指
 * @param {Object} touch2 - 2本目の指
 * @param {Object} sticker - ピンチ中のステッカー
 */
export function handlePinchMove(touch1, touch2, sticker) {
  if (!state.isRotating || !sticker) {
    return;
  }

  // 物理モード中はピンチ操作を無効化
  if (isPhysicsActive()) {
    return;
  }

  // 固定されたステッカーはピンチ操作を無効化
  if (sticker.isPinned) {
    return;
  }

  // リサイズ中クラスを追加（CSSトランジション無効化用）
  if (sticker.element) {
    sticker.element.classList.add("resizing");
  }

  // 2本指間の距離を計算
  const dx = touch2.clientX - touch1.clientX;
  const dy = touch2.clientY - touch1.clientY;
  const currentDistance = Math.sqrt(dx * dx + dy * dy);

  // 前フレームからのスケール変化を現在のサイズに適用
  if (state.lastPinchDistance && state.lastPinchDistance > 0) {
    const deltaScale = currentDistance / state.lastPinchDistance;
    const newWidth = sticker.width * deltaScale;
    updateStickerSize(sticker, newWidth);
  }

  // 次のフレームのために距離を更新
  state.updatePinchDistance(currentDistance);
}

/**
 * 2本指での回転移動処理
 * @param {Object} touch1 - 1本目の指
 * @param {Object} touch2 - 2本目の指
 * @param {Object} sticker - 回転中のステッカー
 */
export function handlePinchRotationMove(touch1, touch2, sticker) {
  if (!state.isRotating || !sticker) {
    return;
  }

  // 物理モード中は回転操作を無効化
  if (isPhysicsActive()) {
    return;
  }

  // 固定されたステッカーは回転操作を無効化
  if (sticker.isPinned) {
    return;
  }

  // 回転中クラスを追加（CSSトランジション無効化用）
  if (sticker.element) {
    sticker.element.classList.add("rotating");
  }

  // 2本指の角度を計算
  const angle =
    Math.atan2(
      touch2.clientY - touch1.clientY,
      touch2.clientX - touch1.clientX,
    ) *
    (180 / Math.PI);

  // 開始角度からの回転量を計算して適用
  const rotation = angle - state.startAngle;
  updateStickerRotation(sticker, rotation);
}

/**
 * ステッカーが画面外に出たかチェックし、必要なら中央に戻す
 * @param {Object} sticker - チェック対象のステッカー
 * @returns {Promise<boolean>} 中央に戻した場合true
 */
export async function checkAndFixOutOfBounds(sticker) {
  if (!sticker || !sticker.element) {
    return false;
  }
  const rect = sticker.element.getBoundingClientRect();

  const isCompletelyOutside =
    rect.right <= 0 ||
    rect.left >= window.innerWidth ||
    rect.bottom <= 0 ||
    rect.top >= window.innerHeight;

  if (isCompletelyOutside) {
    updateStickerPosition(sticker, 0, 50);

    if (isPhysicsActive()) {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      setStickerPhysicsPosition(sticker.id, centerX, centerY);
    }

    await saveStickerChanges(sticker);
    showToast("画面外に出たため中央に戻しました");
    return true;
  }

  const visibleWidth =
    Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
  const visibleHeight =
    Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);

  const stickerWidth = rect.width;
  const stickerHeight = rect.height;

  const visibleRatioX = visibleWidth / stickerWidth;
  const visibleRatioY = visibleHeight / stickerHeight;

  const minVisiblePx = 16;
  const isMostlyOutside =
    visibleRatioX < 0.1 ||
    visibleRatioY < 0.1 ||
    visibleWidth < minVisiblePx ||
    visibleHeight < minVisiblePx;

  if (isMostlyOutside) {
    updateStickerPosition(sticker, 0, 50);

    if (isPhysicsActive()) {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      setStickerPhysicsPosition(sticker.id, centerX, centerY);
    }

    await saveStickerChanges(sticker);
    showToast("画面外に出たため中央に戻しました");
    return true;
  }

  return false;
}

/**
 * タップ/クリック判定を処理
 * @param {boolean} possibleTap - タップ可能性フラグ
 * @param {number} startTime - タップ開始時刻
 * @returns {boolean} タップとして処理した場合true
 */
export function handleTapOrClick(possibleTap, startTime) {
  if (!possibleTap) return false;

  const duration = Date.now() - (startTime || 0);
  if (
    duration < INTERACTION_CONFIG.TAP_MAX_DURATION_MS &&
    !state.isDragging &&
    !state.isRotating
  ) {
    // 選択状態のステッカーがある場合、またはpendingStickerIdがある場合（未選択のステッカーをタップ）
    if (state.selectedSticker || state.pendingStickerId) {
      return true;
    }
  }
  return false;
}

/**
 * ドラッグ準備状態からドラッグ開始への移行判定
 * @param {number} currentX - 現在のX座標
 * @param {number} currentY - 現在のY座標
 * @param {boolean} isTouch - タッチイベントかどうか
 * @returns {boolean} ドラッグを開始した場合true
 */
export function checkDragThreshold(currentX, currentY, isTouch = false) {
  if (isTouch) {
    // タッチイベントの場合
    if (state.possibleTap && state.touchPrepareX !== undefined) {
      const moveDistance = Math.sqrt(
        Math.pow(currentX - state.touchPrepareX, 2) +
          Math.pow(currentY - state.touchPrepareY, 2),
      );

      if (moveDistance > INTERACTION_CONFIG.DRAG_THRESHOLD_PX) {
        state.possibleTap = false;
        return true;
      }
    }
  } else {
    // マウスイベントの場合
    if (state.possibleClick && state.dragPrepareX !== undefined) {
      const moveDistance = Math.sqrt(
        Math.pow(currentX - state.dragPrepareX, 2) +
          Math.pow(currentY - state.dragPrepareY, 2),
      );

      if (moveDistance > INTERACTION_CONFIG.DRAG_THRESHOLD_PX) {
        state.possibleClick = false;
        return true;
      }
    }
  }
  return false;
}
