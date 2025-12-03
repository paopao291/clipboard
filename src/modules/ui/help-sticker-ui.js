import { HELP_CONFIG, HELP_STICKER_CONFIG } from "../constants.js";
import { state } from "../../state.js";
import { attachStickerEventListeners } from "../events.js";
import { elements } from "./dom-elements.js";
import { showOverlay, hideOverlay } from "./overlay.js";
import { updateInfoButtonVisibility } from "./button-visibility.js";

/**
 * ヘルプステッカーの縁取り設定
 */
const HELP_STICKER_OUTLINE_CONFIG = {
  RATIO: 0.05,        // サイズに対する縁取りの比率（5%）
  MIN_WIDTH: 8,       // 最小縁取り幅（px）
  COLOR: '#ffffff',   // 縁取りの色
};

/**
 * ヘルプステッカーの縁取りを設定
 * @param {Object} sticker - ヘルプステッカーオブジェクト
 */
export function updateHelpStickerBorder(sticker) {
  if (!sticker.isHelpSticker || !sticker.element) {
    return;
  }

  const helpWrapper = sticker.element.querySelector('.help-sticker-wrapper');
  const helpContent = sticker.element.querySelector('.help-sticker-content');
  if (!helpWrapper || !helpContent) {
    return;
  }

  // 現在のborderModeを取得（未設定の場合はデフォルト値）
  const borderMode = sticker.borderMode !== undefined ? sticker.borderMode : (sticker.hasBorder ? 2 : 0);

  // borderModeに基づいて縁取り幅を計算（0:なし、1:2.5%、2:5%）
  // ステッカーの基本幅に対するパーセンテージとして計算
  let baseBorderWidth;

  if (borderMode === 0) {
    baseBorderWidth = 0;
  } else {
    // 最大縁取り幅（5%）
    const maxBorderWidth = Math.max(
      HELP_STICKER_OUTLINE_CONFIG.MIN_WIDTH,
      Math.round(HELP_STICKER_CONFIG.BASE_WIDTH * HELP_STICKER_OUTLINE_CONFIG.RATIO)
    );

    // borderMode 1（2.5%）の場合は半分の幅
    baseBorderWidth = borderMode === 1 ? Math.round(maxBorderWidth / 2) : maxBorderWidth;
  }

  // ステッカーの縁取りクラスを更新
  sticker.element.classList.remove('border-mode-0', 'border-mode-1', 'border-mode-2');
  sticker.element.classList.add(`border-mode-${borderMode}`);

  // borderを設定（シャドウはCSSで常に適用される）
  if (borderMode > 0) {
    // 縁取りあり：help-sticker-contentに白いborder
    helpContent.style.border = `${baseBorderWidth}px solid ${HELP_STICKER_OUTLINE_CONFIG.COLOR}`;

    // モード1（2.5%）の場合は残りの2.5%をpaddingとして追加
    if (borderMode === 1) {
      const maxBorderWidth = Math.max(
        HELP_STICKER_OUTLINE_CONFIG.MIN_WIDTH,
        Math.round(HELP_STICKER_CONFIG.BASE_WIDTH * HELP_STICKER_OUTLINE_CONFIG.RATIO)
      );
      const paddingWidth = maxBorderWidth - baseBorderWidth;
      helpWrapper.style.padding = `${paddingWidth}px`;
    } else {
      helpWrapper.style.padding = '';
    }
  } else {
    // 縁取りなし：borderを削除してhelp-sticker-wrapperにpaddingを追加
    helpContent.style.border = 'none';

    // 5%相当のpaddingを追加
    const maxBorderWidth = Math.max(
      HELP_STICKER_OUTLINE_CONFIG.MIN_WIDTH,
      Math.round(HELP_STICKER_CONFIG.BASE_WIDTH * HELP_STICKER_OUTLINE_CONFIG.RATIO)
    );
    helpWrapper.style.padding = `${maxBorderWidth}px`;
  }
}

/**
 * ヘルプステッカーを表示
 */
export function showHelp() {
  // まず選択中のステッカーがあれば選択解除
  if (state.selectedSticker) {
    state.deselectAll();
  }

  // 既にヘルプステッカーが存在する場合は削除
  const existingHelpSticker = document.querySelector('.help-sticker');
  if (existingHelpSticker) {
    const stickerId = parseInt(existingHelpSticker.dataset.id);
    state.removeSticker(stickerId);
    existingHelpSticker.remove();
  }

  // テンプレートをクローン
  const template = elements.helpStickerTemplate.content.cloneNode(true);
  const helpContent = template.querySelector('.help-sticker-content');

  // ステッカーコンテナを作成
  const stickerId = Date.now();
  const stickerDiv = document.createElement("div");
  stickerDiv.className = "sticker help-sticker appearing selected";
  stickerDiv.dataset.id = stickerId;

  // 初期サイズを画面サイズに応じて調整
  const isMobile = window.innerWidth <= 768;
  const initialWidth = isMobile
    ? Math.min(HELP_STICKER_CONFIG.BASE_WIDTH, window.innerWidth * HELP_STICKER_CONFIG.MAX_WIDTH_MOBILE_PERCENT / 100)
    : HELP_STICKER_CONFIG.BASE_WIDTH;
  const initialScale = initialWidth / HELP_STICKER_CONFIG.BASE_WIDTH;

  // コンテンツラッパーを作成（回転とスケール用）
  const contentWrapper = document.createElement("div");
  contentWrapper.className = "help-sticker-wrapper";
  contentWrapper.style.transform = `rotate(${HELP_STICKER_CONFIG.INITIAL_ROTATION}deg) scale(${initialScale})`;
  contentWrapper.appendChild(helpContent);
  stickerDiv.appendChild(contentWrapper);

  // スタイルを設定（画面中央に配置）
  stickerDiv.style.left = `50%`;
  stickerDiv.style.top = `50%`;
  stickerDiv.style.width = `${HELP_STICKER_CONFIG.BASE_WIDTH}px`; // 固定幅
  stickerDiv.style.transform = `translate(-50%, -50%)`;

  // デフォルトのborder-modeクラスを追加（5%）
  stickerDiv.classList.add('border-mode-2');

  // z-indexを設定
  const zIndex = state.incrementZIndex();
  stickerDiv.style.zIndex = zIndex;

  // アニメーション終了後にappearingクラスを削除
  setTimeout(() => {
    stickerDiv.classList.remove("appearing");
  }, 400);

  // イベントリスナーを登録（contentWrapperに設定）
  attachStickerEventListeners(contentWrapper, stickerId);

  // DOMに追加
  elements.canvas.appendChild(stickerDiv);

  // 状態に追加（imgWrapperの代わりにcontentWrapperを使用）
  const helpSticker = {
    id: stickerId,
    url: null, // 画像ではないのでnull
    x: 0, // 中央からのオフセット
    yPercent: 50,
    width: initialWidth,
    rotation: HELP_STICKER_CONFIG.INITIAL_ROTATION,
    zIndex: zIndex,
    element: stickerDiv,
    imgWrapper: contentWrapper, // 回転用のラッパー
    isHelpSticker: true, // ヘルプステッカーであることを示すフラグ
    isPinned: false,
    hasBorder: true, // ヘルプステッカーもデフォルトで縁取りあり
    borderMode: 2, // デフォルトで5%の縁取り
  };
  state.addSticker(helpSticker);

  // 縁取りを設定
  updateHelpStickerBorder(helpSticker);

  // 選択状態にする（オーバーレイ表示）
  state.selectSticker(state.getStickerById(stickerId));
  showOverlay();
  updateInfoButtonVisibility();

  // ヘルプステッカーの状態を保存
  saveHelpStickerState({
    exists: true,
    x: 0,
    yPercent: 50,
    width: initialWidth,
    rotation: HELP_STICKER_CONFIG.INITIAL_ROTATION,
    zIndex: zIndex,
    hasBorder: true,
    borderMode: 2, // デフォルトで5%の縁取り
  });
}

/**
 * ヘルプステッカーの状態をlocalStorageに保存
 * @param {Object} helpState - ヘルプステッカーの状態
 */
function saveHelpStickerState(helpState) {
  localStorage.setItem('helpStickerState', JSON.stringify(helpState));
}

/**
 * ヘルプステッカーの状態をlocalStorageから取得
 * @returns {Object|null}
 */
function getHelpStickerState() {
  const savedData = localStorage.getItem('helpStickerState');
  return savedData ? JSON.parse(savedData) : null;
}

/**
 * ヘルプステッカーの状態を削除
 */
export function clearHelpStickerState() {
  localStorage.removeItem('helpStickerState');
}

/**
 * 保存されたヘルプステッカーを復元
 */
export function restoreHelpSticker() {
  const savedState = getHelpStickerState();

  if (!savedState || !savedState.exists) {
    return;
  }

  // テンプレートが存在するか確認
  if (!elements.helpStickerTemplate) {
    console.error('ヘルプステッカーテンプレートが見つかりません');
    return;
  }

  // テンプレートをクローン
  const template = elements.helpStickerTemplate.content.cloneNode(true);
  const helpContent = template.querySelector('.help-sticker-content');

  // ステッカーコンテナを作成
  const stickerId = Date.now();
  const stickerDiv = document.createElement("div");
  stickerDiv.className = "sticker help-sticker";
  stickerDiv.dataset.id = stickerId;

  // 復元時にもサイズ制約を適用
  const isMobile = window.innerWidth <= 768;
  const maxWidth = isMobile
    ? Math.min(HELP_STICKER_CONFIG.MAX_WIDTH_DESKTOP, window.innerWidth * HELP_STICKER_CONFIG.MAX_WIDTH_MOBILE_PERCENT / 100)
    : HELP_STICKER_CONFIG.MAX_WIDTH_DESKTOP;

  const constrainedWidth = Math.max(
    HELP_STICKER_CONFIG.MIN_WIDTH,
    Math.min(maxWidth, savedState.width),
  );

  // コンテンツラッパーを作成（回転とスケール用）
  const contentWrapper = document.createElement("div");
  contentWrapper.className = "help-sticker-wrapper";
  const scale = constrainedWidth / HELP_STICKER_CONFIG.BASE_WIDTH;
  contentWrapper.style.transform = `rotate(${savedState.rotation}deg) scale(${scale})`;
  contentWrapper.appendChild(helpContent);
  stickerDiv.appendChild(contentWrapper);

  // スタイルを設定（保存された位置に配置）
  stickerDiv.style.left = `calc(50% + ${savedState.x}px)`;
  stickerDiv.style.top = `${savedState.yPercent}%`;
  stickerDiv.style.transform = `translate(-50%, -50%)`;
  stickerDiv.style.width = `${HELP_STICKER_CONFIG.BASE_WIDTH}px`; // 固定幅

  // z-indexを設定
  stickerDiv.style.zIndex = savedState.zIndex;
  state.updateZIndexCounter(savedState.zIndex);

  // イベントリスナーを登録（contentWrapperに設定）
  attachStickerEventListeners(contentWrapper, stickerId);

  // DOMに追加
  elements.canvas.appendChild(stickerDiv);

  // 状態に追加
  const helpSticker = {
    id: stickerId,
    url: null,
    x: savedState.x,
    yPercent: savedState.yPercent,
    width: constrainedWidth, // 制約されたwidthを使用
    rotation: savedState.rotation,
    zIndex: savedState.zIndex,
    element: stickerDiv,
    imgWrapper: contentWrapper,
    isHelpSticker: true,
    isPinned: savedState.isPinned || false,
    hasBorder: savedState.hasBorder !== undefined ? savedState.hasBorder : true,
    borderMode: savedState.borderMode !== undefined ? savedState.borderMode : 2, // デフォルトは8px
  };
  state.addSticker(helpSticker);

  // 固定状態を反映
  if (helpSticker.isPinned) {
    stickerDiv.classList.add('pinned');
  }

  // 縁取り状態を反映
  if (!helpSticker.hasBorder) {
    stickerDiv.classList.add('no-border');
  }

  // borderModeクラスを反映
  const borderMode = helpSticker.borderMode !== undefined ? helpSticker.borderMode : 2;
  stickerDiv.classList.add(`border-mode-${borderMode}`);

  // 縁取りを設定
  updateHelpStickerBorder(helpSticker);
}

/**
 * ヘルプモーダルを非表示（互換性のため残す）
 */
export function hideHelp() {
  // 新しい実装ではヘルプステッカーを削除することで非表示にする
  const helpSticker = document.querySelector('.help-sticker');
  if (helpSticker) {
    const stickerId = parseInt(helpSticker.dataset.id);
    state.removeSticker(stickerId);
    helpSticker.remove();
    hideOverlay();
    updateInfoButtonVisibility();
    // ヘルプステッカーの状態を削除
    clearHelpStickerState();
  }
}

/**
 * ヘルプステッカーの状態を更新
 * @param {Object} sticker - ヘルプステッカーオブジェクト
 */
export function updateHelpStickerState(sticker) {
  if (!sticker || !sticker.isHelpSticker) {
    return;
  }

  // STICKER_DEFAULTSをインポートしていないので直接値を指定
  const defaultBorderMode = 2; // STICKER_DEFAULTS.BORDER_MODE

  saveHelpStickerState({
    exists: true,
    x: sticker.x,
    yPercent: sticker.yPercent,
    width: sticker.width,
    rotation: sticker.rotation,
    zIndex: sticker.zIndex,
    isPinned: sticker.isPinned || false,
    hasBorder: sticker.hasBorder !== undefined ? sticker.hasBorder : true,
    borderMode: sticker.borderMode !== undefined ? sticker.borderMode : defaultBorderMode,
  });
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
