/**
 * ボタンコンポーネント
 */
export default class Button {
  /**
   * @param {HTMLElement} element - ボタン要素
   * @param {Object} options - オプション
   * @param {Function} options.onClick - クリック時のコールバック関数
   */
  constructor(element, options = {}) {
    this.element = element;
    this.textElement = element.querySelector('.button-text');
    this.iconElement = element.querySelector('.button-icon');
    this.options = options;
    
    this.init();
  }

  /**
   * 初期化
   */
  init() {
    // クリックイベントリスナーを追加
    this.element.addEventListener('click', this.handleClick.bind(this));
  }

  /**
   * クリックハンドラー
   * @param {Event} event - クリックイベント
   */
  handleClick(event) {
    if (typeof this.options.onClick === 'function') {
      this.options.onClick(event);
    }
  }

  /**
   * ボタンテキストを設定
   * @param {string} text - 設定するテキスト
   */
  setText(text) {
    if (this.textElement) {
      this.textElement.textContent = text;
    }
  }

  /**
   * ボタンの有効/無効を設定
   * @param {boolean} isDisabled - 無効にする場合はtrue
   */
  setDisabled(isDisabled) {
    if (isDisabled) {
      this.element.setAttribute('disabled', 'disabled');
      this.element.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      this.element.removeAttribute('disabled');
      this.element.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }

  /**
   * アイコンの表示/非表示を設定
   * @param {boolean} isVisible - 表示する場合はtrue
   */
  setIconVisible(isVisible) {
    if (this.iconElement) {
      this.iconElement.classList.toggle('hidden', !isVisible);
    }
  }

  /**
   * イベントリスナーを削除してクリーンアップ
   */
  destroy() {
    this.element.removeEventListener('click', this.handleClick.bind(this));
  }
} 