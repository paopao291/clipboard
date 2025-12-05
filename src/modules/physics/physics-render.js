/**
 * 物理レンダリング管理モジュール
 * レンダリングループ、DOM同期、補間処理を担当
 */

import { state } from "../../state.js";
import { logger } from "../../utils/logger.js";
import {
  PHYSICS_CONFIG,
  STICKER_DEFAULTS,
  HELP_STICKER_CONFIG,
} from "../constants.js";
import { physicsToHybrid, radiansToDegrees } from "../coordinate-utils.js";

// ========================================
// レンダリング状態
// ========================================

// 補間用：前回の物理状態を保存
const previousBodyStates = new Map(); // stickerId -> {position: {x, y}, angle: number}

// 固定タイムステップ + 補間の設定
const PHYSICS_HZ = 60; // 物理演算60Hz（全ブラウザ共通）
const RENDER_FPS = 60; // レンダリング: 常に60FPS（滑らか）
const PHYSICS_DELTA = 1000 / PHYSICS_HZ; // 物理演算の間隔（ms）
const RENDER_DELTA = 1000 / RENDER_FPS; // レンダリングの間隔（ms）

// レンダリングループの状態
let renderLoopId = null;
let lastRenderTime = 0;
let lastPhysicsTime = 0;
let accumulator = 0;

// 更新バッチ処理用のバッファとキャッシュ
const updateBuffer = new Map();
let batchUpdateScheduled = false;

// DOM更新のキャッシュ（パフォーマンス最適化）
const domUpdateCache = new Map();

// ========================================
// レンダリングループ
// ========================================

/**
 * レンダリングループを開始
 * @param {Object} engine - Matter.jsエンジン
 * @param {Function} getStickerBodyMap - 物理ボディマップを取得する関数
 * @param {Function} getIsPhysicsEnabled - 物理モード有効状態を取得する関数
 * @param {Function} getIsGyroActive - ジャイロ有効状態を取得する関数
 * @param {Function} updateGravity - 重力更新関数
 */
export function startRenderLoop(
  engine,
  getStickerBodyMap,
  getIsPhysicsEnabled,
  getIsGyroActive,
  updateGravity,
) {
  // レンダリングループの状態をリセット
  lastPhysicsTime = 0;
  lastRenderTime = 0;
  accumulator = 0;
  previousBodyStates.clear();

  // キャッシュをクリア
  domUpdateCache.clear();
  updateBuffer.clear();
  batchUpdateScheduled = false;

  // レンダリングループを開始
  const renderLoop = (currentTime) => {
    if (!getIsPhysicsEnabled()) {
      renderLoopId = null;
      return;
    }

    // 次のフレームをスケジュール
    renderLoopId = requestAnimationFrame(renderLoop);

    // 初回実行時の時刻を設定
    if (lastPhysicsTime === 0) {
      lastPhysicsTime = currentTime;
      lastRenderTime = currentTime;
      return;
    }

    // レンダリング頻度を制限（60FPS）
    const renderDelta = currentTime - lastRenderTime;
    if (renderDelta < RENDER_DELTA) {
      return;
    }
    lastRenderTime = currentTime;

    // 物理演算の更新
    const physicsDelta = currentTime - lastPhysicsTime;
    accumulator += physicsDelta;
    lastPhysicsTime = currentTime;

    // 固定タイムステップで物理演算を実行
    let physicsSteps = 0;
    while (accumulator >= PHYSICS_DELTA) {
      stepPhysics(engine, getStickerBodyMap, getIsGyroActive, updateGravity);
      accumulator -= PHYSICS_DELTA;
      physicsSteps++;
    }

    // デバッグログ（最初の数フレームのみ）
    if (lastRenderTime < 1000) {
      // 最初の1秒間のみ
      const stickerBodyMap = getStickerBodyMap();
      if (physicsSteps > 0 && stickerBodyMap.size > 0) {
        const firstBody = stickerBodyMap.values().next().value;
        if (firstBody) {
          logger.log(
            `物理モード: レンダリングループ動作中 (物理ステップ: ${physicsSteps}, ボディ数: ${stickerBodyMap.size}, 最初のボディ位置: x=${firstBody.position.x.toFixed(1)}, y=${firstBody.position.y.toFixed(1)})`,
          );
        }
      }
    }

    // 補間係数を計算（0.0〜1.0）
    const alpha = accumulator / PHYSICS_DELTA;

    // 補間してレンダリング
    renderWithInterpolation(alpha, getStickerBodyMap());
  };

  renderLoopId = requestAnimationFrame(renderLoop);
}

/**
 * レンダリングループを停止
 */
export function stopRenderLoop() {
  if (renderLoopId) {
    cancelAnimationFrame(renderLoopId);
    renderLoopId = null;
  }

  // キャッシュをクリア
  domUpdateCache.clear();
  updateBuffer.clear();
  batchUpdateScheduled = false;
  previousBodyStates.clear();
}

/**
 * 前回の物理状態を保存（補間用）
 * @param {Map} stickerBodyMap - 物理ボディマップ
 */
function savePreviousPhysicsStates(stickerBodyMap) {
  stickerBodyMap.forEach((body, stickerId) => {
    previousBodyStates.set(stickerId, {
      position: { x: body.position.x, y: body.position.y },
      angle: body.angle,
    });
  });
}

/**
 * 物理演算を1ステップ実行
 * @param {Object} engine - Matter.jsエンジン
 * @param {Function} getStickerBodyMap - 物理ボディマップを取得する関数
 * @param {Function} getIsGyroActive - ジャイロ有効状態を取得する関数
 * @param {Function} updateGravity - 重力更新関数
 */
export function stepPhysics(
  engine,
  getStickerBodyMap,
  getIsGyroActive,
  updateGravity,
) {
  // 前回の状態を保存
  savePreviousPhysicsStates(getStickerBodyMap());

  // 物理演算を実行
  // リファクタリング前の実装に合わせる（PHYSICS_DELTAはミリ秒単位）
  Matter.Engine.update(engine, PHYSICS_DELTA);

  // 重力を更新
  // ジャイロが有効な場合: ジャイロセンサーの値に基づいて重力を更新（スマホ）
  // ジャイロが無効な場合: 固定重力は既にエンジンに設定されているので更新不要（PC環境）
  // ただし、PC環境で固定重力を設定した場合は、一度だけ適用する必要がある
  if (getIsGyroActive()) {
    updateGravity(engine);
  }
}

/**
 * ボディの更新をスキップすべきか判定
 * @param {Object} body - 物理ボディ
 * @param {Object} prevState - 前回の物理状態 {position: {x, y}, angle: number}
 * @returns {Object} { shouldSkip: boolean, reason: string }
 */
function shouldSkipBodyUpdate(body, prevState) {
  // 速度が閾値以下なら更新スキップ（ほぼ静止）
  const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
  const angularSpeed = Math.abs(body.angularVelocity);

  if (
    speed < PHYSICS_CONFIG.VELOCITY_THRESHOLD &&
    angularSpeed < PHYSICS_CONFIG.ANGLE_THRESHOLD
  ) {
    return { shouldSkip: true, reason: "velocity_low" };
  }

  // 前回の状態がない場合は更新が必要（初回）
  if (!prevState) {
    return { shouldSkip: false, reason: "first_render" };
  }

  // 位置と角度の変化をチェック
  const deltaX = Math.abs(body.position.x - prevState.position.x);
  const deltaY = Math.abs(body.position.y - prevState.position.y);
  const deltaAngle = Math.abs(body.angle - prevState.angle);

  // 変化が閾値以下なら更新スキップ
  if (
    deltaX < PHYSICS_CONFIG.POSITION_THRESHOLD &&
    deltaY < PHYSICS_CONFIG.POSITION_THRESHOLD &&
    deltaAngle < PHYSICS_CONFIG.ANGLE_THRESHOLD
  ) {
    return { shouldSkip: true, reason: "change_low" };
  }

  return { shouldSkip: false, reason: "needs_update" };
}

/**
 * 補間された状態を計算
 * @param {Object} body - 物理ボディ
 * @param {Object} prevState - 前回の物理状態 {position: {x, y}, angle: number}
 * @param {number} alpha - 補間係数（0.0〜1.0）
 * @returns {Object} { interpX: number, interpY: number, interpAngle: number }
 */
function calculateInterpolatedState(body, prevState, alpha) {
  // 前回の状態がない場合は現在の値をそのまま返す
  if (!prevState) {
    return {
      interpX: body.position.x,
      interpY: body.position.y,
      interpAngle: body.angle,
    };
  }

  // 位置と角度を補間
  const interpX = lerp(prevState.position.x, body.position.x, alpha);
  const interpY = lerp(prevState.position.y, body.position.y, alpha);
  const interpAngle = lerpAngle(prevState.angle, body.angle, alpha);

  return { interpX, interpY, interpAngle };
}

/**
 * 更新が必要なステッカーを収集
 * @param {number} alpha - 補間係数（0.0〜1.0）
 * @param {Map} stickerBodyMap - 物理ボディマップ
 * @returns {Array} 更新候補の配列 [{sticker, body, isFirst} または {sticker, interpX, interpY, interpAngle}]
 */
function collectUpdateCandidates(alpha, stickerBodyMap) {
  const updatesNeeded = [];
  const cacheThreshold = 0.1; // キャッシュ比較の閾値

  stickerBodyMap.forEach((body, stickerId) => {
    const sticker = state.getStickerById(stickerId);
    if (!sticker) return;

    // ドラッグ中のステッカーはスキップ（ドラッグ操作と競合しないように）
    if (
      state.selectedSticker &&
      state.selectedSticker.id === stickerId &&
      state.isDragging
    ) {
      return;
    }

    // 前回の状態を取得
    const prevState = previousBodyStates.get(stickerId);

    // 更新をスキップすべきか判定
    const { shouldSkip, reason } = shouldSkipBodyUpdate(body, prevState);

    if (shouldSkip && reason !== "first_render") {
      return; // 更新不要
    }

    // 初回レンダリング（前回の状態がない場合）
    if (reason === "first_render") {
      updatesNeeded.push({ sticker, body, isFirst: true });
      return;
    }

    // 補間された状態を計算
    const { interpX, interpY, interpAngle } = calculateInterpolatedState(
      body,
      prevState,
      alpha,
    );

    // キャッシュをチェック
    const cachedValues = domUpdateCache.get(stickerId);
    if (cachedValues) {
      const [lastX, lastY, lastRotation] = cachedValues;

      // キャッシュ値と近ければスキップ
      if (
        Math.abs(interpX - lastX) < cacheThreshold &&
        Math.abs(interpY - lastY) < cacheThreshold &&
        Math.abs(interpAngle - lastRotation) < cacheThreshold * 0.1
      ) {
        return;
      }
    }

    // キャッシュ更新
    domUpdateCache.set(stickerId, [interpX, interpY, interpAngle]);

    // 更新リストに追加
    updatesNeeded.push({
      sticker,
      interpX,
      interpY,
      interpAngle,
    });
  });

  return updatesNeeded;
}

/**
 * DOM一括更新（バッチ処理）
 * @param {Array} updatesNeeded - 更新候補の配列
 */
function batchUpdateDOM(updatesNeeded) {
  // 更新がない場合は早期リターン
  if (updatesNeeded.length === 0) return;

  // 一括でDOMを更新
  updatesNeeded.forEach((update) => {
    try {
      if (update.isFirst) {
        // 初回は補間なしで描画
        syncStickerFromPhysics(update.sticker, update.body);
      } else {
        // 補間した値でDOMを更新
        syncStickerFromPhysicsInterpolated(
          update.sticker,
          update.interpX,
          update.interpY,
          update.interpAngle,
        );
      }
    } catch (error) {
      // DOM更新エラーをログに記録（処理は継続）
      logger.warn(`DOM更新エラー: ステッカーID ${update.sticker.id}`, error);
    }
  });
}

/**
 * 補間を使ってDOMを更新（バッチ処理最適化）
 * @param {number} alpha - 補間係数（0.0〜1.0）
 * @param {Map} stickerBodyMap - 物理ボディマップ
 */
function renderWithInterpolation(alpha, stickerBodyMap) {
  // 更新が必要なステッカーを収集
  const updatesNeeded = collectUpdateCandidates(alpha, stickerBodyMap);

  // DOM一括更新
  batchUpdateDOM(updatesNeeded);
}

/**
 * 線形補間
 * @param {number} a - 開始値
 * @param {number} b - 終了値
 * @param {number} t - 補間係数（0.0〜1.0）
 * @returns {number} 補間された値
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * 角度の線形補間（最短経路）
 * @param {number} a - 開始角度（ラジアン）
 * @param {number} b - 終了角度（ラジアン）
 * @param {number} t - 補間係数（0.0〜1.0）
 * @returns {number} 補間された角度
 */
export function lerpAngle(a, b, t) {
  // 最短経路を選択
  let delta = b - a;
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  return a + delta * t;
}

// ========================================
// DOM同期処理
// ========================================

/**
 * 物理ボディの位置・回転をDOMに反映
 * @param {Object} sticker - シールオブジェクト
 * @param {Object} body - 物理ボディ
 */
export function syncStickerFromPhysics(sticker, body) {
  // 座標変換
  const { x, yPercent } = physicsToHybrid(body.position);
  const rotation = radiansToDegrees(body.angle);

  // ステッカーのプロパティを更新
  updateStickerProperties(sticker, x, yPercent, rotation);

  // DOMスタイルを更新
  updateStickerDOM(sticker, x, yPercent, rotation);
}

/**
 * 補間した位置・回転でDOMを更新
 * @param {Object} sticker - シールオブジェクト
 * @param {number} physicsX - 物理座標のX
 * @param {number} physicsY - 物理座標のY
 * @param {number} angle - 角度（ラジアン）
 */
function syncStickerFromPhysicsInterpolated(
  sticker,
  physicsX,
  physicsY,
  angle,
) {
  // 座標変換
  const { x, yPercent } = physicsToHybrid({
    x: physicsX,
    y: physicsY,
  });
  const rotation = radiansToDegrees(angle);

  // ステッカーのプロパティを更新
  updateStickerProperties(sticker, x, yPercent, rotation);

  // DOMスタイルを更新
  updateStickerDOM(sticker, x, yPercent, rotation);
}

/**
 * ステッカーのプロパティを更新
 * @param {Object} sticker - シールオブジェクト
 * @param {number} x - X座標
 * @param {number} yPercent - Y座標（パーセント）
 * @param {number} rotation - 回転角度
 */
export function updateStickerProperties(sticker, x, yPercent, rotation) {
  sticker.x = x;
  sticker.yPercent = yPercent;
  sticker.rotation = rotation;
}

/**
 * ステッカーのDOMを更新
 * @param {Object} sticker - シールオブジェクト
 * @param {number} x - X座標
 * @param {number} yPercent - Y座標（パーセント）
 * @param {number} rotation - 回転角度
 */
export function updateStickerDOM(sticker, x, yPercent, rotation) {
  // 位置を更新
  sticker.element.style.left = `calc(50% + ${x}px)`;
  sticker.element.style.top = `${yPercent}%`;

  // 回転とスケールを更新
  if (sticker.imgWrapper) {
    const baseWidth = getBaseWidth(sticker);
    const scale = sticker.width / baseWidth;

    // transform一括指定
    sticker.imgWrapper.style.transform = `rotate(${rotation}deg) scale(${scale})`;

    // 物理モード中はwill-changeを常に適用（パフォーマンス向上のためのGPU加速強化）
    sticker.imgWrapper.style.willChange = "transform";
    sticker.imgWrapper.style.backfaceVisibility = "hidden";
    sticker.imgWrapper.style.webkitBackfaceVisibility = "hidden";
  }
}

/**
 * ステッカーの基準幅を取得
 * @param {Object} sticker - シールオブジェクト
 * @returns {number} 基準幅
 */
function getBaseWidth(sticker) {
  return sticker.isHelpSticker
    ? HELP_STICKER_CONFIG.BASE_WIDTH
    : STICKER_DEFAULTS.BASE_WIDTH;
}

/**
 * 前回の物理状態マップを取得（他のモジュールから参照用）
 */
export function getPreviousBodyStates() {
  return previousBodyStates;
}
