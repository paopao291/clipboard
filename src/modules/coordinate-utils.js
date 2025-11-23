/**
 * 座標変換ユーティリティ
 * ハイブリッド座標系（X: px中央基準、Y: %）の変換を行う
 */

/**
 * 絶対座標をハイブリッド座標に変換
 * @param {number} clientX - 画面左上からの絶対X座標
 * @param {number} clientY - 画面左上からの絶対Y座標
 * @returns {{ x: number, yPercent: number }}
 */
export function absoluteToHybrid(clientX, clientY) {
  const centerX = window.innerWidth / 2;
  const x = clientX - centerX;
  const yPercent = (clientY / window.innerHeight) * 100;
  return { x, yPercent };
}

/**
 * ハイブリッド座標を絶対座標に変換
 * @param {number} x - 画面中央からのX座標オフセット（px）
 * @param {number} yPercent - 画面高さに対するY座標の割合（0-100）
 * @returns {{ clientX: number, clientY: number }}
 */
export function hybridToAbsolute(x, yPercent) {
  const centerX = window.innerWidth / 2;
  const clientX = centerX + x;
  const clientY = (yPercent / 100) * window.innerHeight;
  return { clientX, clientY };
}

/**
 * 絶対座標からY座標のみパーセント値に変換
 * @param {number} clientY - 画面左上からの絶対Y座標
 * @returns {number} パーセント値
 */
export function absoluteYToPercent(clientY) {
  return (clientY / window.innerHeight) * 100;
}

/**
 * 画面中央の座標を取得
 * @returns {{ x: number, yPercent: number }}
 */
export function getCenterCoordinates() {
  return { x: 0, yPercent: 50 };
}

/**
 * 物理座標（画面絶対座標）をハイブリッド座標に変換
 * @param {Object} position - 物理エンジンの座標 {x, y}（両方ピクセル値）
 * @returns {{ x: number, yPercent: number }} ハイブリッド座標
 */
export function physicsToHybrid(position) {
  const centerX = window.innerWidth / 2;
  const x = position.x - centerX;
  const yPercent = (position.y / window.innerHeight) * 100;
  return { x, yPercent };
}

/**
 * ハイブリッド座標を物理座標（画面絶対座標）に変換
 * @param {number} x - 画面中央からのX座標オフセット（px）
 * @param {number} yPercent - 画面高さに対するY座標の割合（0-100）
 * @returns {{ x: number, y: number }} 物理座標（両方ピクセル値）
 */
export function hybridToPhysics(x, yPercent) {
  const centerX = window.innerWidth / 2;
  const physicsX = centerX + x;
  const physicsY = (yPercent / 100) * window.innerHeight;
  return { x: physicsX, y: physicsY };
}

/**
 * ラジアンを度に変換
 * @param {number} radians - ラジアン
 * @returns {number} 度
 */
export function radiansToDegrees(radians) {
  return (radians * 180) / Math.PI;
}

/**
 * 度をラジアンに変換
 * @param {number} degrees - 度
 * @returns {number} ラジアン
 */
export function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}
