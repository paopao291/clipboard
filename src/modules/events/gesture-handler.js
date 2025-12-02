/**
 * gesture-handler.js
 * ドラッグ、ピンチ、回転などのジェスチャー処理を提供
 */

import { state } from "../../state.js";
import { INTERACTION_CONFIG } from "../constants.js";
import {
  updateStickerPosition,
  updateStickerRotation,
  saveStickerChanges,
} from "../sticker.js";
import {
  showToast,
  setTrashDragOver,
  isOverTrashBtn,
  setOverlayDeleteMode,
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
 * ドラッグを開始
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
 * ドラッグ中の処理
 * @param {number} clientX - X座標
 * @param {number} clientY - Y座標
 */
export function handleDragMove(clientX, clientY) {
  if (!state.isDragging || !state.selectedSticker) return;

  // 物理モード中はゴミ箱判定とオーバーレイを無効化
  if (!isPhysicsActive()) {
    const isOver = isOverTrashBtn(clientX, clientY);
    setTrashDragOver(isOver);
    setOverlayDeleteMode(isOver);

    if (!isOver) {
      const coords = absoluteToHybrid(clientX, clientY);
      const newX = coords.x - state.dragStartX;
      const newYPercent = coords.yPercent - state.dragStartYPercent;
      updateStickerPosition(state.selectedSticker, newX, newYPercent);
    }
  } else {
    const coords = absoluteToHybrid(clientX, clientY);
    const newX = coords.x - state.dragStartX;
    const newYPercent = coords.yPercent - state.dragStartYPercent;
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
      applyStickerVelocity(
        state.selectedSticker.id,
        vx * scale,
        vy * scale,
      );
    } else {
      applyStickerVelocity(state.selectedSticker.id, vx, vy);
    }
  }
}

/**
 * 回転を開始
 * @param {number} angle - 初期角度
 * @param {Object} sticker - ステッカーオブジェクト
 */
export function startRotation(angle, sticker) {
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
 * @returns {boolean} ピンチを開始したかどうか
 */
export function startPinchGesture(touch1, touch2, targetSticker) {
  if (targetSticker.isPinned) {
    return false;
  }

  const dx = touch2.clientX - touch1.clientX;
  const dy = touch2.clientY - touch1.clientY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  state.startPinch(distance, targetSticker.width);

  const angle =
    Math.atan2(
      touch2.clientY - touch1.clientY,
      touch2.clientX - touch1.clientX,
    ) *
    (180 / Math.PI);
  state.startRotating(angle);

  return true;
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
  if (possibleTap && state.selectedSticker) {
    const duration = Date.now() - (startTime || 0);
    if (
      duration < INTERACTION_CONFIG.TAP_MAX_DURATION_MS &&
      !state.isDragging &&
      !state.isRotating
    ) {
      return true;
    }
  }
  return false;
}

/**
 * ドラッグ準備状態からドラッグ開始への移行判定
 * @param {number} currentX - 現在のX座標
 * @param {number} currentY - 現在のY座標
 * @returns {boolean} ドラッグを開始した場合true
 */
export function checkDragThreshold(currentX, currentY) {
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
  return false;
}
