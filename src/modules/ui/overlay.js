import { elements } from "./dom-elements.js";

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
