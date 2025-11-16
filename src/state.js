import { STICKER_DEFAULTS } from "./modules/constants.js";
import { showOverlay, hideOverlay } from "./modules/ui.js";

/**
 * アプリケーションの状態管理
 */
class AppState {
  constructor() {
    this.stickers = [];
    this.selectedSticker = null;
    this.isDragging = false;
    this.isRotating = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.startAngle = 0;
    this.lastTouchX = null;
    this.lastTouchY = null;
    this.lastMouseX = null;
    this.lastMouseY = null;
    this.zIndexCounter = STICKER_DEFAULTS.Z_INDEX_START;
    this.initialPinchDistance = 0;
    this.initialWidth = 0;
    // タップ/クリック判定用（選択解除）
    this.possibleTap = false;
    this.tapStartTime = 0;
    this.possibleClick = false;
    this.clickStartTime = 0;
    // ドラッグ準備座標
    this.dragPrepareX = undefined;
    this.dragPrepareY = undefined;
    // タッチドラッグ準備座標
    this.touchPrepareX = undefined;
    this.touchPrepareY = undefined;
    // 物理モード
    this.isPhysicsMode = false;
    // UI表示状態（重力・斥力・追加ボタン）
    this.isUIVisible = true;
    // コピーしたステッカーデータ
    this.copiedStickerData = null;
    // コピーした識別子（形式：sticker:123456）
    this.copiedStickerId = null;
    
    // LocalStorageからコピーデータの復元を試行
    this.restoreCopiedStickerData();
  }

  /**
   * シールを追加
   * @param {Object} sticker - シールオブジェクト
   */
  addSticker(sticker) {
    this.stickers.push(sticker);
  }

  /**
   * シールを削除
   * @param {number} id - シールID
   * @returns {Object|null} 削除されたシール
   */
  removeSticker(id) {
    const index = this.stickers.findIndex((s) => s.id === id);
    if (index !== -1) {
      const sticker = this.stickers[index];

      // 削除するステッカーが選択中だった場合、選択を解除
      if (this.selectedSticker === sticker) {
        this.selectedSticker = null;
      }

      this.stickers.splice(index, 1);
      return sticker;
    }
    return null;
  }

  /**
   * IDでシールを取得
   * @param {number} id - シールID
   * @returns {Object|undefined}
   */
  getStickerById(id) {
    return this.stickers.find((s) => s.id === id);
  }

  /**
   * シールを選択
   * @param {Object} sticker - シールオブジェクト
   */
  selectSticker(sticker) {
    // すべての選択を解除
    this.stickers.forEach((s) => s.element.classList.remove("selected"));

    // 新しいシールを選択
    if (sticker) {
      sticker.element.classList.add("selected");
      // オーバーレイを表示
      showOverlay();
      // UI非表示状態を解除（選択モードはUI表示が前提）
      this.showUI();
      
      // iOS最適化：ピンチ操作をスムーズにするため、キャンバスのtouch-actionを変更
      const canvas = document.querySelector('.canvas');
      if (canvas) {
        canvas.style.touchAction = 'none';
      }
    }

    this.selectedSticker = sticker;
  }

  /**
   * 選択を解除
   */
  deselectAll() {
    this.stickers.forEach((s) => s.element.classList.remove("selected"));
    this.selectedSticker = null;
    // オーバーレイを非表示
    hideOverlay();
    
    // iOS最適化：キャンバスのtouch-actionを元に戻す
    const canvas = document.querySelector('.canvas');
    if (canvas) {
      canvas.style.touchAction = '';
    }
  }

  /**
   * z-indexカウンターをインクリメント
   * @returns {number} 新しいz-index
   */
  incrementZIndex() {
    this.zIndexCounter++;
    return this.zIndexCounter;
  }

  /**
   * z-indexカウンターを更新（最大値を追跡）
   * @param {number} zIndex - z-index値
   */
  updateZIndexCounter(zIndex) {
    if (zIndex > this.zIndexCounter) {
      this.zIndexCounter = zIndex;
    }
  }

  /**
   * ドラッグ開始
   * @param {number} clientX - 画面左上からの絶対X座標
   * @param {number} clientY - 画面左上からの絶対Y座標
   */
  startDragging(clientX, clientY) {
    this.isDragging = true;
    // 絶対座標をハイブリッド座標に変換
    const centerX = window.innerWidth / 2;
    const offsetX = clientX - centerX;
    const yPercent = (clientY / window.innerHeight) * 100;
    // ステッカーの中心からマウス位置までのオフセットを保存
    this.dragStartX = offsetX - this.selectedSticker.x;
    this.dragStartYPercent = yPercent - this.selectedSticker.yPercent;
  }

  /**
   * 回転開始
   * @param {number} angle - 開始角度
   */
  startRotating(angle) {
    this.isRotating = true;
    this.startAngle = angle - this.selectedSticker.rotation;
  }

  /**
   * ピンチ開始
   * @param {number} distance - 初期距離
   * @param {number} width - 初期幅（px）
   */
  startPinch(distance, width) {
    this.initialPinchDistance = distance;
    this.initialWidth = width;
    this.lastPinchDistance = distance; // 前フレームの距離を保存
  }

  /**
   * ピンチ距離を更新
   * @param {number} distance - 現在の距離
   */
  updatePinchDistance(distance) {
    this.lastPinchDistance = distance;
  }

  /**
   * タッチ位置を記録
   * @param {number} x - X座標
   * @param {number} y - Y座標
   */
  setLastTouchPosition(x, y) {
    this.lastTouchX = x;
    this.lastTouchY = y;
  }
  
  /**
   * マウス位置を記録
   * @param {number} x - X座標
   * @param {number} y - Y座標
   */
  setLastMousePosition(x, y) {
    this.lastMouseX = x;
    this.lastMouseY = y;
  }

  /**
   * 操作を終了
   */
  endInteraction() {
    this.isDragging = false;
    this.isRotating = false;
  }

  /**
   * シールの数を取得
   * @returns {number}
   */
  getStickerCount() {
    return this.stickers.length;
  }

  /**
   * 選択されているか確認
   * @returns {boolean}
   */
  hasSelection() {
    return this.selectedSticker !== null;
  }

  /**
   * 物理モードを有効化
   */
  enablePhysicsMode() {
    this.isPhysicsMode = true;
  }

  /**
   * 物理モードを無効化
   */
  disablePhysicsMode() {
    this.isPhysicsMode = false;
  }

  /**
   * 物理モードが有効か確認
   * @returns {boolean}
   */
  isPhysicsModeActive() {
    return this.isPhysicsMode;
  }

  /**
   * UIの表示状態をトグル
   */
  toggleUIVisibility() {
    this.isUIVisible = !this.isUIVisible;
  }

  /**
   * UIを表示
   */
  showUI() {
    this.isUIVisible = true;
  }

  /**
   * UIを非表示
   */
  hideUI() {
    this.isUIVisible = false;
  }

  /**
   * UIが表示されているか確認
   * @returns {boolean}
   */
  isUIVisibleState() {
    return this.isUIVisible;
  }

  /**
   * ステッカーのコピーデータを保存
   * @param {Object} stickerData - コピーするステッカーデータ
   * @returns {string} コピー識別子
   */
  async copySticker(stickerData) {
    // 現在の時刻からユニークなIDを生成
    const uniqueId = Date.now().toString();
    
    // オリジナル画像のBlobを取得（優先順位：originalBlob > blob > URL取得）
    let originalBlob = null;
    if (stickerData.originalBlob) {
      originalBlob = stickerData.originalBlob;
    } else if (stickerData.blob) {
      originalBlob = stickerData.blob;
    } else if (stickerData.originalBlobUrl) {
      try {
        originalBlob = await fetch(stickerData.originalBlobUrl).then(r => r.blob());
      } catch (err) {
        console.warn('originalBlobUrlからのBlob取得エラー:', err);
      }
    } else if (stickerData.blobUrl) {
      try {
        originalBlob = await fetch(stickerData.blobUrl).then(r => r.blob());
      } catch (err) {
        console.warn('blobUrlからのBlob取得エラー:', err);
      }
    }

    // コピーするデータから必要な情報だけ取り出す
    const copiedData = {
      // Blobデータを直接保持（リロード後も有効）
      originalBlob: originalBlob, // 元画像Blob（優先使用）
      // サイズと表示に関する属性
      width: stickerData.width,
      rotation: stickerData.rotation,
      hasBorder: stickerData.hasBorder,
      borderWidth: stickerData.borderWidth,
      borderMode: stickerData.borderMode,
      // その他の状態
      isPinned: stickerData.isPinned,
      hasBgRemoved: stickerData.hasBgRemoved,
      bgRemovalProcessed: stickerData.bgRemovalProcessed,
    };
    
    this.copiedStickerData = copiedData;
    this.copiedStickerId = `sticker:${uniqueId}`;
    
    // IndexedDBに保存
    await this.saveCopiedStickerData();
    
    return this.copiedStickerId;
  }
  
  /**
   * コピーしたステッカーデータをIndexedDBに保存
   */
  async saveCopiedStickerData() {
    try {
      if (!this.copiedStickerData || !this.copiedStickerId) {
        return;
      }

      // IDだけはLocalStorageに保存（簡易チェック用）
      localStorage.setItem('clipboardAppCopiedStickerId', this.copiedStickerId);

      // BlobデータはIndexedDBに保存
      const db = await this.openCopyDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('copiedStickers', 'readwrite');
        const store = tx.objectStore('copiedStickers');
        const clearReq = store.clear();
        clearReq.onerror = () => reject(clearReq.error);
        clearReq.onsuccess = () => {
          const addReq = store.add({
            id: 'copiedSticker',
            stickerId: this.copiedStickerId,
            data: this.copiedStickerData,
            timestamp: Date.now(),
          });
          addReq.onerror = () => reject(addReq.error);
          addReq.onsuccess = () => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
          };
        };
      });
      db.close();
    } catch (err) {
      console.warn('コピーデータのIndexedDB保存に失敗:', err);
    }
  }
  
  /**
   * IndexedDBからコピーしたステッカーデータを復元
   */
  async restoreCopiedStickerData() {
    try {
      // LocalStorageからIDを取得（簡易チェック用）
      const stickerId = localStorage.getItem('clipboardAppCopiedStickerId');
      if (!stickerId) return;

      // IndexedDBからBlobデータを取得
      const db = await this.openCopyDB();
      const result = await new Promise((resolve, reject) => {
        const tx = db.transaction('copiedStickers', 'readonly');
        const store = tx.objectStore('copiedStickers');
        const getReq = store.get('copiedSticker');
        getReq.onerror = () => reject(getReq.error);
        getReq.onsuccess = () => resolve(getReq.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
      });
      db.close();

      if (result && result.stickerId === stickerId && result.data) {
        this.copiedStickerId = stickerId;
        this.copiedStickerData = result.data;
        console.log('コピーデータを復元しました:', stickerId);
      }
    } catch (err) {
      console.warn('コピーデータのIndexedDB復元に失敗:', err);
      // 失敗した場合はクリア
      this.copiedStickerData = null;
      this.copiedStickerId = null;
    }
  }
  
  /**
   * コピーされたステッカーデータを取得
   * @returns {Object|null} コピーされたステッカーデータ
   */
  getCopiedStickerData() {
    return this.copiedStickerData;
  }

  /**
   * コピーデータ用のIndexedDBを開く
   * @returns {Promise<IDBDatabase>} データベースインスタンス
   */
  openCopyDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('stickerCopyDB', 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('copiedStickers')) {
          db.createObjectStore('copiedStickers', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.error('IndexedDB接続エラー:', event.target.error);
        reject(event.target.error);
      };
    });
  }
  
  /**
   * 文字列がコピーしたステッカー識別子かどうかを確認
   * @param {string} text - 確認するテキスト
   * @returns {boolean} ステッカー識別子の場合はtrue
   */
  isStickerIdentifier(text) {
    // "sticker:"で始まる文字列かどうかをチェック
    return text && typeof text === 'string' && text.startsWith('sticker:');
  }
}

// シングルトンインスタンスをエクスポート
export const state = new AppState();
