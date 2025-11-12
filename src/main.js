import { initDB, loadAllStickersFromDB, updateStickerInDB } from "./modules/db.js";
import { PASTE_AREA_CONFIG, STICKER_DEFAULTS } from "./modules/constants.js";
import { state } from "./state.js";
import {
  initElements,
  showHelp,
  hideHelp,
  updateInfoButtonVisibility,
  showInitialHelp,
  restoreHelpSticker,
  elements,
} from "./modules/ui.js";
import {
  handlePaste,
  handleFileSelect,
  handleCanvasMouseDown,
  handleCanvasTouchStart,
  handleMouseMove,
  handleMouseUp,
  handleTouchMove,
  handleTouchEnd,
  handlePasteAreaBlur,
  handlePasteAreaInput,
  handlePasteAreaKeydown,
  handleCanvasWheel,
  setAddButtonTriggered,
} from "./modules/events.js";
import { addStickerToDOM, toggleStickerPin, sendToBack } from "./modules/sticker.js";
import { initPhysicsEngine, enablePhysics, disablePhysics, isPhysicsActive } from "./modules/physics.js";
import { startAutoLayout, isLayoutRunning } from "./modules/layout.js";
import { setBackgroundImage, removeBackgroundImage, restoreBackgroundImage, hasBackgroundImage, initBackgroundDB } from "./modules/background.js";

/**
 * アプリケーションの初期化
 */
async function init() {
  // DOM要素を取得
  initElements();

  // IndexedDBを初期化
  const database = await initDB();
  
  // 背景画像用のDBを初期化
  initBackgroundDB(database);

  // 物理エンジンを初期化
  initPhysicsEngine();

  // ペーストイベント（pasteAreaのみにバインド）
  elements.pasteArea.addEventListener("paste", handlePaste);

  // ファイル入力イベント
  elements.galleryInput.addEventListener("change", handleFileSelect);
  elements.cameraInput.addEventListener("change", handleFileSelect);
  elements.backgroundInput.addEventListener("change", handleBackgroundSelect);

  // ペーストエリアのイベント
  elements.pasteArea.addEventListener("blur", handlePasteAreaBlur);
  elements.pasteArea.addEventListener("input", handlePasteAreaInput);
  elements.pasteArea.addEventListener("keydown", handlePasteAreaKeydown);

  // ボタンイベント
  elements.backgroundBtn.addEventListener("click", handleBackgroundButton);
  elements.infoBtn.addEventListener("click", showHelp);
  elements.hideUIBtn.addEventListener("click", () => {
    state.hideUI();
    updateInfoButtonVisibility();
  });
  elements.addBtn.addEventListener("click", () => {
    setAddButtonTriggered();
    elements.galleryInput.click();
  });
  
  // 背面に送るボタンイベント
  elements.sendToBackBtn.addEventListener("click", handleSendToBackButton);
  
  // 固定ボタンイベント
  elements.pinBtn.addEventListener("click", handlePinButton);
  
  // 物理モードボタンイベント
  elements.physicsBtn.addEventListener("click", togglePhysicsMode);
  
  // 自動レイアウトボタンイベント
  elements.layoutBtn.addEventListener("click", handleLayoutButton);

  // Escキーでヘルプステッカーを閉じる
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const helpSticker = document.querySelector('.help-sticker');
      if (helpSticker) {
        hideHelp();
      }
    }
  });

  // オーバーレイのクリックで選択解除してUIを表示
  elements.selectionOverlay.addEventListener("click", () => {
    state.deselectAll();
    state.showUI();
    updateInfoButtonVisibility();
  });

  // キャンバスのタッチイベント（スマホでフォーカス）
  elements.canvas.addEventListener("touchstart", handleCanvasTouchStart);

  // キャンバスのクリックイベント（選択解除）
  elements.canvas.addEventListener("mousedown", handleCanvasMouseDown);

  // キャンバスのホイールイベント（選択中のステッカーを拡大縮小）
  elements.canvas.addEventListener("wheel", handleCanvasWheel, {
    passive: false,
  });

  // マウスイベント
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);

  // タッチイベント
  document.addEventListener("touchmove", handleTouchMove, { passive: false });
  document.addEventListener("touchend", handleTouchEnd);

  // IndexedDBから自動読み込み
  await loadStickersFromDB();

  // ヘルプステッカーを復元
  restoreHelpSticker();
  
  // 背景画像を復元
  await restoreBackgroundImage();

  // インフォボタンの初期表示状態を設定
  updateInfoButtonVisibility();

  // 初回訪問時のみヘルプを表示
  showInitialHelp();

  // 初期フォーカス（ペースト可能にするため）
  setTimeout(() => {
    elements.pasteArea.focus();
  }, PASTE_AREA_CONFIG.FOCUS_DELAY_MS);
}

/**
 * IndexedDBからシールを読み込み
 */
async function loadStickersFromDB() {
  const stickers = await loadAllStickersFromDB();
  
  // データ形式の変換が必要かチェック
  const needsConversion = !localStorage.getItem('hybrid_coordinate_migrated');
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  for (const stickerData of stickers) {
    const url = URL.createObjectURL(stickerData.blob);
    
    let x, yPercent, width;
    
    // X座標の変換（画面中央からのオフセット px）
    if (stickerData.x !== undefined && stickerData.yPercent !== undefined && stickerData.width !== undefined) {
      // 新形式（X:px, Y:%, width:px）
      x = stickerData.x;
      yPercent = stickerData.yPercent;
      width = stickerData.width;
      
      // 異常な値をチェックして修正
      let needsFixing = false;
      
      if (!isFinite(x) || Math.abs(x) > 10000) {
        console.warn(`DBから読み込んだステッカー${stickerData.id}のx座標が異常: ${x} → 0に修正`);
        x = 0;
        needsFixing = true;
      }
      
      if (!isFinite(yPercent) || Math.abs(yPercent) > 200) {
        console.warn(`DBから読み込んだステッカー${stickerData.id}のyPercent座標が異常: ${yPercent} → 50に修正`);
        yPercent = 50;
        needsFixing = true;
      }
      
      if (!isFinite(width) || width < 10 || width > 5000) {
        console.warn(`DBから読み込んだステッカー${stickerData.id}のwidth が異常: ${width} → デフォルトに修正`);
        width = STICKER_DEFAULTS.WIDTH;
        needsFixing = true;
      }
      
      // 修正した場合はDBにも保存
      if (needsFixing) {
        await updateStickerInDB(stickerData.id, { x, yPercent, width });
      }
    } else if (needsConversion) {
      // 旧形式からの変換
      if (stickerData.xPercent !== undefined && stickerData.yPercent !== undefined) {
        // パーセント値形式から変換
        const absoluteX = (stickerData.xPercent / 100) * screenWidth;
        const centerX = screenWidth / 2;
        x = absoluteX - centerX;
        yPercent = stickerData.yPercent;
        
        // サイズの変換
        if (stickerData.widthPercent !== undefined) {
          width = (stickerData.widthPercent / 100) * screenWidth;
        } else if (stickerData.width !== undefined) {
          width = stickerData.width;
        } else {
          width = STICKER_DEFAULTS.WIDTH;
        }
      } else {
        // デフォルト（中央）
        x = 0;
        yPercent = 50;
        width = STICKER_DEFAULTS.WIDTH;
      }
      
      // 変換後のデータをDBに保存
      await updateStickerInDB(stickerData.id, { 
        x, 
        yPercent, 
        width 
      });
    } else {
      // デフォルト
      x = 0;
      yPercent = 50;
      width = STICKER_DEFAULTS.WIDTH;
    }
    
    addStickerToDOM(
      url,
      x,
      yPercent,
      width,
      stickerData.rotation,
      stickerData.id,
      stickerData.zIndex,
      stickerData.isPinned || false,
    );
  }
  
  // 変換完了フラグを保存
  if (needsConversion && stickers.length > 0) {
    localStorage.setItem('hybrid_coordinate_migrated', 'true');
  }
}

/**
 * 物理モードを切り替え
 */
async function togglePhysicsMode() {
  if (isPhysicsActive()) {
    // 物理モード OFF
    await disablePhysics();
    state.disablePhysicsMode();
    elements.physicsBtn.classList.remove("active");
    
    // 選択状態を解除してUIを表示
    state.deselectAll();
    state.showUI();
    
    // pasteAreaを有効化
    elements.pasteArea.disabled = false;
  } else {
    // 物理モード ON
    enablePhysics();
    state.enablePhysicsMode();
    elements.physicsBtn.classList.add("active");
    
    // 選択状態を解除してUIを表示
    state.deselectAll();
    state.showUI();
    
    // pasteAreaを無効化（画像追加不可）
    elements.pasteArea.disabled = true;
    elements.pasteArea.blur(); // フォーカスを外す
  }
  
  // ボタンの表示状態を更新
  updateInfoButtonVisibility();
}

/**
 * 背景画像ボタンハンドラ
 */
function handleBackgroundButton() {
  // 背景画像がある場合は削除、ない場合はアップロード
  if (hasBackgroundImage()) {
    removeBackgroundImage();
  } else {
    elements.backgroundInput.click();
  }
}

/**
 * 背景画像選択ハンドラ
 * @param {Event} e
 */
async function handleBackgroundSelect(e) {
  const file = e.target.files[0];
  
  if (!file) return;
  
  await setBackgroundImage(file);
  
  // 入力をリセット
  e.target.value = "";
}

/**
 * 背面に送るボタンハンドラ
 */
async function handleSendToBackButton() {
  if (!state.selectedSticker) return;
  
  await sendToBack(state.selectedSticker);
  // 選択を解除してUIを表示
  state.deselectAll();
  state.showUI();
  updateInfoButtonVisibility();
}

/**
 * 固定ボタンハンドラ
 */
async function handlePinButton() {
  if (!state.selectedSticker) return;
  
  await toggleStickerPin(state.selectedSticker);
  // 固定ボタンの状態を更新
  updateInfoButtonVisibility();
}

/**
 * 自動レイアウトボタンハンドラ
 */
async function handleLayoutButton() {
  // 既に実行中なら何もしない
  if (isLayoutRunning()) {
    return;
  }

  // ステッカーが2個未満なら何もしない
  if (state.getStickerCount() < 2) {
    return;
  }

  // 物理モードが有効な場合は無効化
  if (isPhysicsActive()) {
    disablePhysics();
    state.disablePhysicsMode();
    elements.physicsBtn.classList.remove("active");
  }

  // 選択状態を解除してUIを表示
  state.deselectAll();
  state.showUI();
  updateInfoButtonVisibility();

  // ボタンをアクティブ状態に
  elements.layoutBtn.classList.add("active");
  elements.layoutBtn.disabled = true;

  try {
    // 自動レイアウトを実行
    await startAutoLayout();
  } finally {
    // ボタンを元の状態に戻す
    elements.layoutBtn.classList.remove("active");
    elements.layoutBtn.disabled = false;
  }
}

// 初期化実行
init();
