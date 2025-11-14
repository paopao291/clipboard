import { DOM_IDS, TOAST_CONFIG, HELP_CONFIG, HELP_STICKER_CONFIG } from "./constants.js";
import { state } from "../state.js";
import { attachStickerEventListeners } from "./events.js";

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

  // 初期ボーダー幅を計算（BASE_WIDTHの5%、最小8px）
  // 拡大縮小時はtransform: scale()でスケールされるため、初期値のみ設定
  const baseBorderWidth = Math.max(
    HELP_STICKER_OUTLINE_CONFIG.MIN_WIDTH,
    Math.round(HELP_STICKER_CONFIG.BASE_WIDTH * HELP_STICKER_OUTLINE_CONFIG.RATIO)
  );

  // borderを設定（シャドウはCSSで常に適用される）
  if (sticker.hasBorder) {
    // 縁取りあり：help-sticker-contentに白いborder
    helpContent.style.border = `${baseBorderWidth}px solid ${HELP_STICKER_OUTLINE_CONFIG.COLOR}`;
    helpWrapper.style.padding = '';
  } else {
    // 縁取りなし：borderを削除してhelp-sticker-wrapperにpaddingを追加
    helpContent.style.border = 'none';
    helpWrapper.style.padding = `${baseBorderWidth}px`;
  }
}

// DOM要素の取得
export const elements = {
  canvas: null,
  galleryInput: null,
  cameraInput: null,
  backgroundInput: null,
  pasteArea: null,
  headerButtons: null,
  backgroundBtn: null,
  saveBtn: null,
  infoBtn: null,
  hideUIBtn: null,
  selectionButtons: null,
  sendToBackBtn: null,
  pinBtn: null,
  borderBtn: null,
  bgRemovalBtn: null, // 背景除去ボタン
  trashBtn: null,
  addBtn: null,
  footerButtons: null,
  physicsBtn: null,
  layoutBtn: null,
  selectionOverlay: null,
  helpStickerTemplate: null,
};

// ゴミ箱の中心座標（キャッシュ）
let trashCenterX = null;
let trashCenterY = null;

/**
 * DOM要素を初期化
 */
export function initElements() {
  elements.canvas = document.getElementById(DOM_IDS.CANVAS);
  elements.galleryInput = document.getElementById(DOM_IDS.GALLERY_INPUT);
  elements.cameraInput = document.getElementById(DOM_IDS.CAMERA_INPUT);
  elements.backgroundInput = document.getElementById("backgroundInput");
  elements.pasteArea = document.getElementById(DOM_IDS.PASTE_AREA);
  elements.headerButtons = document.querySelector(".header-buttons");
  elements.backgroundBtn = document.getElementById("backgroundBtn");
  elements.saveBtn = document.getElementById("saveBtn");
  elements.infoBtn = document.getElementById(DOM_IDS.INFO_BTN);
  elements.hideUIBtn = document.getElementById("hideUIBtn");
  elements.selectionButtons = document.querySelector(".selection-buttons");
  elements.sendToBackBtn = document.getElementById("sendToBackBtn");
  elements.pinBtn = document.getElementById("pinBtn");
  elements.borderBtn = document.getElementById("borderBtn");
  elements.bgRemovalBtn = document.getElementById("bgRemovalBtn");
  elements.trashBtn = document.getElementById(DOM_IDS.TRASH_BTN);
  elements.addBtn = document.getElementById(DOM_IDS.ADD_BTN);
  elements.footerButtons = document.querySelector(".footer-buttons");
  elements.physicsBtn = document.getElementById("physicsBtn");
  elements.layoutBtn = document.getElementById("layoutBtn");
  elements.selectionOverlay = document.getElementById("selectionOverlay");
  elements.helpStickerTemplate = document.getElementById("helpStickerTemplate");
  
  // ゴミ箱の中心座標を計算（初期化時に一度だけ）
  updateTrashCenter();
}

/**
 * ゴミ箱の中心座標を更新
 */
function updateTrashCenter() {
  if (elements.trashBtn) {
    const rect = elements.trashBtn.getBoundingClientRect();
    trashCenterX = rect.left + rect.width / 2;
    trashCenterY = rect.top + rect.height / 2;
  }
}

// ウィンドウリサイズ時にゴミ箱の座標を再計算
if (typeof window !== 'undefined') {
  window.addEventListener('resize', updateTrashCenter);
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
      // キャッシュされたゴミ箱の中心座標を使用
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
