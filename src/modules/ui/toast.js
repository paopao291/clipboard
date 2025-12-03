import { TOAST_CONFIG } from "../constants.js";

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
    existingToast.style.transform = "translateX(-50%) translateY(10px)";
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
  toast.style.transform = "translateX(-50%) translateY(10px)";
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
  toast.style.transform = "translateX(-50%) translateY(10px)";
  setTimeout(() => toast.remove(), TOAST_CONFIG.FADE_OUT_DELAY_MS);
}
