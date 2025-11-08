import { DOM_IDS, TOAST_CONFIG, HELP_CONFIG } from './constants.js';
import { state } from '../state.js';

// DOM要素の取得
export const elements = {
    canvas: null,
    galleryInput: null,
    cameraInput: null,
    pasteArea: null,
    infoBtn: null,
    helpModal: null,
    closeHelp: null
};

/**
 * DOM要素を初期化
 */
export function initElements() {
    elements.canvas = document.getElementById(DOM_IDS.CANVAS);
    elements.galleryInput = document.getElementById(DOM_IDS.GALLERY_INPUT);
    elements.cameraInput = document.getElementById(DOM_IDS.CAMERA_INPUT);
    elements.pasteArea = document.getElementById(DOM_IDS.PASTE_AREA);
    elements.infoBtn = document.getElementById(DOM_IDS.INFO_BTN);
    elements.helpModal = document.getElementById(DOM_IDS.HELP_MODAL);
    elements.closeHelp = document.getElementById(DOM_IDS.CLOSE_HELP);
}

/**
 * トースト通知を表示
 * @param {string} message - メッセージ
 */
export function showToast(message) {
    // 既存のトーストを削除
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.style.opacity = '0';
        setTimeout(() => existingToast.remove(), TOAST_CONFIG.FADE_OUT_DELAY_MS);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.opacity = '0';
    document.body.appendChild(toast);

    // フェードイン
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });

    // フェードアウト
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), TOAST_CONFIG.FADE_OUT_DELAY_MS);
    }, TOAST_CONFIG.DURATION_MS);
}

/**
 * ヘルプモーダルを表示
 */
export function showHelp() {
    elements.helpModal.classList.add('show');
}

/**
 * ヘルプモーダルを非表示
 */
export function hideHelp() {
    elements.helpModal.classList.remove('show');
}

/**
 * インフォボタンの表示状態を更新
 */
export function updateInfoButtonVisibility() {
    // ステッカーがない場合：表示
    if (state.getStickerCount() === 0) {
        elements.infoBtn.style.display = 'flex';
        return;
    }

    // ステッカーあり + 選択中：表示
    // ステッカーあり + 未選択：非表示
    if (state.hasSelection()) {
        elements.infoBtn.style.display = 'flex';
    } else {
        elements.infoBtn.style.display = 'none';
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
            localStorage.setItem(HELP_CONFIG.STORAGE_KEY, 'true');
        }, HELP_CONFIG.INITIAL_DELAY_MS);
    }
}

/**
 * モバイル判定
 * @returns {boolean}
 */
export function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
