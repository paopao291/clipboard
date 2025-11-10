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
  
  // パーセント値への変換が必要かチェック
  const needsPercentConversion = !localStorage.getItem('coordinates_migrated_to_percent');
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  for (const stickerData of stickers) {
    const url = URL.createObjectURL(stickerData.blob);
    
    let xPercent, yPercent;
    
    // すでにパーセント値で保存されているかチェック
    if (stickerData.xPercent !== undefined && stickerData.yPercent !== undefined) {
      // パーセント値で保存されている場合
      xPercent = stickerData.xPercent;
      yPercent = stickerData.yPercent;
    } else if (needsPercentConversion) {
      // 旧形式（ピクセル値）からパーセント値に変換
      // x, y が存在する場合（中央基準オフセット or 左上基準の座標）
      if (stickerData.x !== undefined && stickerData.y !== undefined) {
        // 中央基準のオフセット値からパーセント値に変換
        // 注: 以前の中央基準実装では calc(50% + x px) だったので
        // x, y はオフセット値として扱う
        const centerXPx = screenWidth / 2;
        const centerYPx = screenHeight / 2;
        const absoluteX = centerXPx + stickerData.x;
        const absoluteY = centerYPx + stickerData.y;
        xPercent = (absoluteX / screenWidth) * 100;
        yPercent = (absoluteY / screenHeight) * 100;
      } else {
        // デフォルト（中央）
        xPercent = 50;
        yPercent = 50;
      }
      
      // 変換後の座標をDBに保存
      await updateStickerInDB(stickerData.id, { xPercent, yPercent });
    } else {
      // 変換済みだがパーセント値がない場合（エラー時のフォールバック）
      xPercent = 50;
      yPercent = 50;
    }
    
    addStickerToDOM(
      url,
      xPercent,
      yPercent,
      stickerData.width,
      stickerData.rotation,
      stickerData.id,
      stickerData.zIndex,
    );
  }
  
  // 変換完了フラグを保存
  if (needsPercentConversion && stickers.length > 0) {
    localStorage.setItem('coordinates_migrated_to_percent', 'true');
  }
}

// 初期化実行
init();
