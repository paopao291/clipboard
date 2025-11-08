import { initDB, loadAllStickersFromDB } from './modules/db.js';
import { PASTE_AREA_CONFIG } from './modules/constants.js';
import {
    initElements,
    showHelp,
    hideHelp,
    updateInfoButtonVisibility,
    showInitialHelp,
    elements
} from './modules/ui.js';
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
    handlePasteAreaKeydown
} from './modules/events.js';
import { addStickerToDOM } from './modules/sticker.js';

/**
 * アプリケーションの初期化
 */
async function init() {
    // DOM要素を取得
    initElements();

    // IndexedDBを初期化
    await initDB();

    // ペーストイベント（pasteAreaのみにバインド）
    elements.pasteArea.addEventListener('paste', handlePaste);

    // ファイル入力イベント
    elements.galleryInput.addEventListener('change', handleFileSelect);
    elements.cameraInput.addEventListener('change', handleFileSelect);

    // ペーストエリアのイベント
    elements.pasteArea.addEventListener('blur', handlePasteAreaBlur);
    elements.pasteArea.addEventListener('input', handlePasteAreaInput);
    elements.pasteArea.addEventListener('keydown', handlePasteAreaKeydown);

    // ボタンイベント
    elements.infoBtn.addEventListener('click', showHelp);
    elements.closeHelp.addEventListener('click', hideHelp);
    elements.helpModal.addEventListener('click', (e) => {
        if (e.target === elements.helpModal) hideHelp();
    });

    // Escキーでヘルプを閉じる
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.helpModal.classList.contains('show')) {
            hideHelp();
        }
    });

    // キャンバスのタッチイベント（スマホでフォーカス）
    elements.canvas.addEventListener('touchstart', handleCanvasTouchStart);

    // キャンバスのクリックイベント（選択解除）
    elements.canvas.addEventListener('mousedown', handleCanvasMouseDown);

    // マウスイベント
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // タッチイベント
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

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

    stickers.forEach(stickerData => {
        const url = URL.createObjectURL(stickerData.blob);
        addStickerToDOM(
            url,
            stickerData.x,
            stickerData.y,
            stickerData.width,
            stickerData.rotation,
            stickerData.id,
            stickerData.zIndex
        );
    });
}

// 初期化実行
init();
