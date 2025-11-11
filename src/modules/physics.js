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
import { PHYSICS_CONFIG, STICKER_DEFAULTS, HELP_STICKER_CONFIG } from "./constants.js";

// Matter.jsモジュール
const { Engine, World, Bodies, Body, Events, Runner } = Matter;

// ========================================
// 物理エンジンの状態
// ========================================
let engine = null;
let world = null;
let runner = null;
let walls = [];
let isPhysicsEnabled = false;

// シールIDと物理ボディのマッピング
const stickerBodyMap = new Map();

// ========================================
// ジャイロセンサー関連（スマホ用）
// ========================================
let targetGravity = { 
  x: PHYSICS_CONFIG.GYRO.INITIAL_X, 
  y: PHYSICS_CONFIG.GYRO.INITIAL_Y 
};
let isGyroActive = false;
let gyroPermissionGranted = false;

// ========================================
// 初期化・制御
// ========================================

/**
 * 物理エンジンを初期化
 */
export function initPhysicsEngine() {
  // エンジンを作成（下向きの重力を設定）
  const { X, Y, SCALE } = PHYSICS_CONFIG.GRAVITY;
  engine = Engine.create({
    gravity: { 
      x: X, 
      y: Y,
      scale: SCALE
    },
  });
  
  world = engine.world;
  
  // 壁を作成（フレークシールのパッケージのように画面を箱にする）
  createWalls();
  
  // ランナーを作成
  runner = Runner.create();
  
  // 更新ループを設定
  Events.on(engine, "afterUpdate", syncDOMWithPhysics);
}

/**
 * 画面端に壁を作成
 */
function createWalls() {
  const { innerWidth: width, innerHeight: height } = window;
  const { WALL_THICKNESS: thickness } = PHYSICS_CONFIG;
  
  // 上下左右の壁
  walls = [
    Bodies.rectangle(width / 2, -thickness / 2, width, thickness, { isStatic: true }), // 上
    Bodies.rectangle(width / 2, height + thickness / 2, width, thickness, { isStatic: true }), // 下
    Bodies.rectangle(-thickness / 2, height / 2, thickness, height, { isStatic: true }), // 左
    Bodies.rectangle(width + thickness / 2, height / 2, thickness, height, { isStatic: true }), // 右
  ];
  
  World.add(world, walls);
}

/**
 * 画面リサイズ時に壁を再作成
 */
export function updateWalls() {
  if (!world) return;
  
  // 既存の壁を削除
  World.remove(world, walls);
  
  // 新しい壁を作成
  createWalls();
}

/**
 * 物理モードを有効化
 */
export function enablePhysics() {
  if (isPhysicsEnabled) return;
  
  isPhysicsEnabled = true;
  
  // PC用: 重力を下向きに設定
  const { X, Y, SCALE } = PHYSICS_CONFIG.GRAVITY;
  engine.gravity.x = X;
  engine.gravity.y = Y;
  engine.gravity.scale = SCALE;
  isGyroActive = false; // 初期はジャイロ無効（PC想定）
  
  // 全てのシールに物理ボディを追加（ヘルプステッカーも含む）
  state.stickers.forEach(sticker => {
    addPhysicsBody(sticker);
  });
  
  // エンジンを起動
  Runner.run(runner, engine);
  
  // イベントリスナーを登録
  setupEventListeners();
  
  // ジャイロセンサーのチェック
  checkGyroAvailability();
}

/**
 * 物理モードを無効化
 */
export async function disablePhysics() {
  if (!isPhysicsEnabled) return;
  
  isPhysicsEnabled = false;
  isGyroActive = false;
  
  // エンジンを停止
  Runner.stop(runner);
  
  // 全ての物理ボディを削除し、現在の位置でDOMを固定
  stickerBodyMap.forEach((body, stickerId) => {
    const sticker = state.getStickerById(stickerId);
    if (sticker) {
      // 現在の物理位置をDOMに反映して固定
      syncStickerFromPhysics(sticker, body);
    }
    World.remove(world, body);
  });
  
  stickerBodyMap.clear();
  
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
// 物理ボディ管理
// ========================================

/**
 * シールに物理ボディを追加
 * @param {Object} sticker - シールオブジェクト
 */
export function addPhysicsBody(sticker) {
  if (!isPhysicsEnabled || !world) return;
  
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
  const body = Bodies.circle(x, y, radius, {
    restitution: RESTITUTION,
    friction: FRICTION,
    frictionAir: FRICTION_AIR,
    density: DENSITY,
    angle: (sticker.rotation * Math.PI) / 180,
  });
  
  // ボディをワールドに追加
  World.add(world, body);
  
  // マッピングに追加
  stickerBodyMap.set(sticker.id, body);
}

/**
 * シールの物理ボディを削除
 * @param {number} stickerId - シールID
 */
export function removePhysicsBody(stickerId) {
  const body = stickerBodyMap.get(stickerId);
  if (body && world) {
    World.remove(world, body);
    stickerBodyMap.delete(stickerId);
  }
}

// ========================================
// 同期・更新処理
// ========================================

/**
 * 物理ボディとDOMを同期
 */
function syncDOMWithPhysics() {
  stickerBodyMap.forEach((body, stickerId) => {
    const sticker = state.getStickerById(stickerId);
    if (sticker) {
      syncStickerFromPhysics(sticker, body);
    }
  });
  
  // ジャイロが有効な場合のみ重力を更新（スマホ）
  if (isGyroActive) {
    updateGravity();
  }
  // PC時は重力は固定のまま（updateGravityを呼ばない）
}

/**
 * 物理ボディの位置・回転をDOMに反映
 * @param {Object} sticker - シールオブジェクト
 * @param {Object} body - 物理ボディ
 */
function syncStickerFromPhysics(sticker, body) {
  // 座標変換
  const { x, yPercent } = convertPhysicsToHybridCoords(body.position);
  const rotation = convertRadiansToDegrees(body.angle);
  
  // ステッカーのプロパティを更新
  updateStickerProperties(sticker, x, yPercent, rotation);
  
  // DOMスタイルを更新
  updateStickerDOM(sticker, x, yPercent, rotation);
}

/**
 * 物理座標をハイブリッド座標系に変換
 * @param {Object} position - 物理ボディの位置 {x, y}
 * @returns {Object} ハイブリッド座標 {x, yPercent}
 */
function convertPhysicsToHybridCoords(position) {
  const centerX = window.innerWidth / 2;
  const x = position.x - centerX;
  const yPercent = (position.y / window.innerHeight) * 100;
  
  return { x, yPercent };
}

/**
 * ラジアンを度に変換
 * @param {number} radians - ラジアン
 * @returns {number} 度
 */
function convertRadiansToDegrees(radians) {
  return (radians * 180) / Math.PI;
}

/**
 * ステッカーのプロパティを更新
 * @param {Object} sticker - シールオブジェクト
 * @param {number} x - X座標
 * @param {number} yPercent - Y座標（パーセント）
 * @param {number} rotation - 回転角度
 */
function updateStickerProperties(sticker, x, yPercent, rotation) {
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
function updateStickerDOM(sticker, x, yPercent, rotation) {
  // 位置を更新
  sticker.element.style.left = `calc(50% + ${x}px)`;
  sticker.element.style.top = `${yPercent}%`;
  
  // 回転とスケールを更新
  if (sticker.imgWrapper) {
    const baseWidth = getBaseWidth(sticker);
    const scale = sticker.width / baseWidth;
    sticker.imgWrapper.style.transform = `rotate(${rotation}deg) scale(${scale})`;
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

/**
 * デバイス向きハンドラ（スマホ用ジャイロ制御）
 */
function handleDeviceOrientation(e) {
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
 */
function updateGravity() {
  if (!engine) return;
  
  const { GRAVITY_LERP_FACTOR } = PHYSICS_CONFIG;
  
  engine.gravity.x += (targetGravity.x - engine.gravity.x) * GRAVITY_LERP_FACTOR;
  engine.gravity.y += (targetGravity.y - engine.gravity.y) * GRAVITY_LERP_FACTOR;
}

/**
 * ジャイロセンサーの利用可能性をチェック
 */
async function checkGyroAvailability() {
  // DeviceOrientationEventが存在するかチェック
  if (!window.DeviceOrientationEvent) {
    gyroPermissionGranted = false;
    return;
  }
  
  // iOS 13以降では許可が必要
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      gyroPermissionGranted = permission === "granted";
    } catch (error) {
      gyroPermissionGranted = false;
    }
  } else {
    // Android/PCでは自動的に許可
    // ただし、PCではbeta/gammaがnullなので実際には動作しない
    gyroPermissionGranted = true;
  }
}

// ========================================
// 外部公開API
// ========================================

/**
 * 物理モードが有効かどうか
 */
export function isPhysicsActive() {
  return isPhysicsEnabled;
}

/**
 * シールに速度を加える（投げる動作用）
 * @param {number} stickerId - シールID
 * @param {number} vx - X方向の速度
 * @param {number} vy - Y方向の速度
 */
export function applyStickerVelocity(stickerId, vx, vy) {
  const body = stickerBodyMap.get(stickerId);
  if (body) {
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
  if (body) {
    Body.setPosition(body, { x, y });
    Body.setVelocity(body, { x: 0, y: 0 }); // 速度をリセット
    Body.setAngularVelocity(body, 0); // 角速度をリセット
  }
}

/**
 * シールの物理ボディを取得
 * @param {number} stickerId - シールID
 * @returns {Object|null} 物理ボディ
 */
export function getStickerPhysicsBody(stickerId) {
  return stickerBodyMap.get(stickerId) || null;
}

