/**
 * 物理ボディ管理モジュール
 * シールの物理ボディのライフサイクル（追加・削除）を担当
 */

import { state } from "../../state.js";
import { PHYSICS_CONFIG } from "../constants.js";
import { logger } from "../../utils/logger.js";

// Matter.jsモジュール（グローバル変数として読み込まれる）
// 分割代入は各関数内で行う（Matter.jsの読み込みを待つため）

// ========================================
// 物理ボディ管理
// ========================================

// シールIDと物理ボディのマッピング
const stickerBodyMap = new Map();

/**
 * シールに物理ボディを追加
 * @param {Object} sticker - シールオブジェクト
 * @param {Object} world - Matter.jsワールド
 * @param {boolean} isPhysicsEnabled - 物理モードが有効かどうか
 */
export function addPhysicsBody(sticker, world, isPhysicsEnabled) {
  if (!isPhysicsEnabled || !world || typeof Matter === "undefined") return;

  const { World, Bodies } = Matter;

  // 固定されたステッカーはスキップ
  if (sticker.isPinned) return;

  // 既に物理ボディがある場合はスキップ
  if (stickerBodyMap.has(sticker.id)) return;

  // シールの中心位置を取得
  const containerRect = sticker.element.getBoundingClientRect();
  const x = containerRect.left + containerRect.width / 2;
  const y = containerRect.top + containerRect.height / 2;

  // 実際の表示サイズを取得（imgWrapper/help-sticker-wrapperのサイズ）
  const wrapperRect = sticker.imgWrapper
    ? sticker.imgWrapper.getBoundingClientRect()
    : containerRect;

  // 物理ボディの半径を計算（表示サイズより小さくして重なりやすく）
  const { RADIUS_SCALE } = PHYSICS_CONFIG.BODY;
  const radius = (wrapperRect.width / 2) * RADIUS_SCALE;

  // 円形の物理ボディを作成
  const { RESTITUTION, FRICTION, FRICTION_AIR, DENSITY } = PHYSICS_CONFIG.BODY;

  // SVGフィルターを削除したため、全ブラウザで同じ物理パラメータを使用
  const frictionAir = FRICTION_AIR;
  const density = DENSITY;

  const body = Bodies.circle(x, y, radius, {
    restitution: RESTITUTION,
    friction: FRICTION,
    frictionAir: frictionAir,
    density: density,
    angle: (sticker.rotation * Math.PI) / 180,
  });

  // ボディをワールドに追加
  World.add(world, body);

  // マッピングに追加
  stickerBodyMap.set(sticker.id, body);
  
  // デバッグログ（最初の数個のみ）
  if (stickerBodyMap.size <= 3) {
    logger.log(`物理モード: 物理ボディを追加しました (ID: ${sticker.id}, 位置: x=${x.toFixed(1)}, y=${y.toFixed(1)}, 半径: ${radius.toFixed(1)})`);
  }
}

/**
 * シールの物理ボディを削除
 * @param {number} stickerId - シールID
 * @param {Object} world - Matter.jsワールド
 */
export function removePhysicsBody(stickerId, world) {
  const body = stickerBodyMap.get(stickerId);
  if (body && world && typeof Matter !== "undefined") {
    const { World } = Matter;
    World.remove(world, body);
    stickerBodyMap.delete(stickerId);
  }
}

/**
 * シールの物理ボディを取得
 * @param {number} stickerId - シールID
 * @returns {Object|null} 物理ボディ
 */
export function getPhysicsBody(stickerId) {
  return stickerBodyMap.get(stickerId) || null;
}

/**
 * 全ての物理ボディをクリア
 * @param {Object} world - Matter.jsワールド
 */
export function clearAllBodies(world) {
  if (!world || typeof Matter === "undefined") return;

  const { World } = Matter;

  stickerBodyMap.forEach((body) => {
    World.remove(world, body);
  });

  stickerBodyMap.clear();
}

/**
 * 物理ボディマップを取得（他のモジュールから参照用）
 */
export function getStickerBodyMap() {
  return stickerBodyMap;
}

/**
 * シールに速度を加える（投げる動作用）
 * @param {number} stickerId - シールID
 * @param {number} vx - X方向の速度
 * @param {number} vy - Y方向の速度
 */
export function applyStickerVelocity(stickerId, vx, vy) {
  const body = stickerBodyMap.get(stickerId);
  if (body && typeof Matter !== "undefined") {
    const { Body } = Matter;
    Body.setVelocity(body, { x: vx, y: vy });
  }
}

/**
 * シールの物理ボディを位置指定で移動
 * @param {number} stickerId - シールID
 * @param {number} x - X座標（画面絶対座標）
 * @param {number} y - Y座標（画面絶対座標）
 */
export function setStickerPhysicsPosition(stickerId, x, y) {
  const body = stickerBodyMap.get(stickerId);
  if (body && typeof Matter !== "undefined") {
    const { Body } = Matter;
    Body.setPosition(body, { x, y });
    Body.setVelocity(body, { x: 0, y: 0 }); // 速度をリセット
    Body.setAngularVelocity(body, 0); // 角速度をリセット
  }
}

/**
 * ドラッグ中のステッカーの物理ボディ位置を更新（速度を保持）
 * @param {number} stickerId - シールID
 * @param {number} x - X座標（画面絶対座標）
 * @param {number} y - Y座標（画面絶対座標）
 */
export function updateStickerPhysicsPositionDuringDrag(stickerId, x, y) {
  const body = stickerBodyMap.get(stickerId);
  if (body && typeof Matter !== "undefined") {
    const { Body } = Matter;
    // 位置だけ更新、速度は保持（重力が引き続き作用）
    Body.setPosition(body, { x, y });
  }
}
