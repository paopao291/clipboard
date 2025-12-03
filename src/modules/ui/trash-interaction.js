import { state } from "../../state.js";
import { elements, getTrashCenter } from "./dom-elements.js";

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
      // キャッシュされたゴミ箱の中心座標を使用
      const { x: trashCenterX, y: trashCenterY } = getTrashCenter();
      if (trashCenterX !== null && trashCenterY !== null) {
        const stickerRect = state.selectedSticker.element.getBoundingClientRect();
        const originX = ((trashCenterX - stickerRect.left) / stickerRect.width) * 100;
        const originY = ((trashCenterY - stickerRect.top) / stickerRect.height) * 100;

        // 通常のステッカー
        const img = state.selectedSticker.element.querySelector('img');
        if (img) {
          img.style.transformOrigin = `${originX}% ${originY}%`;
        }

        // ヘルプステッカー
        const helpContent = state.selectedSticker.element.querySelector('.help-sticker-content');
        if (helpContent) {
          helpContent.style.transformOrigin = `${originX}% ${originY}%`;
        }

        // ステッカーをゴミ箱の中心に移動
        // 元の位置を保存（x, yPercentベース）
        state.selectedSticker.element.dataset.originalX = state.selectedSticker.x;
        state.selectedSticker.element.dataset.originalYPercent = state.selectedSticker.yPercent;

        // ゴミ箱の中心に移動（絶対座標）
        state.selectedSticker.element.style.left = `${trashCenterX}px`;
        state.selectedSticker.element.style.top = `${trashCenterY}px`;
      }

      state.selectedSticker.element.classList.add("being-deleted");
    } else {
      // 元の位置に戻す
      if (state.selectedSticker.element.dataset.originalX !== undefined) {
        const x = parseFloat(state.selectedSticker.element.dataset.originalX);
        const yPercent = parseFloat(state.selectedSticker.element.dataset.originalYPercent);

        state.selectedSticker.element.style.left = `calc(50% + ${x}px)`;
        state.selectedSticker.element.style.top = `${yPercent}%`;

        delete state.selectedSticker.element.dataset.originalX;
        delete state.selectedSticker.element.dataset.originalYPercent;
      }

      state.selectedSticker.element.classList.remove("being-deleted");
    }
  }
}

/**
 * ドラッグ終了時にtransform-originと位置をリセット
 */
export function resetStickerTransformOrigin() {
  if (state.selectedSticker && state.selectedSticker.element) {
    // transform-originをリセット
    const img = state.selectedSticker.element.querySelector('img');
    if (img) {
      img.style.transformOrigin = '';
    }

    const helpContent = state.selectedSticker.element.querySelector('.help-sticker-content');
    if (helpContent) {
      helpContent.style.transformOrigin = '';
    }

    // 保存された元の位置があれば戻す
    if (state.selectedSticker.element.dataset.originalX !== undefined) {
      const x = parseFloat(state.selectedSticker.element.dataset.originalX);
      const yPercent = parseFloat(state.selectedSticker.element.dataset.originalYPercent);

      state.selectedSticker.element.style.left = `calc(50% + ${x}px)`;
      state.selectedSticker.element.style.top = `${yPercent}%`;

      delete state.selectedSticker.element.dataset.originalX;
      delete state.selectedSticker.element.dataset.originalYPercent;
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
