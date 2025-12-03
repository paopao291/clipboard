import { initDB } from "./modules/db.js";
import { PASTE_AREA_CONFIG } from "./modules/constants.js";
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
  handleKeyboardShortcut,
  setAddButtonTriggered,
} from "./modules/events.js";
import { initWebPSupport } from "./modules/sticker.js";
import { initPhysicsEngine } from "./modules/physics.js";
import {
  initBackgroundDB,
  restoreBackgroundImage,
} from "./modules/background.js";
import { loadStickersFromDB } from "./main/sticker-loader.js";
import {
  handleBackgroundButton,
  handleBackgroundSelect,
  handleSendToBackButton,
  handlePinButton,
  handleBorderButton,
  handleBgRemovalButton,
  handleCopyButton,
  handleLayoutButton,
  togglePhysicsMode,
} from "./main/button-handlers.js";
import { handleSaveButton } from "./main/save-handler.js";

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

  // WebP対応状況をチェック
  await initWebPSupport();

  // 物理エンジンを初期化
  initPhysicsEngine();

  // コピーしたステッカーデータを明示的に復元（リロード後のペースト対応）
  await state.restoreCopiedStickerData();

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

  // モバイルでの長押しペーストを最適化するための設定
  // iOS Safariでの長押しメニュー表示を有効化
  elements.pasteArea.style.webkitUserSelect = "text";
  elements.pasteArea.style.userSelect = "text";
  elements.pasteArea.style.webkitTouchCallout = "default";

  // グローバルなキーボードショートカット（コピー＆ペースト）
  document.addEventListener("keydown", handleKeyboardShortcut);

  // ボタンイベント
  elements.backgroundBtn.addEventListener("click", handleBackgroundButton);
  elements.saveBtn.addEventListener("click", handleSaveButton);
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

  // 縁取りボタンイベント
  elements.borderBtn.addEventListener("click", handleBorderButton);

  // 背景除去ボタンイベント
  elements.bgRemovalBtn.addEventListener("click", handleBgRemovalButton);

  // コピーボタンイベント
  elements.copyBtn.addEventListener("click", handleCopyButton);

  // 物理モードボタンイベント
  elements.physicsBtn.addEventListener("click", togglePhysicsMode);

  // 自動レイアウトボタンイベント
  elements.layoutBtn.addEventListener("click", handleLayoutButton);

  // Escキーでヘルプステッカーを閉じる
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const helpSticker = document.querySelector(".help-sticker");
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

  // タッチイベント（passiveをtrueに変更してスクロール最適化を有効に）
  document.addEventListener("touchmove", handleTouchMove, { passive: true });
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

// DOMContentLoaded後に初期化実行
document.addEventListener("DOMContentLoaded", init);
