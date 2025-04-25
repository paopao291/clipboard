import { createPopper } from '@popperjs/core';

/**
 * ドロップダウンコンポーネント
 */
export default class Dropdown {
  /**
   * @param {HTMLElement} container - ドロップダウンコンテナ要素
   * @param {Object} options - オプション
   * @param {string} options.triggerSelector - トリガー要素のセレクタ（デフォルト: '#dropdown-trigger'）
   * @param {string} options.contentSelector - ドロップダウンコンテンツのセレクタ（デフォルト: '#dropdown-content'）
   * @param {string} options.placement - 配置位置（例：'bottom-start'）
   * @param {Array} options.offset - オフセット位置 [x, y]
   * @param {string} options.buttonText - ボタンのテキスト（指定した場合は上書き）
   * @param {boolean} options.showIcon - アイコンを表示するかどうか
   * @param {Function} options.onShow - 表示時のコールバック
   * @param {Function} options.onHide - 非表示時のコールバック
   * @param {Function} options.onItemSelect - アイテム選択時のコールバック
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      triggerSelector: '#dropdown-trigger',
      contentSelector: '#dropdown-content',
      placement: 'bottom-start',
      offset: [0, 8],
      closeOnItemSelect: true,
      showIcon: true,
      ...options
    };
    
    this.triggerElement = container.querySelector(this.options.triggerSelector);
    if (!this.triggerElement) {
      throw new Error(`トリガー要素が見つかりません: ${this.options.triggerSelector}`);
    }
    
    this.dropdownContent = container.querySelector(this.options.contentSelector);
    if (!this.dropdownContent) {
      throw new Error(`ドロップダウンコンテンツが見つかりません: ${this.options.contentSelector}`);
    }
    
    this.triggerTextElement = this.triggerElement.querySelector('.dropdown-trigger-text');
    this.triggerIconElement = this.triggerElement.querySelector('.dropdown-trigger-icon');
    
    this.popperInstance = null;
    this.isOpen = false;
    
    this.init();
  }
  
  /**
   * 初期化
   */
  init() {
    // ボタンテキストを設定（オプション）
    if (this.options.buttonText && this.triggerTextElement) {
      this.triggerTextElement.textContent = this.options.buttonText;
    }
    
    // アイコン表示/非表示の設定
    if (this.triggerIconElement) {
      this.triggerIconElement.classList.toggle('hidden', !this.options.showIcon);
    }
    
    // トリガー要素のクリックイベントリスナーを追加
    this.triggerElement.addEventListener('click', this.toggle.bind(this));
    
    // 外部クリックで閉じるためのイベントリスナー
    document.addEventListener('click', this.handleOutsideClick.bind(this));
    
    // ESCキーで閉じるためのイベントリスナー
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    
    // ドロップダウンアイテムのクリックイベントリスナー
    this.addItemsEventListeners();
    
    // Popperインスタンスを作成
    this.createPopperInstance();
  }
  
  /**
   * ドロップダウンアイテムにイベントリスナーを追加
   */
  addItemsEventListeners() {
    const items = this.getItems();
    items.forEach(item => {
      item.addEventListener('click', this.handleItemClick.bind(this));
    });
  }
  
  /**
   * Popperインスタンスを作成
   */
  createPopperInstance() {
    this.popperInstance = createPopper(this.triggerElement, this.dropdownContent, {
      placement: this.options.placement,
      modifiers: [
        {
          name: 'offset',
          options: {
            offset: this.options.offset,
          },
        },
        {
          name: 'preventOverflow',
          options: {
            padding: 8,
          },
        }
      ],
    });
  }
  
  /**
   * ドロップダウンの表示/非表示を切り替え
   * @param {Event} event - イベントオブジェクト
   */
  toggle(event) {
    if (event) {
      event.stopPropagation();
    }
    
    if (this.isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }
  
  /**
   * ドロップダウンを表示
   */
  show() {
    if (this.isOpen) return;
    
    this.isOpen = true;
    this.dropdownContent.classList.remove('hidden');
    
    // WAI-ARIA属性を設定
    this.triggerElement.setAttribute('aria-expanded', 'true');
    
    // Popper位置を更新
    this.popperInstance.update();
    
    // 最初のアイテムにフォーカス
    const firstItem = this.getFirstFocusableItem();
    if (firstItem) {
      setTimeout(() => {
        firstItem.focus();
      }, 10);
    }
    
    if (typeof this.options.onShow === 'function') {
      this.options.onShow();
    }
  }
  
  /**
   * ドロップダウンを非表示
   */
  hide() {
    if (!this.isOpen) return;
    
    this.isOpen = false;
    this.dropdownContent.classList.add('hidden');
    
    // WAI-ARIA属性を設定
    this.triggerElement.setAttribute('aria-expanded', 'false');
    
    if (typeof this.options.onHide === 'function') {
      this.options.onHide();
    }
  }
  
  /**
   * 最初のフォーカス可能なアイテムを取得
   * @returns {HTMLElement|null} 最初のフォーカス可能なアイテム要素
   */
  getFirstFocusableItem() {
    const items = this.getItems();
    return items.length > 0 ? items[0] : null;
  }
  
  /**
   * アイテムクリックハンドラ
   * @param {Event} event - クリックイベント
   */
  handleItemClick(event) {
    const item = event.currentTarget;
    
    if (typeof this.options.onItemSelect === 'function') {
      this.options.onItemSelect(item, event);
    }
    
    if (this.options.closeOnItemSelect) {
      this.hide();
    }
  }
  
  /**
   * キーボードイベントハンドラ
   * @param {KeyboardEvent} event - キーボードイベント
   */
  handleKeyDown(event) {
    if (!this.isOpen) return;
    
    switch (event.key) {
      case 'Escape':
        this.hide();
        this.triggerElement.focus();
        event.preventDefault();
        break;
      case 'ArrowDown':
        this.focusNextItem();
        event.preventDefault();
        break;
      case 'ArrowUp':
        this.focusPrevItem();
        event.preventDefault();
        break;
    }
  }
  
  /**
   * 次のアイテムにフォーカス
   */
  focusNextItem() {
    const items = this.getItems();
    const currentIndex = this.getCurrentFocusedIndex();
    const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
    
    if (items[nextIndex]) {
      items[nextIndex].focus();
    }
  }
  
  /**
   * 前のアイテムにフォーカス
   */
  focusPrevItem() {
    const items = this.getItems();
    const currentIndex = this.getCurrentFocusedIndex();
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
    
    if (items[prevIndex]) {
      items[prevIndex].focus();
    }
  }
  
  /**
   * 現在フォーカスされているアイテムのインデックスを取得
   * @returns {number} フォーカスされているアイテムのインデックス
   */
  getCurrentFocusedIndex() {
    const items = this.getItems();
    const activeElement = document.activeElement;
    
    return Array.from(items).findIndex(item => item === activeElement);
  }
  
  /**
   * 外部クリックハンドラー
   * @param {Event} event - クリックイベント
   */
  handleOutsideClick(event) {
    // ドロップダウンまたはトリガー要素の外側をクリックした場合
    if (this.isOpen && !this.container.contains(event.target)) {
      this.hide();
    }
  }
  
  /**
   * ボタンテキストを設定
   * @param {string} text - 設定するテキスト
   */
  setButtonText(text) {
    if (this.triggerTextElement) {
      this.triggerTextElement.textContent = text;
    }
  }
  
  /**
   * アイコンの表示/非表示を設定
   * @param {boolean} isVisible - 表示する場合はtrue
   */
  setIconVisible(isVisible) {
    if (this.triggerIconElement) {
      this.triggerIconElement.classList.toggle('hidden', !isVisible);
    }
  }
  
  /**
   * ドロップダウンのアイテムを取得
   * @returns {NodeListOf<Element>} ドロップダウンアイテム要素のリスト
   */
  getItems() {
    return this.container.querySelectorAll('.dropdown-item');
  }
  
  /**
   * ヘッダーセクションを取得
   * @returns {HTMLElement|null} ヘッダー要素
   */
  getHeader() {
    return this.container.querySelector('.dropdown-header');
  }
  
  /**
   * フッターセクションを取得
   * @returns {HTMLElement|null} フッター要素
   */
  getFooter() {
    return this.container.querySelector('.dropdown-footer');
  }
  
  /**
   * ヘッダーテキストを設定
   * @param {string} text - 設定するテキスト
   */
  setHeaderText(text) {
    const header = this.getHeader();
    if (header) {
      const headerText = header.querySelector('p');
      if (headerText) {
        headerText.textContent = text;
      }
    }
  }
  
  /**
   * 新しいアイテムを追加
   * @param {string} text - アイテムのテキスト
   * @param {string} url - アイテムのURL（オプション）
   * @param {Function} onClick - クリック時のコールバック（オプション）
   * @returns {HTMLElement} 作成されたアイテム要素
   */
  addItem(text, url = '#', onClick = null) {
    const menuContainer = this.container.querySelector('[role="menu"]');
    if (!menuContainer) return null;
    
    const item = document.createElement('a');
    item.href = url;
    item.className = 'dropdown-item block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900';
    item.setAttribute('role', 'menuitem');
    item.textContent = text;
    
    if (onClick) {
      item.addEventListener('click', e => {
        e.preventDefault();
        onClick(e);
      });
    }
    
    menuContainer.appendChild(item);
    
    // イベントリスナーを再登録
    this.addItemsEventListeners();
    
    return item;
  }
  
  /**
   * 指定したインデックスのアイテムを削除
   * @param {number} index - 削除するアイテムのインデックス
   */
  removeItem(index) {
    const items = this.getItems();
    if (index >= 0 && index < items.length) {
      items[index].remove();
    }
  }
  
  /**
   * イベントリスナーを削除してクリーンアップ
   */
  destroy() {
    this.triggerElement.removeEventListener('click', this.toggle.bind(this));
    document.removeEventListener('click', this.handleOutsideClick.bind(this));
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
    
    // アイテムのイベントリスナーを削除
    const items = this.getItems();
    items.forEach(item => {
      item.removeEventListener('click', this.handleItemClick.bind(this));
    });
    
    if (this.popperInstance) {
      this.popperInstance.destroy();
      this.popperInstance = null;
    }
  }
} 