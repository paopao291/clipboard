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
}

// シングルトンインスタンスをエクスポート
export const state = new AppState();
