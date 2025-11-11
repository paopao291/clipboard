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
import { addStickerToDOM } from "./modules/sticker.js";
import { initPhysicsEngine, enablePhysics, disablePhysics, isPhysicsActive } from "./modules/physics.js";

/**
 * アプリケーションの初期化
 */
async function init() {
  // DOM要素を取得
  initElements();

  // IndexedDBを初期化
  await initDB();

  // 物理エンジンを初期化
  initPhysicsEngine();

  // ペーストイベント（pasteAreaのみにバインド）
  elements.pasteArea.addEventListener("paste", handlePaste);

  // ファイル入力イベント
  elements.galleryInput.addEventListener("change", handleFileSelect);
  elements.cameraInput.addEventListener("change", handleFileSelect);

  // ペーストエリアのイベント
  elements.pasteArea.addEventListener("blur", handlePasteAreaBlur);
  elements.pasteArea.addEventListener("input", handlePasteAreaInput);
  elements.pasteArea.addEventListener("keydown", handlePasteAreaKeydown);

  // ボタンイベント
  elements.infoBtn.addEventListener("click", showHelp);
  elements.addBtn.addEventListener("click", () => {
    setAddButtonTriggered();
    elements.galleryInput.click();
  });
  
  // 物理モードボタンイベント
  elements.physicsBtn.addEventListener("click", togglePhysicsMode);

  // Escキーでヘルプステッカーを閉じる
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const helpSticker = document.querySelector('.help-sticker');
      if (helpSticker) {
        hideHelp();
      }
    }
  });

  // オーバーレイのクリックで選択解除
  elements.selectionOverlay.addEventListener("click", () => {
    state.deselectAll();
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
function togglePhysicsMode() {
  if (isPhysicsActive()) {
    // 物理モード OFF
    disablePhysics();
    state.disablePhysicsMode();
    elements.physicsBtn.classList.remove("active");
    
    // 選択状態を解除
    state.deselectAll();
    
    // pasteAreaを有効化
    elements.pasteArea.disabled = false;
  } else {
    // 物理モード ON
    enablePhysics();
    state.enablePhysicsMode();
    elements.physicsBtn.classList.add("active");
    
    // 選択状態を解除
    state.deselectAll();
    
    // pasteAreaを無効化（画像追加不可）
    elements.pasteArea.disabled = true;
    elements.pasteArea.blur(); // フォーカスを外す
  }
  
  // ボタンの表示状態を更新
  updateInfoButtonVisibility();
}

// 初期化実行
init();
