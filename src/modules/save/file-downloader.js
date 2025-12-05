/**
 * ファイルダウンロードモジュール
 * Canvasを画像ファイルとしてダウンロード
 */

/**
 * Canvasを画像ファイルとしてダウンロードする
 * @param {HTMLCanvasElement} canvas - Canvas要素
 * @param {string} [prefix='capture'] - ファイル名のプレフィックス
 * @param {string} [format='png'] - 画像フォーマット（png, jpeg, webp）
 */
export function downloadCanvas(canvas, prefix = "capture", format = "png") {
  const filename = generateFilename(prefix, format);
  const dataUrl = canvas.toDataURL(`image/${format}`);

  triggerDownload(dataUrl, filename);
}

/**
 * タイムスタンプ付きのファイル名を生成
 * @param {string} prefix - プレフィックス
 * @param {string} format - ファイル形式
 * @returns {string} ファイル名
 */
function generateFilename(prefix, format) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "_");

  return `${prefix}_${timestamp}.${format}`;
}

/**
 * ダウンロードをトリガーする
 * @param {string} dataUrl - データURL
 * @param {string} filename - ファイル名
 */
function triggerDownload(dataUrl, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
