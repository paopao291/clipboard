/**
 * 座標変換ユーティリティ
 * ハイブリッド座標系（X: px中央基準、Y: %）の変換を行う
 */

/**
 * キャンバスの実際のサイズを取得
 * @returns {{ width: number, height: number, top: number, left: number }}
 */
function getCanvasSize() {
  const canvas = document.getElementById('canvas');
  if (!canvas) {
    // フォールバック：画面サイズを使用
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      top: 0,
      left: 0,
    };
  }
  
  const rect = canvas.getBoundingClientRect();
  return {
    width: rect.width,
    height: rect.height,
    top: rect.top,
    left: rect.left,
  };
}

/**
 * 絶対座標をハイブリッド座標に変換
 * @param {number} clientX - 画面左上からの絶対X座標
 * @param {number} clientY - 画面左上からの絶対Y座標
 * @returns {{ x: number, yPercent: number }}
 */
export function absoluteToHybrid(clientX, clientY) {
  const canvasSize = getCanvasSize();
  const centerX = canvasSize.left + canvasSize.width / 2;
  const x = clientX - centerX;
  
  // キャンバス内の相対Y座標を計算
  const relativeY = clientY - canvasSize.top;
  const yPercent = (relativeY / canvasSize.height) * 100;
  
  return { x, yPercent };
}

/**
 * ハイブリッド座標を絶対座標に変換
 * @param {number} x - 画面中央からのX座標オフセット（px）
 * @param {number} yPercent - キャンバス高さに対するY座標の割合（0-100）
 * @returns {{ clientX: number, clientY: number }}
 */
export function hybridToAbsolute(x, yPercent) {
  const canvasSize = getCanvasSize();
  const centerX = canvasSize.left + canvasSize.width / 2;
  const clientX = centerX + x;
  
  // キャンバス内の相対Y座標を計算
  const relativeY = (yPercent / 100) * canvasSize.height;
  const clientY = canvasSize.top + relativeY;
  
  return { clientX, clientY };
}

/**
 * 絶対座標からY座標のみパーセント値に変換
 * @param {number} clientY - 画面左上からの絶対Y座標
 * @returns {number} パーセント値
 */
export function absoluteYToPercent(clientY) {
  const canvasSize = getCanvasSize();
  const relativeY = clientY - canvasSize.top;
  return (relativeY / canvasSize.height) * 100;
}

/**
 * 画面中央の座標を取得
 * @returns {{ x: number, yPercent: number }}
 */
export function getCenterCoordinates() {
  return { x: 0, yPercent: 50 };
}

