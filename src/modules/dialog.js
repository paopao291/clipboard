import { elements } from './ui.js';

let dialogElement = null;

/**
 * 確認ダイアログを表示
 * @param {string} message - メッセージ
 * @param {string} confirmText - 確認ボタンのテキスト
 * @param {Function} onConfirm - 確認時のコールバック
 */
export function showConfirmDialog(message, confirmText, onConfirm) {
    // 既存のダイアログがあれば削除
    if (dialogElement) {
        dialogElement.remove();
    }

    // ダイアログを作成
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';
    dialog.innerHTML = `
        <div class="confirm-dialog-content">
            <p class="confirm-dialog-message">${message}</p>
            <div class="confirm-dialog-buttons">
                <button class="confirm-dialog-btn confirm-dialog-cancel">キャンセル</button>
                <button class="confirm-dialog-btn confirm-dialog-confirm">${confirmText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);
    dialogElement = dialog;

    // アニメーション用に少し遅延
    requestAnimationFrame(() => {
        dialog.classList.add('show');
    });

    // ボタンイベント
    const cancelBtn = dialog.querySelector('.confirm-dialog-cancel');
    const confirmBtn = dialog.querySelector('.confirm-dialog-confirm');

    cancelBtn.addEventListener('click', hideDialog);
    confirmBtn.addEventListener('click', () => {
        hideDialog();
        if (onConfirm) onConfirm();
    });

    // 背景クリックで閉じる
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            hideDialog();
        }
    });
}

/**
 * ダイアログを非表示
 */
function hideDialog() {
    if (dialogElement) {
        dialogElement.classList.remove('show');
        setTimeout(() => {
            dialogElement.remove();
            dialogElement = null;
        }, 300);
    }
}
