/**
 * 背景画像管理モジュール
 */

import { DB_CONFIG } from './constants.js';

const BACKGROUND_STORE_NAME = 'background';
const BACKGROUND_KEY = 'current';

let db = null;

/**
 * 背景画像用のDBを初期化
 * @param {IDBDatabase} database - IndexedDB
 */
export function initBackgroundDB(database) {
  db = database;
}

/**
 * 背景画像を設定
 * @param {File} file - 画像ファイル
 */
export async function setBackgroundImage(file) {
  if (file.type.indexOf("image") === -1) return;
  
  const url = URL.createObjectURL(file);
  
  // canvas要素の背景画像を設定
  const canvasElement = document.getElementById('canvas');
  if (canvasElement) {
    // 画像のみを背景として設定（ドットパターンは「背景なし」のときのみに使用）
    canvasElement.style.backgroundImage = `url(${url})`;
    canvasElement.style.backgroundSize = 'cover';
    canvasElement.style.backgroundPosition = 'center';
    canvasElement.style.backgroundRepeat = 'no-repeat';
  }
  document.body.classList.add('has-background-image');
  
  // IndexedDBに保存（Safari対策：BlobをArrayBufferに変換）
  try {
    const arrayBuffer = await file.arrayBuffer();
    const transaction = db.transaction([BACKGROUND_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(BACKGROUND_STORE_NAME);
    await new Promise((resolve, reject) => {
      const request = objectStore.put({
        id: BACKGROUND_KEY,
        blobData: arrayBuffer,
        blobType: file.type,
        timestamp: Date.now(),
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('背景画像の保存エラー:', error);
  }
}

/**
 * 背景画像を削除
 */
export async function removeBackgroundImage() {
  // 背景画像をクリア（ドットパターンに戻す）
  const canvasElement = document.getElementById('canvas');
  if (canvasElement) {
    canvasElement.style.backgroundImage = '';
    canvasElement.style.backgroundSize = 'var(--spacing-base) var(--spacing-base)';
    canvasElement.style.backgroundPosition = '0 0';
    canvasElement.style.backgroundRepeat = 'repeat';
  }
  document.body.classList.remove('has-background-image');
  
  // IndexedDBから削除
  try {
    const transaction = db.transaction([BACKGROUND_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(BACKGROUND_STORE_NAME);
    await new Promise((resolve, reject) => {
      const request = objectStore.delete(BACKGROUND_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('背景画像の削除エラー:', error);
  }
}

/**
 * 背景画像を復元
 */
export async function restoreBackgroundImage() {
  try {
    const transaction = db.transaction([BACKGROUND_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(BACKGROUND_STORE_NAME);
    const backgroundData = await new Promise((resolve, reject) => {
      const request = objectStore.get(BACKGROUND_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    if (backgroundData) {
      let blob;
      
      // Safari対策：ArrayBufferからBlobを復元
      if (backgroundData.blobData && backgroundData.blobType) {
        blob = new Blob([backgroundData.blobData], { type: backgroundData.blobType });
      } else if (backgroundData.blob) {
        // 旧形式（互換性のため）
        blob = backgroundData.blob;
      }
      
      if (blob) {
        const url = URL.createObjectURL(blob);
        const canvasElement = document.getElementById('canvas');
        if (canvasElement) {
          // 画像のみを背景として設定（ドットパターンは「背景なし」のときのみに使用）
          canvasElement.style.backgroundImage = `url(${url})`;
          canvasElement.style.backgroundSize = 'cover';
          canvasElement.style.backgroundPosition = 'center';
          canvasElement.style.backgroundRepeat = 'no-repeat';
        }
        document.body.classList.add('has-background-image');
      }
    }
  } catch (error) {
    console.error('背景画像の復元エラー:', error);
  }
}

/**
 * 背景画像があるか確認
 * @returns {boolean}
 */
export function hasBackgroundImage() {
  return document.body.classList.contains('has-background-image');
}

/**
 * 背景画像のURLを取得（保存時に使用）
 * @returns {string|null}
 */
export function getBackgroundImageUrl() {
  const canvasElement = document.getElementById('canvas');
  if (canvasElement && canvasElement.style.backgroundImage) {
    const match = canvasElement.style.backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
    return match ? match[1] : null;
  }
  return null;
}

