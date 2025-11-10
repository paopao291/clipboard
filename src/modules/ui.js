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
  selectionOverlay: null,
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
  elements.selectionOverlay = document.getElementById("selectionOverlay");
}

/**
 * トースト通知を表示
 * @param {string} message - メッセージ
 * @param {Object} options - オプション
 * @param {string} options.actionText - アクションボタンのテキスト
 * @param {Function} options.onAction - アクションボタンのコールバック
 * @param {number} options.duration - 表示時間（ミリ秒）
 */
export function showToast(message, options = {}) {
  // 既存のトーストを削除
  const existingToast = document.querySelector(".toast");
  if (existingToast) {
    // 既存のタイムアウトをクリア
    if (existingToast._hideTimeout) {
      clearTimeout(existingToast._hideTimeout);
    }
    existingToast.style.opacity = "0";
    existingToast.style.transform = "translateX(-50%) translateY(-10px)";
    setTimeout(() => existingToast.remove(), TOAST_CONFIG.FADE_OUT_DELAY_MS);
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  
  // メッセージとアクションボタンを追加
  const messageSpan = document.createElement("span");
  messageSpan.className = "toast-message";
  messageSpan.textContent = message;
  toast.appendChild(messageSpan);

  // アクションボタンがある場合
  if (options.actionText && options.onAction) {
    const actionBtn = document.createElement("button");
    actionBtn.className = "toast-action";
    actionBtn.textContent = options.actionText;
    actionBtn.addEventListener("click", () => {
      options.onAction();
      hideToast(toast);
    });
    toast.appendChild(actionBtn);
  }

  toast.style.opacity = "0";
  toast.style.transform = "translateX(-50%) translateY(-10px)";
  document.body.appendChild(toast);

  // スライドイン + フェードイン
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(0)";
    });
  });

  // スライドアウト + フェードアウト
  const duration = options.duration || TOAST_CONFIG.DURATION_MS;
  const hideTimeout = setTimeout(() => {
    hideToast(toast);
  }, duration);

  // タイムアウトを保存
  toast._hideTimeout = hideTimeout;
}

/**
 * トーストを非表示
 * @param {HTMLElement} toast - トースト要素
 */
function hideToast(toast) {
  if (toast._hideTimeout) {
    clearTimeout(toast._hideTimeout);
  }
  toast.style.opacity = "0";
  toast.style.transform = "translateX(-50%) translateY(-10px)";
  setTimeout(() => toast.remove(), TOAST_CONFIG.FADE_OUT_DELAY_MS);
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
    elements.infoBtn.classList.remove("hidden");
    elements.trashBtn.classList.add("hidden");
    elements.addBtn.classList.remove("hidden");
    return;
  }

  // ステッカーあり + 選択中：インフォボタン+ゴミ箱表示、FAB非表示
  // ステッカーあり + 未選択：FAB表示、インフォボタン+ゴミ箱非表示
  if (state.hasSelection()) {
    elements.infoBtn.classList.remove("hidden");
    elements.trashBtn.classList.remove("hidden");
    elements.addBtn.classList.add("hidden");
  } else {
    elements.infoBtn.classList.add("hidden");
    elements.trashBtn.classList.add("hidden");
    elements.addBtn.classList.remove("hidden");
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

/**
 * オーバーレイを表示
 */
export function showOverlay() {
  if (elements.selectionOverlay) {
    elements.selectionOverlay.classList.add("visible");
  }
}

/**
 * オーバーレイを非表示
 */
export function hideOverlay() {
  if (elements.selectionOverlay) {
    elements.selectionOverlay.classList.remove("visible", "delete-mode");
  }
}

/**
 * オーバーレイを削除モードに切り替え
 * @param {boolean} isDeleteMode - 削除モードかどうか
 */
export function setOverlayDeleteMode(isDeleteMode) {
  if (elements.selectionOverlay) {
    if (isDeleteMode) {
      elements.selectionOverlay.classList.add("delete-mode");
    } else {
      elements.selectionOverlay.classList.remove("delete-mode");
    }
  }
}
