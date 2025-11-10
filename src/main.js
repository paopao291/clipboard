import { initDB, loadAllStickersFromDB, updateStickerInDB } from "./modules/db.js";
import { PASTE_AREA_CONFIG } from "./modules/constants.js";
import {
  initElements,
  showHelp,
  hideHelp,
  updateInfoButtonVisibility,
  showInitialHelp,
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
} from "./modules/events.js";
import { addStickerToDOM } from "./modules/sticker.js";

/**
 * アプリケーションの初期化
 */
async function init() {
  // DOM要素を取得
  initElements();

  // IndexedDBを初期化
  await initDB();

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
  elements.closeHelp.addEventListener("click", hideHelp);
  elements.addBtn.addEventListener("click", () => {
    elements.galleryInput.click();
  });
  elements.helpModal.addEventListener("click", (e) => {
    if (e.target === elements.helpModal) hideHelp();
  });

  // Escキーでヘルプを閉じる
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && elements.helpModal.classList.contains("show")) {
      hideHelp();
    }
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
  
  // 座標系の変換が必要かチェック
  const needsCoordinateConversion = !localStorage.getItem('coordinates_migrated_to_center');
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  for (const stickerData of stickers) {
    const url = URL.createObjectURL(stickerData.blob);
    
    // 旧座標系（左上基準）から新座標系（中央基準）に変換
    let x = stickerData.x;
    let y = stickerData.y;
    
    if (needsCoordinateConversion) {
      // 左上基準の座標を中央基準のオフセットに変換
      x = stickerData.x - centerX;
      y = stickerData.y - centerY;
      
      // 変換後の座標をDBに保存
      await updateStickerInDB(stickerData.id, { x, y });
    }
    
    addStickerToDOM(
      url,
      x,
      y,
      stickerData.width,
      stickerData.rotation,
      stickerData.id,
      stickerData.zIndex,
    );
  }
  
  // 変換完了フラグを保存
  if (needsCoordinateConversion && stickers.length > 0) {
    localStorage.setItem('coordinates_migrated_to_center', 'true');
  }
}

// 初期化実行
init();
