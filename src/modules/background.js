/**
 * 背景画像管理モジュール
 */

const STORAGE_KEY = 'backgroundImage';

/**
 * 背景画像を設定
 * @param {File} file - 画像ファイル
 */
export async function setBackgroundImage(file) {
  if (file.type.indexOf("image") === -1) return;
  
  const url = URL.createObjectURL(file);
  
  // bodyの背景画像を設定
  document.body.style.backgroundImage = `url(${url})`;
  document.body.classList.add('has-background-image');
  
  // localStorageに保存（Base64化）
  const reader = new FileReader();
  reader.onload = function(event) {
    localStorage.setItem(STORAGE_KEY, event.target.result);
  };
  reader.readAsDataURL(file);
}

/**
 * 背景画像を削除
 */
export function removeBackgroundImage() {
  // 背景画像をクリア
  document.body.style.backgroundImage = '';
  document.body.classList.remove('has-background-image');
  
  // localStorageから削除
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 背景画像を復元
 */
export function restoreBackgroundImage() {
  const savedBackground = localStorage.getItem(STORAGE_KEY);
  
  if (savedBackground) {
    document.body.style.backgroundImage = `url(${savedBackground})`;
    document.body.classList.add('has-background-image');
  }
}

/**
 * 背景画像があるか確認
 * @returns {boolean}
 */
export function hasBackgroundImage() {
  return document.body.classList.contains('has-background-image');
}

