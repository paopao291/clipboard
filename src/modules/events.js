import { state } from "../state.js";
import { RESIZE_CONFIG, PASTE_AREA_CONFIG, MESSAGES, INTERACTION_CONFIG } from "./constants.js";
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
import { absoluteToHybrid, getCenterCoordinates } from "./coordinate-utils.js";

let wheelTimeout = null;

/**
 * 2本指ピンチ操作を開始（共通処理）
 * @param {Touch} touch1 - 1本目の指
 * @param {Touch} touch2 - 2本目の指
 * @param {Object} targetSticker - 対象のステッカー
 */
function startPinchGesture(touch1, touch2, targetSticker) {
  // 初期距離を保存（拡大縮小用）
  const dx = touch2.clientX - touch1.clientX;
  const dy = touch2.clientY - touch1.clientY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  state.startPinch(distance, targetSticker.width);

  // 初期角度を保存（回転用）
  const angle =
    Math.atan2(touch2.clientY - touch1.clientY, touch2.clientX - touch1.clientX) *
    (180 / Math.PI);
  state.startRotating(angle);
}

/**
 * ペーストイベントハンドラー
 * @param {ClipboardEvent} e
 */
export async function handlePaste(e) {
  e.preventDefault();

  const items = e.clipboardData.items;
  let hasImage = false;

  if (!items) {
    showToast("ペースト機能が利用できません");
    return;
  }

  for (let item of items) {
    if (item.type.indexOf("image") !== -1) {
      hasImage = true;
      const blob = item.getAsFile();

      const coords = state.lastTouchX && state.lastTouchY
        ? absoluteToHybrid(state.lastTouchX, state.lastTouchY)
        : getCenterCoordinates();

      await addStickerFromBlob(blob, coords.x, coords.yPercent);
      showToast(MESSAGES.IMAGE_ADDED);
      elements.pasteArea.blur();
      break;
    }
  }

  if (!hasImage) {
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
      const offsetXPx = addedCount * INTERACTION_CONFIG.STICKER_OFFSET_PX;
      const offsetYPx = addedCount * INTERACTION_CONFIG.STICKER_OFFSET_PX;
      
      let coords;
      if (state.lastTouchX && state.lastTouchY) {
        coords = absoluteToHybrid(
          state.lastTouchX + offsetXPx,
          state.lastTouchY + offsetYPx
        );
      } else {
        const center = getCenterCoordinates();
        const offsetYPercent = (offsetYPx / window.innerHeight) * 100;
        coords = { x: offsetXPx, yPercent: center.yPercent + offsetYPercent };
      }
      
      await addStickerFromBlob(file, coords.x, coords.yPercent);

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
 * キャンバスタッチスタート（ペーストエリアフォーカスと選択解除）
 * @param {TouchEvent} e
 */
export function handleCanvasTouchStart(e) {
  if (e.target === elements.canvas || e.target === elements.pasteArea) {
    const touches = e.touches;

    if (touches.length === 1) {
      const touch = touches[0];
      state.setLastTouchPosition(touch.clientX, touch.clientY);

      // ペーストエリアをタッチ位置に配置
      elements.pasteArea.style.left = `${touch.clientX - 50}px`;
      elements.pasteArea.style.top = `${touch.clientY - 50}px`;
      elements.pasteArea.style.width = `${PASTE_AREA_CONFIG.TOUCH_SIZE}px`;
      elements.pasteArea.style.height = `${PASTE_AREA_CONFIG.TOUCH_SIZE}px`;

      if (!state.selectedSticker) {
        // 未選択時：ペーストエリアにフォーカス
        elements.pasteArea.focus();
      } else {
        // 選択中：タップ判定を待つ（2本指追加でピンチできるようにするため）
        state.canvasTapPending = true;
        state.canvasTapStartTime = Date.now();
        state.canvasTapX = touch.clientX;
        state.canvasTapY = touch.clientY;
      }
    }
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
    state.deselectAll();
    updateInfoButtonVisibility();
    return;
  }

  // 同じステッカーが既に選択されている場合
  if (state.selectedSticker && state.selectedSticker.id === id) {
    // Shiftキーが押されていたら回転モード
    if (e.shiftKey) {
      const rect = sticker.element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const angle =
        Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
      state.startRotating(angle);
      sticker.element.classList.add("rotating");
      return;
    }

    // Shiftキーが押されていない場合：クリック判定とドラッグ準備
    state.possibleClick = true;
    state.clickStartTime = Date.now();

    // ドラッグ準備（実際のドラッグはmousemoveで開始）
    state.dragPrepareX = e.clientX;
    state.dragPrepareY = e.clientY;
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

    // 閾値以上動いたらドラッグ開始
    if (moveDistance > INTERACTION_CONFIG.DRAG_THRESHOLD_PX) {
      state.possibleClick = false;
      state.startDragging(e.clientX, e.clientY);
    }
  }

  if (state.isDragging) {
    const coords = absoluteToHybrid(e.clientX, e.clientY);
    const newX = coords.x - state.dragStartX;
    const newYPercent = coords.yPercent - state.dragStartYPercent;
    updateStickerPosition(state.selectedSticker, newX, newYPercent);

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
    // 閾値以内かつドラッグしていない場合はクリックとみなす
    if (clickDuration < INTERACTION_CONFIG.TAP_MAX_DURATION_MS && !state.isDragging && !state.isRotating) {
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
        setTrashDragOver(false); // ゴミ箱の状態をリセット
        await removeSticker(stickerToDelete.id);
        updateInfoButtonVisibility();
        state.endInteraction();
        return;
      }

      state.selectedSticker.element.classList.remove("rotating");
      await saveStickerChanges(state.selectedSticker);

      // ドラッグ終了時に画面外判定
      if (state.isDragging) {
        const rect = state.selectedSticker.element.getBoundingClientRect();
        
        // 完全に画面外に出たかチェック（回転していても確実に判定）
        const isCompletelyOutside = 
          rect.right <= 0 || 
          rect.left >= window.innerWidth || 
          rect.bottom <= 0 || 
          rect.top >= window.innerHeight;
        
        if (!isCompletelyOutside) {
          // 画面内に見えている部分の幅と高さを計算
          const visibleWidth = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
          const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
          
          // ステッカーの実際のサイズ
          const stickerWidth = rect.width;
          const stickerHeight = rect.height;
          
          // 画面内に見えている割合を計算（幅と高さの両方で判定）
          const visibleRatioX = visibleWidth / stickerWidth;
          const visibleRatioY = visibleHeight / stickerHeight;
          
          // 90%以上が画面外に出ている、または見えている部分が20px未満の場合は中央に戻す
          const isMostlyOutside = visibleRatioX < 0.1 || visibleRatioY < 0.1 || 
                                  visibleWidth < 20 || visibleHeight < 20;
          
          if (isMostlyOutside) {
            // 中央に戻す
            updateStickerPosition(state.selectedSticker, 0, 50);
            await saveStickerChanges(state.selectedSticker);
            showToast("画面外に出たため中央に戻しました");
          }
        } else {
          // 完全に画面外に出た場合も中央に戻す
          updateStickerPosition(state.selectedSticker, 0, 50);
          await saveStickerChanges(state.selectedSticker);
          showToast("画面外に出たため中央に戻しました");
        }
      }
    }
    // ドラッグ終了時にゴミ箱の状態をリセット
    setTrashDragOver(false);
    state.endInteraction();
  }
}

/**
 * マウスホイールイベント（拡大縮小）
 * @param {WheelEvent} e
 * @param {number} id - シールID
 */
export async function handleWheel(e, id) {
  // Ctrl/Cmdキーが押されている場合はページズーム（デフォルト動作）を優先
  if (e.ctrlKey || e.metaKey) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  const sticker = state.getStickerById(id);
  if (!sticker) return;

  // 選択中のステッカーがある場合は、カーソル位置に関わらず選択中のステッカーを拡大縮小
  const targetSticker = state.selectedSticker || sticker;

  // 未選択の場合は自動選択（カーソル位置のステッカーを選択）
  if (!state.selectedSticker) {
    state.selectSticker(sticker);
    updateInfoButtonVisibility();
    bringToFront(sticker);
  }

  const delta =
    e.deltaY > 0 ? -RESIZE_CONFIG.WHEEL_DELTA : RESIZE_CONFIG.WHEEL_DELTA;
  const newWidth = targetSticker.width + delta;
  updateStickerSize(targetSticker, newWidth);

  // デバウンスしてDBに保存
  if (wheelTimeout) clearTimeout(wheelTimeout);
  wheelTimeout = setTimeout(async () => {
    await saveStickerChanges(targetSticker);
  }, RESIZE_CONFIG.DEBOUNCE_MS);
}

/**
 * キャンバス全体のホイールイベント（選択中のステッカーを拡大縮小）
 * @param {WheelEvent} e
 */
export async function handleCanvasWheel(e) {
  // Ctrl/Cmdキーが押されている場合はページズーム（デフォルト動作）を優先
  if (e.ctrlKey || e.metaKey) {
    return;
  }

  // 選択中のステッカーがある場合のみ処理
  if (!state.selectedSticker) return;

  e.preventDefault();

  const delta =
    e.deltaY > 0 ? -RESIZE_CONFIG.WHEEL_DELTA : RESIZE_CONFIG.WHEEL_DELTA;
  const newWidth = state.selectedSticker.width + delta;
  updateStickerSize(state.selectedSticker, newWidth);

  // デバウンスしてDBに保存
  if (wheelTimeout) clearTimeout(wheelTimeout);
  wheelTimeout = setTimeout(async () => {
    await saveStickerChanges(state.selectedSticker);
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

  const touches = e.touches;
  // 選択中のステッカーがある場合、そのステッカーを操作対象にする
  const targetSticker = state.selectedSticker || sticker;

  // 別のステッカーが選択中の場合：選択中のステッカーを操作
  if (state.selectedSticker && state.selectedSticker.id !== id) {
    handleTouchOnDifferentSticker(touches, targetSticker);
    return;
  }

  // 同じステッカーが既に選択されている場合：タップ判定とジェスチャー検出
  if (state.selectedSticker && state.selectedSticker.id === id) {
    handleTouchOnSelectedSticker(touches, targetSticker);
    return;
  }

  // 未選択のステッカーをタッチ：自動選択してジェスチャー開始
  handleTouchOnUnselectedSticker(sticker, touches, targetSticker);
}

/**
 * 別のステッカー選択中に他のステッカーをタッチした場合の処理
 * @param {TouchList} touches - タッチリスト
 * @param {Object} targetSticker - 操作対象のステッカー
 */
function handleTouchOnDifferentSticker(touches, targetSticker) {
  if (touches.length === 1) {
    // 1本指：タップ判定の準備
    state.possibleTap = true;
    state.tapStartTime = Date.now();
    state.touchPrepareX = touches[0].clientX;
    state.touchPrepareY = touches[0].clientY;
  } else if (touches.length === 2) {
    // 2本指：選択中のステッカーをピンチ
    startPinchGesture(touches[0], touches[1], targetSticker);
  }
}

/**
 * 選択中のステッカーをタッチした場合の処理
 * @param {TouchList} touches - タッチリスト
 * @param {Object} targetSticker - 操作対象のステッカー
 */
function handleTouchOnSelectedSticker(touches, targetSticker) {
  // タップ判定の準備
  state.possibleTap = true;
  state.tapStartTime = Date.now();

  if (touches.length === 1) {
    // 1本指：ドラッグ準備
    state.touchPrepareX = touches[0].clientX;
    state.touchPrepareY = touches[0].clientY;
  } else if (touches.length === 2) {
    // 2本指：ピンチ開始
    startPinchGesture(touches[0], touches[1], targetSticker);
  }
}

/**
 * 未選択のステッカーをタッチした場合の処理
 * @param {Object} sticker - タッチされたステッカー
 * @param {TouchList} touches - タッチリスト
 * @param {Object} targetSticker - 操作対象のステッカー
 */
function handleTouchOnUnselectedSticker(sticker, touches, targetSticker) {
  // 自動選択
  state.selectSticker(sticker);
  updateInfoButtonVisibility();
  bringToFront(sticker);

  if (touches.length === 1) {
    // 1本指：ドラッグ開始
    state.startDragging(touches[0].clientX, touches[0].clientY);
  } else if (touches.length === 2) {
    // 2本指：ピンチ開始
    startPinchGesture(touches[0], touches[1], targetSticker);
  }
}

/**
 * タッチ移動イベント
 * @param {TouchEvent} e
 */
export function handleTouchMove(e) {
  const touches = e.touches;

  // 選択中のステッカーがあり、2本指になった場合、ピンチ操作を開始
  if (
    state.selectedSticker &&
    touches.length === 2 &&
    !state.isRotating &&
    !state.isDragging
  ) {
    // 待機状態をクリア
    state.canvasTapPending = false;
    state.possibleTap = false;
    state.touchPrepareX = undefined;
    state.touchPrepareY = undefined;

    // ピンチ開始
    startPinchGesture(touches[0], touches[1], state.selectedSticker);
    return;
  }

  // キャンバスタップ待機中の移動検出
  if (state.canvasTapPending && touches.length === 1) {
    const moveDistance = Math.sqrt(
      Math.pow(touches[0].clientX - state.canvasTapX, 2) +
        Math.pow(touches[0].clientY - state.canvasTapY, 2),
    );
    if (moveDistance > INTERACTION_CONFIG.TAP_THRESHOLD_PX) {
      state.canvasTapPending = false;
    }
  }

  if (!state.selectedSticker) return;

  // ドラッグ準備状態からドラッグ開始への移行
  if (
    state.possibleTap &&
    state.touchPrepareX !== undefined &&
    touches.length === 1
  ) {
    const moveDistance = Math.sqrt(
      Math.pow(touches[0].clientX - state.touchPrepareX, 2) +
        Math.pow(touches[0].clientY - state.touchPrepareY, 2),
    );

    if (moveDistance > INTERACTION_CONFIG.TAP_THRESHOLD_PX) {
      state.possibleTap = false;
      state.startDragging(touches[0].clientX, touches[0].clientY);
    }
  }

  // ドラッグ中の処理
  if (state.isDragging && touches.length === 1) {
    e.preventDefault();

    const coords = absoluteToHybrid(touches[0].clientX, touches[0].clientY);
    const newX = coords.x - state.dragStartX;
    const newYPercent = coords.yPercent - state.dragStartYPercent;
    updateStickerPosition(state.selectedSticker, newX, newYPercent);

    const isOver = isOverTrashBtn(touches[0].clientX, touches[0].clientY);
    setTrashDragOver(isOver);
  }

  // ピンチ中の処理
  if (state.isRotating && touches.length === 2) {
    e.preventDefault();

    const touch1 = touches[0];
    const touch2 = touches[1];

    // requestAnimationFrameを使わず即座に反映（慣性を減らす）
    if (!state.selectedSticker) return;

    // リサイズ中クラスを追加（CSSトランジション無効化用）
    state.selectedSticker.element.classList.add('resizing');
    state.selectedSticker.element.classList.add('rotating');

    // 拡大縮小：前フレームからの相対的な変化を計算
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    const currentDistance = Math.sqrt(dx * dx + dy * dy);
    
    // 前フレームからのスケール変化を現在のサイズに適用
    const deltaScale = currentDistance / state.lastPinchDistance;
    const newWidth = state.selectedSticker.width * deltaScale;
    updateStickerSize(state.selectedSticker, newWidth);
    
    // 次のフレームのために距離を更新
    state.updatePinchDistance(currentDistance);

    // 回転
    const angle =
      Math.atan2(touch2.clientY - touch1.clientY, touch2.clientX - touch1.clientX) *
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
  // 空白エリアタップ判定：選択解除
  if (state.canvasTapPending) {
    const tapDuration = Date.now() - (state.canvasTapStartTime || 0);
    if (tapDuration < INTERACTION_CONFIG.TAP_MAX_DURATION_MS) {
      state.deselectAll();
      updateInfoButtonVisibility();
      elements.pasteArea.focus();
    }
    state.canvasTapPending = false;
    state.canvasTapX = undefined;
    state.canvasTapY = undefined;
    return;
  }

  // ステッカータップ判定：選択解除
  if (state.possibleTap && state.selectedSticker) {
    const tapDuration = Date.now() - (state.tapStartTime || 0);
    if (tapDuration < INTERACTION_CONFIG.TAP_MAX_DURATION_MS && !state.isDragging) {
      state.deselectAll();
      updateInfoButtonVisibility();
      state.possibleTap = false;
      state.touchPrepareX = undefined;
      state.touchPrepareY = undefined;
      return;
    }
  }

  // タップフラグをクリア
  state.possibleTap = false;
  state.touchPrepareX = undefined;
  state.touchPrepareY = undefined;

  // ドラッグ/ピンチ終了処理
  if (state.isDragging || state.isRotating) {
    if (state.selectedSticker) {
      // ゴミ箱へのドロップ判定
      if (state.isDragging && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        if (isOverTrashBtn(touch.clientX, touch.clientY)) {
          const stickerToDelete = state.selectedSticker;
          state.deselectAll();
          setTrashDragOver(false);
          await removeSticker(stickerToDelete.id);
          updateInfoButtonVisibility();
          state.endInteraction();
          return;
        }
      }

      // リサイズ中クラスを削除（CSSトランジション復帰）
      state.selectedSticker.element.classList.remove("rotating", "resizing");
      
      // 変更を保存
      await saveStickerChanges(state.selectedSticker);

      // ドラッグ終了時に画面外判定
      if (state.isDragging) {
        const rect = state.selectedSticker.element.getBoundingClientRect();
        
        // 完全に画面外に出たかチェック（回転していても確実に判定）
        const isCompletelyOutside = 
          rect.right <= 0 || 
          rect.left >= window.innerWidth || 
          rect.bottom <= 0 || 
          rect.top >= window.innerHeight;
        
        if (!isCompletelyOutside) {
          // 画面内に見えている部分の幅と高さを計算
          const visibleWidth = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
          const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
          
          // ステッカーの実際のサイズ
          const stickerWidth = rect.width;
          const stickerHeight = rect.height;
          
          // 画面内に見えている割合を計算（幅と高さの両方で判定）
          const visibleRatioX = visibleWidth / stickerWidth;
          const visibleRatioY = visibleHeight / stickerHeight;
          
          // 90%以上が画面外に出ている、または見えている部分が16px未満の場合は中央に戻す
          const isMostlyOutside = visibleRatioX < 0.1 || visibleRatioY < 0.1 || 
                                  visibleWidth < 16 || visibleHeight < 16;
          
          if (isMostlyOutside) {
            // 中央に戻す
            updateStickerPosition(state.selectedSticker, 0, 50);
            await saveStickerChanges(state.selectedSticker);
            showToast("画面外に出たため中央に戻しました");
          }
        } else {
          // 完全に画面外に出た場合も中央に戻す
          updateStickerPosition(state.selectedSticker, 0, 50);
          await saveStickerChanges(state.selectedSticker);
          showToast("画面外に出たため中央に戻しました");
        }
      }
    }
    setTrashDragOver(false);
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
