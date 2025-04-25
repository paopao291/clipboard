# Dropdown

トリガーボタンとメニューを含む完全なドロップダウンコンポーネントです。キーボードナビゲーションとアクセシビリティに対応しています。

## 機能

- トリガーボタンが内蔵されており、単独で機能する完全なドロップダウン
- カスタマイズ可能なボタンテキストとアイコン
- 外部クリックとESCキーで自動的に閉じる
- キーボードナビゲーション（矢印キーでアイテム間移動）
- WAI-ARIA対応でアクセシビリティを向上
- ヘッダーとフッターのカスタマイズ
- 動的なアイテムの追加と削除
- Popper.jsによる高度な位置調整
- イベントコールバック（表示・非表示・アイテム選択）
- Tailwind CSSを使用したスタイリング

## ファイル構成

- `fragment.html` - HTMLフラグメント（コンポーネントの基本構造）
- `dropdown.js` - JavaScriptクラス（機能の実装）
- `dropdown.meta.json` - コンポーネントのメタデータ
- `preview.html` - ブラウザで動作確認用の完全なHTMLサンプル

## 使用方法

### 基本的な使用例

```html
<!-- ドロップダウンコンポーネント -->
<div id="my-dropdown" class="relative">
  <!-- fragment.htmlの内容をここに配置 -->
</div>

<script type="module">
  import Dropdown from './dropdown.js';
  
  // ドロップダウンの初期化
  const dropdownContainer = document.getElementById('my-dropdown');
  const dropdown = new Dropdown(dropdownContainer, {
    buttonText: 'カスタムテキスト',           // ボタンのテキスト
    placement: 'bottom-start',               // ドロップダウンの配置位置
    offset: [0, 8],                         // オフセット [x, y]
    closeOnItemSelect: true,                 // アイテム選択時に自動的に閉じる
    showIcon: true,                          // ドロップダウンアイコンを表示
    onShow: () => {
      console.log('ドロップダウンが表示されました');
    },
    onHide: () => {
      console.log('ドロップダウンが非表示になりました');
    },
    onItemSelect: (item, event) => {
      console.log('選択されたアイテム:', item.textContent);
    }
  });
  
  // 動的にアイテムを追加
  dropdown.addItem('新しいアイテム', '#', (e) => {
    console.log('新しいアイテムがクリックされました');
  });
  
  // ヘッダーテキストを変更
  dropdown.setHeaderText('カスタムヘッダー');
  
  // ボタンテキストを変更
  dropdown.setButtonText('更新されたテキスト');
  
  // アイコンの表示/非表示
  dropdown.setIconVisible(false);
  
  // メソッド例
  // dropdown.show();              // 表示
  // dropdown.hide();              // 非表示
  // dropdown.toggle();            // 切り替え
  // dropdown.removeItem(1);       // インデックス1のアイテムを削除
  
  // 必要に応じてクリーンアップ
  // dropdown.destroy();
</script>
```

### カスタマイズ例

ドロップダウンの構造とスタイルをカスタマイズできます：

```html
<div class="dropdown relative">
  <!-- カスタムスタイルのトリガーボタン -->
  <button id="dropdown-trigger" type="button" class="inline-flex justify-center items-center px-6 py-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2" aria-haspopup="menu" aria-expanded="false">
    <span class="dropdown-trigger-text font-medium">設定メニュー</span>
    <svg class="dropdown-trigger-icon ml-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
    </svg>
  </button>

  <!-- カスタムスタイルのドロップダウンコンテンツ -->
  <div id="dropdown-content" class="hidden absolute z-10 w-72 mt-2 rounded-lg shadow-xl bg-white ring-1 ring-black ring-opacity-5 divide-y divide-gray-100">
    <!-- ヘッダー部分 -->
    <div class="dropdown-header px-4 py-3 bg-gray-50 rounded-t-lg">
      <p class="text-sm font-medium text-gray-900">ユーザー設定</p>
    </div>
    
    <!-- メニュー項目 -->
    <div class="py-1" role="menu" aria-orientation="vertical" aria-labelledby="dropdown-trigger">
      <!-- アイコン付きアイテム -->
      <a href="#" class="dropdown-item flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">
        <svg class="mr-3 h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
        </svg>
        プロフィール
      </a>
      
      <!-- その他のメニュー項目 -->
      <a href="#" class="dropdown-item flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">
        <svg class="mr-3 h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
        </svg>
        設定
      </a>
    </div>
    
    <!-- フッター部分 -->
    <div class="dropdown-footer py-1 bg-gray-50 rounded-b-lg">
      <a href="#" class="dropdown-item flex justify-center px-4 py-2 text-sm text-red-700 hover:bg-red-50" role="menuitem">
        ログアウト
      </a>
    </div>
  </div>
</div>
```

### プレビューと使用例

詳細な使用例とデモについては、`preview.html`ファイルを参照してください。ブラウザで直接開いて動作確認できます。

## 高度な使用例

### 複数のドロップダウンを管理

```javascript
// 複数のドロップダウンを管理するクラス
class DropdownManager {
  constructor() {
    this.dropdowns = new Map();
  }
  
  register(id, dropdown) {
    this.dropdowns.set(id, dropdown);
  }
  
  hideAll(exceptId = null) {
    this.dropdowns.forEach((dropdown, id) => {
      if (id !== exceptId && dropdown.isOpen) {
        dropdown.hide();
      }
    });
  }
  
  getDropdown(id) {
    return this.dropdowns.get(id);
  }
}

// 使用例
const manager = new DropdownManager();

// ドロップダウンの初期化と登録
const userMenu = new Dropdown(document.getElementById('user-menu'), {
  onShow: () => manager.hideAll('userMenu')
});
manager.register('userMenu', userMenu);

const notificationMenu = new Dropdown(document.getElementById('notification-menu'), {
  onShow: () => manager.hideAll('notificationMenu')
});
manager.register('notificationMenu', notificationMenu);
```

## 依存関係

- @popperjs/core v2
- Tailwind CSS (クラス名を使用) 