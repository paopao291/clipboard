# Button

汎用的なボタンコンポーネントです。Tailwind CSSを使用してスタイリングされています。

## 機能

- テキストとアイコンの表示
- クリックイベントのハンドリング
- 有効/無効状態の切り替え
- カスタムイベントハンドラーのサポート

## ファイル構成

- `fragment.html` - HTMLフラグメント（ボタンの基本構造）
- `button.js` - JavaScriptクラス（機能の実装）
- `button.meta.json` - コンポーネントのメタデータ
- `preview.html` - ブラウザで動作確認用の完全なHTMLサンプル

## 使用方法

### HTMLでの使用

```html
<!-- ボタンコンポーネントをHTMLに含める -->
<div id="my-button-container">
  <!-- fragment.htmlの内容 -->
</div>

<script type="module">
  import Button from './button.js';
  
  // 初期化
  const buttonElement = document.querySelector('#my-button-container button');
  const button = new Button(buttonElement, {
    onClick: (event) => {
      console.log('ボタンがクリックされました');
      // 必要なアクション
    }
  });
  
  // テキストの変更
  button.setText('新しいテキスト');
  
  // 無効化
  button.setDisabled(true);
  
  // 有効化
  button.setDisabled(false);
  
  // アイコンの表示/非表示
  button.setIconVisible(false);
  
  // 必要に応じてクリーンアップ
  // button.destroy();
</script>
```

### カスタマイズ

ボタンのスタイルはTailwind CSSクラスを変更することでカスタマイズできます：

```html
<button id="button" type="button" class="inline-flex justify-center items-center px-4 py-2 border border-indigo-500 text-white bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
  <span class="button-text">カスタムボタン</span>
  <!-- 異なるアイコンを使用 -->
  <svg class="button-icon -mr-1 ml-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clip-rule="evenodd" />
  </svg>
</button>
```

### プレビューと使用例

さまざまなボタンのスタイルとバリエーションについては、`preview.html`ファイルを参照してください。ブラウザで直接開いて動作確認できます。以下のような例を含んでいます：

- 基本的なボタン（デフォルト、プライマリー、デンジャー）
- サイズバリエーション（スモール、ミディアム、ラージ）
- アイコン付きボタン
- ローディング状態のボタン

## 依存関係

- Tailwind CSS (クラス名を使用) 