/**
 * ジャイロセンサー管理モジュール
 * スマホのジャイロセンサーによる重力方向制御を担当
 */

import { PHYSICS_CONFIG } from "../constants.js";

// ========================================
// ジャイロセンサー関連（スマホ用）
// ========================================
let targetGravity = {
  x: PHYSICS_CONFIG.GYRO.INITIAL_X,
  y: PHYSICS_CONFIG.GYRO.INITIAL_Y,
};
let isGyroActive = false;
let gyroPermissionGranted = false;

// ========================================
// イベントハンドラ
// ========================================

/**
 * デバイス向きハンドラ（スマホ用ジャイロ制御）
 */
export function handleDeviceOrientation(e) {
  if (!gyroPermissionGranted) return;

  // beta: 前後の傾き (-180 to 180)
  // gamma: 左右の傾き (-90 to 90)
  const beta = e.beta;
  const gamma = e.gamma;

  // betaとgammaがnullの場合はPCなので処理しない
  if (beta === null || gamma === null) {
    return;
  }

  // ジャイロが実際に値を返している場合、ジャイロモードを有効化
  if (!isGyroActive) {
    isGyroActive = true;
  }

  // 傾きから重力ベクトルを計算
  targetGravity = calculateGravityFromOrientation(beta, gamma);
}

/**
 * デバイスの傾きから重力ベクトルを計算
 * @param {number} beta - 前後の傾き
 * @param {number} gamma - 左右の傾き
 * @returns {Object} 重力ベクトル {x, y}
 */
function calculateGravityFromOrientation(beta, gamma) {
  const { STRENGTH, NEUTRAL_BETA, DEFAULT_GRAVITY } = PHYSICS_CONFIG.GYRO;

  // 傾きから重力ベクトルを計算（符号を反転させない）
  const x = (gamma / 90) * STRENGTH;
  const y = ((beta - NEUTRAL_BETA) / 90) * STRENGTH + DEFAULT_GRAVITY;

  // 範囲を制限
  return {
    x: Math.max(-1, Math.min(1, x)),
    y: Math.max(-1, Math.min(1, y)),
  };
}

/**
 * 重力を滑らかに更新（lerp補間）
 * @param {Object} engine - Matter.jsエンジン
 */
export function updateGravity(engine) {
  if (!engine) return;

  const { GRAVITY_LERP_FACTOR } = PHYSICS_CONFIG;

  // 重力変化を計算
  engine.gravity.x +=
    (targetGravity.x - engine.gravity.x) * GRAVITY_LERP_FACTOR;
  engine.gravity.y +=
    (targetGravity.y - engine.gravity.y) * GRAVITY_LERP_FACTOR;
}

/**
 * ジャイロセンサーの利用可能性をチェック（ユーザーインタラクション内で呼び出す必要あり）
 * @returns {Promise<boolean>} 許可が得られた場合はtrue
 */
export async function checkGyroAvailability() {
  // DeviceOrientationEventが存在するかチェック
  if (!window.DeviceOrientationEvent) {
    gyroPermissionGranted = false;
    console.log("物理モード: DeviceOrientationEventが利用できません（PC環境）");
    return false;
  }

  // iOS 13以降では許可が必要（ユーザーインタラクション内で実行する必要あり）
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    try {
      console.log("物理モード: 方向センサーの許可をリクエスト中...");
      const permission = await DeviceOrientationEvent.requestPermission();
      gyroPermissionGranted = permission === "granted";

      if (gyroPermissionGranted) {
        console.log("物理モード: 方向センサーの許可が付与されました");
      } else {
        console.log("物理モード: 方向センサーの許可が拒否されました");
        // ユーザーに通知
        const { showToast } = await import("../ui.js");
        showToast("方向センサーの許可が必要です");
      }
      return gyroPermissionGranted;
    } catch (error) {
      console.warn("物理モード: 方向センサーの許可リクエストに失敗:", error);
      gyroPermissionGranted = false;
      // ユーザーに通知
      const { showToast } = await import("../ui.js");
      showToast("方向センサーの許可に失敗しました");
      return false;
    }
  } else {
    // Android/PCでは自動的に許可
    // ただし、PCではbeta/gammaがnullなので実際には動作しない
    gyroPermissionGranted = true;
    console.log("物理モード: 方向センサーは自動的に利用可能です（Android）");
    return true;
  }
}

/**
 * ターゲット重力を取得
 */
export function getTargetGravity() {
  return targetGravity;
}

/**
 * ジャイロが有効かどうか
 */
export function getIsGyroActive() {
  return isGyroActive;
}

/**
 * ジャイロの有効状態を設定
 */
export function setIsGyroActive(value) {
  isGyroActive = value;
}

/**
 * ジャイロ許可状態を取得
 */
export function getGyroPermissionGranted() {
  return gyroPermissionGranted;
}
