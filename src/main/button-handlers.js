/**
 * button-handlers.js
 * ボタンのイベントハンドラー関数群
 */

import { state } from "../state.js";
import { elements, updateInfoButtonVisibility } from "../modules/ui.js";
import { showConfirmDialog } from "../modules/dialog.js";
import { logger } from "../utils/logger.js";
import {
  toggleStickerPin,
  toggleStickerBorder,
  toggleStickerBgRemoval,
  sendToBack,
  copySticker,
} from "../modules/sticker.js";
import {
  setBackgroundImage,
  removeBackgroundImage,
  hasBackgroundImage,
} from "../modules/background.js";
import {
  enablePhysics,
  disablePhysics,
  isPhysicsActive,
} from "../modules/physics.js";
import { startAutoLayout, isLayoutRunning } from "../modules/layout.js";

/**
 * 背景画像ボタンハンドラ
 */
export function handleBackgroundButton() {
  if (hasBackgroundImage()) {
    removeBackgroundImage();
  } else {
    elements.backgroundInput.click();
  }
}

/**
 * 背景画像選択ハンドラ
 */
export async function handleBackgroundSelect(e) {
  const file = e.target.files[0];

  if (!file) return;

  const optimizedImage = await optimizeBackgroundImage(file);
  await setBackgroundImage(optimizedImage);

  e.target.value = "";
}

/**
 * 背景画像を最適なサイズに調整
 */
async function optimizeBackgroundImage(imageFile) {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  const devicePixelRatio = window.devicePixelRatio || 1;
  const maxWidth = screenWidth * devicePixelRatio * 1.5;
  const maxHeight = screenHeight * devicePixelRatio * 1.5;

  const imageUrl = URL.createObjectURL(imageFile);
  const img = new Image();

  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageUrl;
    });

    const originalWidth = img.width;
    const originalHeight = img.height;

    if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
      logger.log("背景画像: リサイズ不要（元サイズ使用）");
      return imageFile;
    }

    let newWidth, newHeight;
    if (originalWidth / originalHeight > maxWidth / maxHeight) {
      newWidth = maxWidth;
      newHeight = (originalHeight * maxWidth) / originalWidth;
    } else {
      newHeight = maxHeight;
      newWidth = (originalWidth * maxHeight) / originalHeight;
    }

    const canvas = document.createElement("canvas");
    canvas.width = newWidth;
    canvas.height = newHeight;
    const ctx = canvas.getContext("2d");

    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, newWidth, newHeight);

    const resizedImageBlob = await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), imageFile.type, 0.92);
    });

    logger.log(
      `背景画像: リサイズ完了 (${originalWidth}x${originalHeight} → ${newWidth}x${newHeight})`,
    );
    return resizedImageBlob;
  } catch (error) {
    logger.error("背景画像のリサイズに失敗:", error);
    return imageFile;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

/**
 * 背面に送るボタンハンドラ
 */
export async function handleSendToBackButton() {
  if (!state.selectedSticker) return;

  await sendToBack(state.selectedSticker);
  state.deselectAll();
  state.showUI();
  updateInfoButtonVisibility();
}

/**
 * 固定ボタンハンドラ
 */
export async function handlePinButton() {
  if (!state.selectedSticker) return;

  await toggleStickerPin(state.selectedSticker);
  updateInfoButtonVisibility();
}

/**
 * 縁取りボタンハンドラ
 */
export async function handleBorderButton() {
  if (!state.selectedSticker) return;

  await toggleStickerBorder(state.selectedSticker);
  updateInfoButtonVisibility();
}

/**
 * 背景除去ボタンハンドラ
 */
export async function handleBgRemovalButton() {
  if (!state.selectedSticker) return;

  const targetSticker = state.selectedSticker;

  showConfirmDialog(
    "背景除去処理を行いますか？<br>この操作は元に戻せません。",
    "実行",
    async () => {
      targetSticker.element.classList.remove("selected");
      state.selectedSticker = null;

      elements.selectionOverlay.classList.remove("visible");
      elements.selectionButtons.classList.add("hidden");
      elements.trashBtn.classList.add("hidden");

      elements.headerButtons.classList.remove("hidden");
      elements.footerButtons.classList.remove("hidden");
      elements.addBtn.classList.remove("hidden");

      await toggleStickerBgRemoval(targetSticker);
      updateInfoButtonVisibility();
    },
  );
}

/**
 * コピーボタンハンドラ
 */
export async function handleCopyButton() {
  if (!state.selectedSticker) return;

  await copySticker(state.selectedSticker);
}

/**
 * 自動レイアウトボタンハンドラ
 */
export async function handleLayoutButton() {
  if (isLayoutRunning()) {
    return;
  }

  if (state.getStickerCount() < 2) {
    return;
  }

  if (isPhysicsActive()) {
    disablePhysics();
    state.disablePhysicsMode();
    elements.physicsBtn.classList.remove("active");
    elements.canvas.classList.remove("physics-mode");
  }

  state.deselectAll();
  state.showUI();
  updateInfoButtonVisibility();

  elements.layoutBtn.classList.add("active");
  elements.layoutBtn.disabled = true;

  try {
    await startAutoLayout();
  } finally {
    elements.layoutBtn.classList.remove("active");
    elements.layoutBtn.disabled = false;
  }
}

/**
 * 物理モードを切り替え
 */
export async function togglePhysicsMode() {
  if (isPhysicsActive()) {
    await disablePhysics();
    state.disablePhysicsMode();
    elements.physicsBtn.classList.remove("active");
    elements.canvas.classList.remove("physics-mode");
    state.deselectAll();
    state.showUI();
    updateInfoButtonVisibility();
  } else {
    try {
      await enablePhysics();
      state.enablePhysicsMode();
      elements.physicsBtn.classList.add("active");
      elements.canvas.classList.add("physics-mode");
      state.deselectAll();
      state.showUI();
      updateInfoButtonVisibility();
    } catch (error) {
      console.error("物理モードの有効化に失敗しました:", error);
      // エラーが発生した場合はボタンの状態を元に戻す
      elements.physicsBtn.classList.remove("active");
      elements.canvas.classList.remove("physics-mode");
    }
  }
}
