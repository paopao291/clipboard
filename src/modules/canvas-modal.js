/**
 * キャンバス設定モーダルモジュール
 */

import { elements } from './ui.js';
import { setAspectRatio, ASPECT_RATIOS, getCurrentAspectRatio } from './canvas-size.js';
import { removeBackgroundImage, hasBackgroundImage } from './background.js';
import { showToast } from './ui.js';

let modalElement = null;

/**
 * 背景画像セクションのHTMLを生成
 * @returns {string} HTML文字列
 */
function getBackgroundSectionHTML() {
  if (hasBackgroundImage()) {
    return `
      <h3 class="canvas-modal-section-title">背景画像</h3>
      <div class="background-controls">
        <button class="background-remove-btn" id="modalBackgroundRemoveBtn">
          <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor">
            <path d="m840-234-80-80v-446H314l-80-80h526q33 0 56.5 23.5T840-760v526ZM792-56l-64-64H200q-33 0-56.5-23.5T120-200v-528l-64-64 56-56 736 736-56 56ZM240-280l120-160 90 120 33-44-283-283v447h447l-80-80H240Zm297-257ZM424-424Z"/>
          </svg>
          背景画像を削除
        </button>
      </div>
    `;
  } else {
    return `
      <h3 class="canvas-modal-section-title">背景画像</h3>
      <div class="background-controls">
        <button class="background-add-btn" id="modalBackgroundAddBtn">
          <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor">
            <path d="M200-120q-33 0-56.5-23.5T120-200v-240h80v240h240v80H200Zm320 0v-80h240v-240h80v240q0 33-23.5 56.5T760-120H520ZM240-280l120-160 90 120 120-160 150 200H240ZM120-520v-240q0-33 23.5-56.5T200-840h240v80H200v240h-80Zm640 0v-240H520v-80h240q33 0 56.5 23.5T840-760v240h-80Zm-140-40q-26 0-43-17t-17-43q0-26 17-43t43-17q26 0 43 17t17 43q0 26-17 43t-43 17Z"/>
          </svg>
          背景画像を設定
        </button>
      </div>
    `;
  }
}

/**
 * 背景画像セクションを更新
 * @param {HTMLElement} section - セクション要素
 */
function updateBackgroundSection(section) {
  section.innerHTML = getBackgroundSectionHTML();
  setupBackgroundButtons(section);
}

/**
 * 背景画像ボタンのイベントリスナーを設定
 * @param {HTMLElement} section - セクション要素
 */
function setupBackgroundButtons(section) {
  const backgroundAddBtn = section.querySelector('#modalBackgroundAddBtn');
  const backgroundRemoveBtn = section.querySelector('#modalBackgroundRemoveBtn');
  
  if (backgroundAddBtn) {
    backgroundAddBtn.addEventListener('click', () => {
      elements.backgroundInput.click();
      
      // 背景画像設定後にモーダルを閉じる
      const handleBackgroundChange = () => {
        setTimeout(() => {
          hideCanvasModal();
        }, 100);
      };
      
      elements.backgroundInput.addEventListener('change', handleBackgroundChange, { once: true });
    });
  }
  
  if (backgroundRemoveBtn) {
    backgroundRemoveBtn.addEventListener('click', async () => {
      await removeBackgroundImage();
      hideCanvasModal();
      showToast('背景画像を削除しました');
    });
  }
}

/**
 * キャンバス設定モーダルを表示
 */
export function showCanvasModal() {
  // 既存のモーダルがあれば削除
  if (modalElement) {
    modalElement.remove();
  }

  // モーダルを作成
  const modal = document.createElement('div');
  modal.className = 'canvas-modal';
  modal.innerHTML = `
    <div class="canvas-modal-content">
      <div class="canvas-modal-header">
        <h2 class="canvas-modal-title">キャンバス設定</h2>
        <button class="canvas-modal-close" aria-label="閉じる">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
            <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
          </svg>
        </button>
      </div>
      
      <div class="canvas-modal-body">
        <!-- アスペクト比セクション -->
        <div class="canvas-modal-section">
          <h3 class="canvas-modal-section-title">キャンバス比率</h3>
          <div class="aspect-ratio-grid">
            ${Object.entries(ASPECT_RATIOS).map(([key, value]) => {
              const isSelected = getCurrentAspectRatio() === value.ratio;
              return `
                <button 
                  class="aspect-ratio-btn ${isSelected ? 'selected' : ''}" 
                  data-ratio="${value.ratio === null ? 'null' : value.ratio}"
                  data-key="${key}"
                >
                  <span class="aspect-ratio-label">${value.name}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
        
        <!-- 背景画像セクション -->
        <div class="canvas-modal-section" id="backgroundSection">
          ${getBackgroundSectionHTML()}
        </div>
        
        <!-- 保存セクション -->
        <div class="canvas-modal-section">
          <h3 class="canvas-modal-section-title">作品の保存</h3>
          <button class="save-work-btn" id="modalSaveBtn">
            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor">
              <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
            </svg>
            画像として保存
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modalElement = modal;

  // アニメーション用に少し遅延
  requestAnimationFrame(() => {
    modal.classList.add('show');
  });

  // イベントリスナーを設定
  setupModalEventListeners(modal);
}

/**
 * モーダルのイベントリスナーを設定
 * @param {HTMLElement} modal - モーダル要素
 */
function setupModalEventListeners(modal) {
  // 閉じるボタン
  const closeBtn = modal.querySelector('.canvas-modal-close');
  closeBtn.addEventListener('click', hideCanvasModal);

  // 背景クリックで閉じる
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      hideCanvasModal();
    }
  });

  // Escキーで閉じる
  const escHandler = (e) => {
    if (e.key === 'Escape' && modalElement) {
      hideCanvasModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // アスペクト比ボタン
  const aspectRatioBtns = modal.querySelectorAll('.aspect-ratio-btn');
  aspectRatioBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const ratioStr = btn.dataset.ratio;
      const ratio = ratioStr === 'null' ? null : parseFloat(ratioStr);
      
      await setAspectRatio(ratio);
      
      // 選択状態を更新
      aspectRatioBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      
      showToast('キャンバス比率を変更しました');
      hideCanvasModal();
    });
  });

  // 背景画像セクションのボタンを設定
  const backgroundSection = modal.querySelector('#backgroundSection');
  if (backgroundSection) {
    setupBackgroundButtons(backgroundSection);
  }

  // 保存ボタン（グローバル関数を呼び出す）
  const saveBtn = modal.querySelector('#modalSaveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      // main.jsのhandleSaveButtonを呼び出す
      if (window.handleSaveButton) {
        window.handleSaveButton();
      }
      hideCanvasModal();
    });
  }
}


/**
 * キャンバス設定モーダルを非表示
 */
export function hideCanvasModal() {
  if (modalElement) {
    modalElement.classList.remove('show');
    setTimeout(() => {
      modalElement.remove();
      modalElement = null;
    }, 300);
  }
}



