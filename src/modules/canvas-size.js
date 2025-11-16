/**
 * キャンバスサイズ（比率）管理モジュール
 */

import { DB_CONFIG } from './constants.js';
import { restoreBackgroundImage } from './background.js';

const CANVAS_SIZE_STORE_NAME = 'canvasSize';
const CANVAS_SIZE_KEY = 'current';

// 利用可能なアスペクト比
export const ASPECT_RATIOS = {
  FREE: { name: '自由', ratio: null }, // null = 画面サイズに合わせる
  SQUARE: { name: '1:1', ratio: 1 },
  FOUR_THREE: { name: '4:3', ratio: 4 / 3 },
  THREE_FOUR: { name: '3:4', ratio: 3 / 4 },
  SIXTEEN_NINE: { name: '16:9', ratio: 16 / 9 },
  NINE_SIXTEEN: { name: '9:16', ratio: 9 / 16 },
};

let db = null;
let currentAspectRatio = ASPECT_RATIOS.FREE.ratio;

/**
 * キャンバスサイズ用のDBを初期化
 * @param {IDBDatabase} database - IndexedDB
 */
export function initCanvasSizeDB(database) {
  db = database;
}

/**
 * 現在のアスペクト比を取得
 * @returns {number|null} アスペクト比（null = 自由）
 */
export function getCurrentAspectRatio() {
  return currentAspectRatio;
}

/**
 * アスペクト比を設定
 * @param {number|null} ratio - アスペクト比（null = 自由）
 */
export async function setAspectRatio(ratio) {
  currentAspectRatio = ratio;
  
  // IndexedDBに保存
  try {
    const transaction = db.transaction([CANVAS_SIZE_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(CANVAS_SIZE_STORE_NAME);
    await new Promise((resolve, reject) => {
      const request = objectStore.put({
        id: CANVAS_SIZE_KEY,
        aspectRatio: ratio,
        timestamp: Date.now(),
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('キャンバスサイズの保存エラー:', error);
  }
  
  // キャンバスのサイズを更新
  updateCanvasSize();
  
  // キャンバス比率変更時も背景画像を維持するため、念のため再適用
  try {
    await restoreBackgroundImage();
  } catch (e) {
    console.error('キャンバス比率変更時の背景復元エラー:', e);
  }
  
  // 物理モードが有効な場合は壁も更新（DOM更新を待つ）
  setTimeout(() => {
    if (typeof window !== 'undefined' && window.appState) {
      if (window.appState.isPhysicsModeActive()) {
        // 動的インポートで循環依存を避ける
        import('./physics.js').then(({ updateWalls }) => {
          updateWalls();
        });
      }
    }
  }, 0);
}

/**
 * 保存されたアスペクト比を復元
 */
export async function restoreAspectRatio() {
  try {
    const transaction = db.transaction([CANVAS_SIZE_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(CANVAS_SIZE_STORE_NAME);
    const savedData = await new Promise((resolve, reject) => {
      const request = objectStore.get(CANVAS_SIZE_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    if (savedData && savedData.aspectRatio !== undefined) {
      currentAspectRatio = savedData.aspectRatio;
      updateCanvasSize();
    }
  } catch (error) {
    console.error('キャンバスサイズの復元エラー:', error);
  }
}

/**
 * キャンバスのサイズを更新
 */
function updateCanvasSize() {
  const canvas = document.getElementById('canvas');
  const app = document.getElementById('app');
  if (!canvas || !app) return;
  
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  
  // 変更前のキャンバス高さを保存（ステッカーの位置変換用）
  const oldCanvasHeight = canvas.getBoundingClientRect().height || screenHeight;
  
  if (currentAspectRatio === null) {
    // 自由サイズ：画面全体を使用
    app.style.display = 'flex';
    app.style.alignItems = 'center';
    app.style.justifyContent = 'center';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.maxWidth = 'none';
    canvas.style.maxHeight = 'none';
    canvas.style.margin = '0';
  } else {
    // アスペクト比を維持
    const screenAspect = screenWidth / screenHeight;
    
    let canvasWidth, canvasHeight;
    
    if (screenAspect > currentAspectRatio) {
      // 画面が横長：高さ基準
      canvasHeight = screenHeight;
      canvasWidth = canvasHeight * currentAspectRatio;
    } else {
      // 画面が縦長：幅基準
      canvasWidth = screenWidth;
      canvasHeight = canvasWidth / currentAspectRatio;
    }
    
    // app要素を中央配置用に設定
    app.style.display = 'flex';
    app.style.alignItems = 'center';
    app.style.justifyContent = 'center';
    
    // キャンバスを中央に配置
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    canvas.style.maxWidth = `${canvasWidth}px`;
    canvas.style.maxHeight = `${canvasHeight}px`;
    canvas.style.margin = '0';
    canvas.style.position = 'relative';
  }
  
  // キャンバスサイズ変更後、ステッカーの位置を再計算
  // 少し遅延を入れて、DOMの更新を待つ
  setTimeout(() => {
    adjustStickerPositionsForCanvasSize(oldCanvasHeight);
  }, 0);
}

/**
 * キャンバスサイズ変更に合わせてステッカーの位置を調整
 * @param {number} oldCanvasHeight - 変更前のキャンバス高さ
 */
function adjustStickerPositionsForCanvasSize(oldCanvasHeight) {
  const canvas = document.getElementById('canvas');
  if (!canvas) return;
  
  const newCanvasHeight = canvas.getBoundingClientRect().height;
  
  // 高さが変わらない場合は何もしない
  if (Math.abs(newCanvasHeight - oldCanvasHeight) < 1) {
    return;
  }
  
  // グローバルなstateオブジェクトにアクセス（循環依存を避けるため）
  // stateはmain.jsで初期化されているので、window経由でアクセスできるようにする
  if (typeof window !== 'undefined' && window.appState) {
    const state = window.appState;
    state.stickers.forEach(sticker => {
      if (sticker.element) {
        // 実際の位置（getBoundingClientRect）から新しいyPercentを計算
        // これにより、画面高さ基準で保存されていたyPercentをキャンバス高さ基準に変換
        const rect = sticker.element.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        
        // キャンバス内の相対Y座標を計算（ステッカーの中心位置）
        const relativeY = rect.top + rect.height / 2 - canvasRect.top;
        const newYPercent = (relativeY / newCanvasHeight) * 100;
        
        // 位置を更新（xはそのまま）
        if (typeof sticker.x === 'number' && isFinite(sticker.x)) {
          sticker.yPercent = newYPercent;
          sticker.element.style.top = `${newYPercent}%`;
        }
      }
    });
  }
}

/**
 * ウィンドウリサイズ時にキャンバスサイズを更新
 */
export function initCanvasSizeListener() {
  window.addEventListener('resize', () => {
    updateCanvasSize();
    // 物理モードが有効な場合は壁も更新
    if (typeof window !== 'undefined' && window.appState) {
      if (window.appState.isPhysicsModeActive()) {
        // 動的インポートで循環依存を避ける
        import('./physics.js').then(({ updateWalls }) => {
          updateWalls();
        });
      }
    }
  });
  // 初期サイズを設定
  updateCanvasSize();
}

