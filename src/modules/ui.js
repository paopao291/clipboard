import { DOM_IDS, TOAST_CONFIG, HELP_CONFIG } from "./constants.js";
import { state } from "../state.js";

// DOM要素の取得
export const elements = {
  canvas: null,
  galleryInput: null,
  cameraInput: null,
  pasteArea: null,
  infoBtn: null,
  helpModal: null,
  closeHelp: null,
  trashBtn: null,
  addBtn: null,
};

/**
 * DOM要素を初期化
 */
export function initElements() {
  elements.canvas = document.getElementById(DOM_IDS.CANVAS);
  elements.galleryInput = document.getElementById(DOM_IDS.GALLERY_INPUT);
  elements.cameraInput = document.getElementById(DOM_IDS.CAMERA_INPUT);
  elements.pasteArea = document.getElementById(DOM_IDS.PASTE_AREA);
  elements.infoBtn = document.getElementById(DOM_IDS.INFO_BTN);
  elements.helpModal = document.getElementById(DOM_IDS.HELP_MODAL);
  elements.closeHelp = document.getElementById(DOM_IDS.CLOSE_HELP);
  elements.trashBtn = document.getElementById(DOM_IDS.TRASH_BTN);
  elements.addBtn = document.getElementById(DOM_IDS.ADD_BTN);
}

/**
 * トースト通知を表示
 * @param {string} message - メッセージ
 */
export function showToast(message) {
  // 既存のトーストを削除
  const existingToast = document.querySelector(".toast");
  if (existingToast) {
    existingToast.style.opacity = "0";
    setTimeout(() => existingToast.remove(), TOAST_CONFIG.FADE_OUT_DELAY_MS);
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toast.style.opacity = "0";
  document.body.appendChild(toast);

  // フェードイン
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });

  // フェードアウト
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), TOAST_CONFIG.FADE_OUT_DELAY_MS);
  }, TOAST_CONFIG.DURATION_MS);
}

/**
 * ヘルプモーダルを表示
 */
export function showHelp() {
  elements.helpModal.classList.add("show");
}

/**
 * ヘルプモーダルを非表示
 */
export function hideHelp() {
  elements.helpModal.classList.remove("show");
}

/**
 * ボタンの表示状態を更新
 */
export function updateInfoButtonVisibility() {
  // ステッカーがない場合：インフォボタン+FAB表示、ゴミ箱非表示
  if (state.getStickerCount() === 0) {
    elements.infoBtn.style.display = "flex";
    elements.trashBtn.style.display = "none";
    elements.addBtn.style.display = "flex";
    return;
  }

  // ステッカーあり + 選択中：インフォボタン+ゴミ箱表示、FAB非表示
  // ステッカーあり + 未選択：FAB表示、インフォボタン+ゴミ箱非表示
  if (state.hasSelection()) {
    elements.infoBtn.style.display = "flex";
    elements.trashBtn.style.display = "flex";
    elements.addBtn.style.display = "none";
  } else {
    elements.infoBtn.style.display = "none";
    elements.trashBtn.style.display = "none";
    elements.addBtn.style.display = "flex";
  }
}

/**
 * 初回訪問時のヘルプ表示
 */
export function showInitialHelp() {
  const hasVisited = localStorage.getItem(HELP_CONFIG.STORAGE_KEY);
  if (!hasVisited) {
    setTimeout(() => {
      showHelp();
      localStorage.setItem(HELP_CONFIG.STORAGE_KEY, "true");
    }, HELP_CONFIG.INITIAL_DELAY_MS);
  }
}

/**
 * モバイル判定
 * @returns {boolean}
 */
export function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

/**
 * ゴミ箱ボタンのドラッグオーバー状態を設定
 * @param {boolean} isOver - ドラッグオーバー中かどうか
 */
export function setTrashDragOver(isOver) {
  if (elements.trashBtn) {
    if (isOver) {
      elements.trashBtn.classList.add("drag-over");
    } else {
      elements.trashBtn.classList.remove("drag-over");
    }
  }

  // ドラッグ中のステッカーに吸い込みアニメーション
  if (state.selectedSticker && state.selectedSticker.element) {
    if (isOver) {
      state.selectedSticker.element.classList.add("being-deleted");
    } else {
      state.selectedSticker.element.classList.remove("being-deleted");
    }
  }
}

/**
 * ステッカーがゴミ箱ボタンと重なっているか判定
 * @param {number} x - ステッカーのX座標
 * @param {number} y - ステッカーのY座標
 * @returns {boolean}
 */
export function isOverTrashBtn(x, y) {
  if (!elements.trashBtn) return false;

  const trashRect = elements.trashBtn.getBoundingClientRect();
  return (
    x >= trashRect.left &&
    x <= trashRect.right &&
    y >= trashRect.top &&
    y <= trashRect.bottom
  );
}
