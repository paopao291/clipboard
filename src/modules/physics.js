/**
 * 物理エンジンモジュール（重力ベース物理シミュレーション）
 * Matter.jsを使用してフレークシールのような物理演出を実装
 *
 * 【機能】
 * - PC: 固定の下向き重力のみ
 * - スマホ: ジャイロセンサーによる重力方向制御
 * - 全てのシールに物理演算を適用（transform: scale方式で最適化）
 * - ドラッグ＆投げる動作のサポート
 * - モード終了時に最終位置を自動保存
 *
 * 【自動レイアウトとの違い】
 * - 物理モード: リアルタイムの重力シミュレーション（Matter.js使用）
 * - 自動レイアウト: 斥力による最適配置の計算とアニメーション
 */

import { state } from "../state.js";
import { logger } from "../utils/logger.js";
import { PHYSICS_CONFIG } from "./constants.js";

// 各モジュールをインポート
import {
  initPhysicsEngine,
  updateWalls,
  enablePhysics as engineEnablePhysics,
  disablePhysics as engineDisablePhysics,
  isPhysicsActive,
  getEngine,
  getWorld,
  getIsPhysicsEnabled,
  setIsPhysicsEnabled,
} from "./physics/physics-engine.js";

import {
  handleDeviceOrientation,
  checkGyroAvailability,
  updateGravity,
  getTargetGravity,
  getIsGyroActive,
  setIsGyroActive,
  getGyroPermissionGranted,
  setFixedGravity,
} from "./physics/gyro-sensor.js";

import {
  generateProxyImages,
  restoreOriginalImages,
} from "./physics/proxy-images.js";

import {
  addPhysicsBody as addBodyToWorld,
  removePhysicsBody as removeBodyFromWorld,
  getPhysicsBody,
  clearAllBodies,
  getStickerBodyMap,
  applyStickerVelocity,
  setStickerPhysicsPosition,
  updateStickerPhysicsPositionDuringDrag,
} from "./physics/physics-body.js";

import {
  startRenderLoop,
  stopRenderLoop,
  syncStickerFromPhysics,
  updateStickerProperties,
  updateStickerDOM,
  getPreviousBodyStates,
} from "./physics/physics-render.js";

// ========================================
// 統合API - 物理エンジン制御
// ========================================

/**
 * 物理モードを有効化
 * @returns {Promise<boolean>} 有効化に成功した場合はtrue（ジャイロ許可が必要な場合は許可状態による）
 */
export async function enablePhysics() {
  if (getIsPhysicsEnabled()) {
    logger.log("物理モード: 既に有効です");
    return true;
  }

  try {
    logger.log("物理モード: 有効化を開始します");
    
    // エンジンを有効化
    engineEnablePhysics();
    logger.log("物理モード: エンジンを有効化しました");

    // PC用: 重力を下向きに設定（リファクタリング前の実装に合わせる）
    const engine = getEngine();
    if (engine) {
      const { X, Y, SCALE } = PHYSICS_CONFIG.GRAVITY;
      engine.gravity.x = X;
      engine.gravity.y = Y;
      engine.gravity.scale = SCALE;
      logger.log(`物理モード: 固定重力を設定しました (x: ${X}, y: ${Y}, scale: ${SCALE})`);
    }

    // ジャイロを無効化（初期はPC想定）
    setIsGyroActive(false);

    // プロキシ画像を生成（パフォーマンス最適化）
    await generateProxyImages();

    // 固定されていないシールに物理ボディを追加
    let bodyCount = 0;
    state.stickers.forEach((sticker) => {
      if (!sticker.isPinned) {
        addPhysicsBody(sticker);
        bodyCount++;
      }
    });
    logger.log(`物理モード: ${bodyCount}個の物理ボディを追加しました`);
    
    const stickerBodyMap = getStickerBodyMap();
    logger.log(`物理モード: 実際に追加された物理ボディ数: ${stickerBodyMap.size}`);

    // レンダリングループを開始
    startRenderLoop(
      getEngine(),
      getStickerBodyMap,
      getIsGyroActive,
      updateGravity,
    );

    // イベントリスナーを登録
    setupEventListeners();

    // ジャイロセンサーのチェック
    const gyroGranted = await checkGyroAvailability();

    // ジャイロ許可が得られなかった場合でも、固定重力（下向き）で物理モードを継続
    if (!gyroGranted) {
      logger.log("物理モード: ジャイロなしで固定重力モードで動作します");
      setIsGyroActive(false); // ジャイロを無効化（固定重力を使用）
      // PC環境では、エンジンの重力は既に physics-engine.js の enablePhysics() で設定されている
      // stepPhysics() では isGyroActive が false なので updateGravity() は呼ばれず、固定重力がそのまま使われる
      const { showToast } = await import("./ui.js");
      showToast("物理モード（固定重力）");
    }

    logger.log("物理モード: 有効化が完了しました");
    return true;
  } catch (error) {
    logger.error("物理モードの有効化中にエラーが発生しました:", error);
    // エラーが発生した場合は物理モードを無効化
    await disablePhysics();
    throw error;
  }
}

/**
 * 物理モードを無効化
 */
export async function disablePhysics() {
  if (!getIsPhysicsEnabled()) {
    logger.log("物理モード: 既に無効です");
    return;
  }

  logger.log("物理モード: 無効化を開始します");
  const stackTrace = new Error().stack;
  logger.log("物理モード: disablePhysics()が呼ばれました。スタックトレース:", stackTrace);

  // エンジンを無効化
  engineDisablePhysics();
  setIsGyroActive(false);

  // レンダリングループを停止
  stopRenderLoop();

  // プロキシ画像を元の高解像度画像に戻す
  await restoreOriginalImages();

  // 全ての物理ボディを削除し、現在の位置でDOMを固定
  const stickerBodyMap = getStickerBodyMap();
  stickerBodyMap.forEach((body, stickerId) => {
    const sticker = state.getStickerById(stickerId);
    if (sticker) {
      // 現在の物理位置をDOMに反映して固定
      syncStickerFromPhysics(sticker, body);

      // will-changeを削除（メモリ解放）
      if (sticker.imgWrapper) {
        sticker.imgWrapper.style.willChange = "auto";
      }
    }
  });

  // 全ての物理ボディをクリア
  clearAllBodies(getWorld());

  // 前回の状態をクリア
  getPreviousBodyStates().clear();

  // イベントリスナーを解除
  removeEventListeners();

  // 全ステッカーの位置をDBに保存（共通関数を使用）
  await saveStickersAfterPhysics(state.stickers);
}

/**
 * 全ステッカーの位置をDBに保存（物理モード終了時）
 * @param {Array} stickers - 保存するステッカーの配列
 * @returns {Promise<void>}
 */
async function saveStickersAfterPhysics(stickers) {
  const { saveAllStickerPositions } = await import("./sticker.js");
  await saveAllStickerPositions(stickers);
}

// ========================================
// 統合API - 物理ボディ管理
// ========================================

/**
 * シールに物理ボディを追加
 * @param {Object} sticker - シールオブジェクト
 */
export function addPhysicsBody(sticker) {
  addBodyToWorld(sticker, getWorld(), getIsPhysicsEnabled());

  // 前回の状態を初期化（補間用）
  const body = getPhysicsBody(sticker.id);
  if (body) {
    const previousBodyStates = getPreviousBodyStates();
    previousBodyStates.set(sticker.id, {
      position: { x: body.position.x, y: body.position.y },
      angle: body.angle,
    });
  }
}

/**
 * シールの物理ボディを削除
 * @param {number} stickerId - シールID
 */
export function removePhysicsBody(stickerId) {
  removeBodyFromWorld(stickerId, getWorld());
  getPreviousBodyStates().delete(stickerId);
}

/**
 * シールの物理ボディを取得
 * @param {number} stickerId - シールID
 * @returns {Object|null} 物理ボディ
 */
export function getStickerPhysicsBody(stickerId) {
  return getPhysicsBody(stickerId);
}

// ========================================
// イベントハンドラ
// ========================================

/**
 * イベントリスナーをセットアップ
 */
function setupEventListeners() {
  // ジャイロイベント
  window.addEventListener("deviceorientation", handleDeviceOrientation);

  // リサイズイベント
  window.addEventListener("resize", updateWalls);
}

/**
 * イベントリスナーを解除
 */
function removeEventListeners() {
  window.removeEventListener("deviceorientation", handleDeviceOrientation);
  window.removeEventListener("resize", updateWalls);
}

// ========================================
// 外部公開API - 再エクスポート
// ========================================

// エンジン初期化
export { initPhysicsEngine, updateWalls, isPhysicsActive };

// 速度・位置操作
export {
  applyStickerVelocity,
  setStickerPhysicsPosition,
  updateStickerPhysicsPositionDuringDrag,
};
