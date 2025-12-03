import { state } from "../../state.js";
import { elements } from "./dom-elements.js";

/**
 * ボタンの表示状態を更新
 */
export function updateInfoButtonVisibility() {
  // 物理モード中は追加ボタンとheader-buttonsを常に非表示
  const isPhysicsMode = state.isPhysicsModeActive();

  if (isPhysicsMode) {
    elements.addBtn.classList.add("hidden");
    elements.headerButtons.classList.add("hidden");
  }

  // UIが非表示状態の場合、選択中のステッカー関連UI以外を非表示
  const isUIVisible = state.isUIVisibleState();

  // UI表示状態をcanvasに反映（斜線の表示制御用）
  elements.canvas.classList.toggle('ui-hidden', !isUIVisible);

  // 固定されていないステッカーの数をカウント
  const unpinnedCount = state.stickers.filter(s => !s.isPinned).length;

  // ステッカーがない場合：右上ボタン群+FAB表示、選択ボタン群・ゴミ箱・左下ボタン群非表示
  if (state.getStickerCount() === 0) {
    elements.headerButtons.classList.toggle("hidden", !isUIVisible || isPhysicsMode);
    elements.selectionButtons.classList.add("hidden");
    elements.trashBtn.classList.add("hidden");
    if (!isPhysicsMode) {
      elements.addBtn.classList.toggle("hidden", !isUIVisible);
    }
    elements.footerButtons.classList.add("hidden");
    return;
  }

  // ステッカーあり + 選択中：選択ボタン群とゴミ箱表示、その他非表示
  // ステッカーあり + 未選択：右上ボタン群+FAB+左下ボタン群表示、選択ボタン群とゴミ箱非表示
  if (state.hasSelection()) {
    elements.headerButtons.classList.add("hidden");
    elements.selectionButtons.classList.remove("hidden");
    elements.trashBtn.classList.remove("hidden");
    if (!isPhysicsMode) {
      elements.addBtn.classList.add("hidden");
    }
    elements.footerButtons.classList.add("hidden");

    // ヘルプステッカーが選択されている場合、コピーボタンと背景除去ボタンに属性を追加
    const isHelpSticker = state.selectedSticker.element.classList.contains('help-sticker');
    elements.copyBtn.setAttribute('data-for-help-sticker', isHelpSticker);
    elements.bgRemovalBtn.setAttribute('data-for-help-sticker', isHelpSticker);

    // 固定ボタンの状態を更新（pinBtnはselectionButtons内にあるので個別制御不要）
    if (state.selectedSticker.isPinned) {
      elements.pinBtn.classList.add('pinned');
    } else {
      elements.pinBtn.classList.remove('pinned');
    }

    // 縁取りボタンの状態を更新（hasBorderとborderMode）
    if (state.selectedSticker.hasBorder === false) {
      elements.borderBtn.classList.add('no-border');
    } else {
      elements.borderBtn.classList.remove('no-border');
    }

    // border-modeクラスをすべて削除
    elements.borderBtn.classList.remove('border-mode-0', 'border-mode-1', 'border-mode-2');

    // 現在のborderModeクラスを追加
    const borderMode = state.selectedSticker.borderMode !== undefined ?
      state.selectedSticker.borderMode :
      (state.selectedSticker.hasBorder ? 2 : 0); // デフォルト：hasBorder ? 8px : なし

    elements.borderBtn.classList.add(`border-mode-${borderMode}`);

    // 背景除去ボタンの表示・非表示を更新
    if (state.selectedSticker.bgRemovalProcessed) {
      // 背景除去済みの場合は背景除去ボタンを非表示
      elements.bgRemovalBtn.style.display = 'none';
    } else {
      // まだ背景除去していない場合のみ表示
      elements.bgRemovalBtn.style.display = '';
    }
  } else {
    elements.headerButtons.classList.toggle("hidden", !isUIVisible || isPhysicsMode);
    elements.selectionButtons.classList.add("hidden");
    elements.trashBtn.classList.add("hidden");
    if (!isPhysicsMode) {
      elements.addBtn.classList.toggle("hidden", !isUIVisible);
    }
    elements.footerButtons.classList.toggle("hidden", !isUIVisible);

    // 固定されていないステッカーが0個の場合、物理モードボタンを非表示
    if (unpinnedCount === 0) {
      elements.physicsBtn.classList.add("hidden");
    } else {
      elements.physicsBtn.classList.toggle("hidden", !isUIVisible);
    }

    // 固定されていないステッカーが2個以上ある場合のみレイアウトボタンを表示
    if (unpinnedCount >= 2) {
      elements.layoutBtn.classList.toggle("hidden", !isUIVisible);
    } else {
      elements.layoutBtn.classList.add("hidden");
    }
  }
}
