/**
 * UI要素の表示/非表示を管理するモジュール
 */

// 保存時に非表示にするUI要素のセレクタ
const UI_SELECTORS = [
  ".header-buttons",
  ".footer-buttons",
  ".add-btn",
  ".trash-btn",
  ".selection-buttons",
  ".selection-overlay",
  "#pasteArea",
];

/**
 * UI要素を一時的に非表示にする
 * @param {Document} doc - 対象のDocument（デフォルトはglobal document）
 * @returns {Array} 元の表示状態を保存した配列
 */
export function hideUIElements(doc = document) {
  const uiElements = UI_SELECTORS.map((selector) => {
    if (selector.startsWith("#")) {
      return doc.getElementById(selector.slice(1));
    }
    return doc.querySelector(selector);
  });

  return uiElements.map((el) => {
    if (!el) return null;
    const originalDisplay = el.style.display;
    el.style.display = "none";
    return { element: el, originalDisplay };
  });
}

/**
 * UI要素を元の表示状態に戻す
 * @param {Array} hiddenElements - hideUIElementsで取得した配列
 */
export function restoreUIElements(hiddenElements) {
  hiddenElements.forEach((item) => {
    if (item && item.element) {
      item.element.style.display = item.originalDisplay;
    }
  });
}

/**
 * html2canvasのクローンドキュメント内のUI要素を非表示にする
 * @param {Document} clonedDoc - クローンされたドキュメント
 */
export function hideUIElementsInClone(clonedDoc) {
  UI_SELECTORS.forEach((selector) => {
    const el = clonedDoc.querySelector(selector);
    if (el) el.style.display = "none";
  });
}
