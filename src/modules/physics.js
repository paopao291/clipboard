/**
 * 物理エンジンモジュール
 * Matter.jsを使用してフレークシールのような物理演出を実装
 */

import { state } from "../state.js";
import { PHYSICS_CONFIG, STICKER_DEFAULTS, HELP_STICKER_CONFIG } from "./constants.js";

// Matter.jsモジュール
const { Engine, Render, World, Bodies, Body, Events, Runner, Mouse, MouseConstraint } = Matter;

// 物理エンジンの状態
let engine = null;
let world = null;
let runner = null;
let walls = [];
let mouseConstraint = null;
let isPhysicsEnabled = false;

// シールIDと物理ボディのマッピング
const stickerBodyMap = new Map();

// マウス位置（PC用風の効果）
let mousePosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

// 重力制御用（スマホのジャイロ用）
let targetGravity = { 
  x: PHYSICS_CONFIG.GYRO.INITIAL_X, 
  y: PHYSICS_CONFIG.GYRO.INITIAL_Y 
};
let isGyroActive = false; // ジャイロが実際に動作しているか

// ジャイロ対応
let isGyroAvailable = false;
let gyroPermissionGranted = false;

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
  
  console.log("物理エンジン初期化完了");
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
  
  console.log("物理モード開始");
  isPhysicsEnabled = true;
  
  // PC用: 重力を下向きに設定
  const { X, Y, SCALE } = PHYSICS_CONFIG.GRAVITY;
  engine.gravity.x = X;
  engine.gravity.y = Y;
  engine.gravity.scale = SCALE;
  isGyroActive = false; // 初期はジャイロ無効（PC想定）
  
  console.log("PC重力設定:", engine.gravity, "isGyroActive:", isGyroActive);
  
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
export function disablePhysics() {
  if (!isPhysicsEnabled) return;
  
  console.log("物理モード停止");
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
}

/**
 * シールに物理ボディを追加
 * @param {Object} sticker - シールオブジェクト
 */
export function addPhysicsBody(sticker) {
  if (!isPhysicsEnabled || !world) return;
  
  // 既に物理ボディがある場合はスキップ
  if (stickerBodyMap.has(sticker.id)) return;
  
  // シールの現在位置と実際のサイズを取得（画面座標）
  const rect = sticker.element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  
  // 実際の表示サイズから半径を計算（ヘルプステッカーのscaleも考慮）
  const radius = rect.width / 2;
  
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
  sticker.element.style.left = `calc(50% + ${x}px)`;
  sticker.element.style.top = `${yPercent}%`;
  
  if (sticker.imgWrapper) {
    // scaleも含める（ヘルプステッカーと通常シール共通）
    const baseWidth = sticker.isHelpSticker 
      ? HELP_STICKER_CONFIG.BASE_WIDTH
      : STICKER_DEFAULTS.BASE_WIDTH;
    const scale = sticker.width / baseWidth;
    sticker.imgWrapper.style.transform = `rotate(${rotation}deg) scale(${scale})`;
  }
}

/**
 * イベントリスナーをセットアップ
 */
function setupEventListeners() {
  // マウス移動イベント（風の効果を無効化したのでコメントアウト）
  // window.addEventListener("mousemove", handleMouseMove);
  
  // ジャイロイベント
  window.addEventListener("deviceorientation", handleDeviceOrientation);
  
  // リサイズイベント
  window.addEventListener("resize", updateWalls);
}

/**
 * イベントリスナーを解除
 */
function removeEventListeners() {
  // window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("deviceorientation", handleDeviceOrientation);
  window.removeEventListener("resize", updateWalls);
}

/**
 * マウス移動ハンドラ（PC用風の効果）
 */
function handleMouseMove(e) {
  mousePosition.x = e.clientX;
  mousePosition.y = e.clientY;
}

/**
 * マウスカーソルによる風の効果を適用（PC用）
 */
function applyWindForce() {
  const { RADIUS: windRadius, STRENGTH: windStrength } = PHYSICS_CONFIG.WIND;
  
  stickerBodyMap.forEach((body) => {
    const force = calculateWindForce(body, mousePosition, windRadius, windStrength);
    
    if (force) {
      Body.applyForce(body, body.position, force);
    }
  });
}

/**
 * 風の力を計算
 * @param {Object} body - 物理ボディ
 * @param {Object} mousePos - マウス位置 {x, y}
 * @param {number} radius - 風の影響範囲
 * @param {number} strength - 風の強さ
 * @returns {Object|null} 力のベクトル {x, y} または null
 */
function calculateWindForce(body, mousePos, radius, strength) {
  const dx = body.position.x - mousePos.x;
  const dy = body.position.y - mousePos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // 風の影響範囲外または原点の場合
  if (distance >= radius || distance === 0) {
    return null;
  }
  
  // 距離が近いほど強い力（逆二乗則的な減衰）
  const forceMagnitude = strength * (radius - distance) / distance;
  const normalizedDx = dx / distance;
  const normalizedDy = dy / distance;
  
  return {
    x: normalizedDx * forceMagnitude * body.mass,
    y: normalizedDy * forceMagnitude * body.mass,
  };
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
    console.log("ジャイロ値なし（PC）");
    return;
  }
  
  // ジャイロが実際に値を返している場合、ジャイロモードを有効化
  if (!isGyroActive) {
    console.log("ジャイロモード有効化");
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
    isGyroAvailable = false;
    console.log("ジャイロセンサー非対応");
    return;
  }
  
  // iOS 13以降では許可が必要
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      gyroPermissionGranted = permission === "granted";
      isGyroAvailable = gyroPermissionGranted;
      console.log("ジャイロ許可:", gyroPermissionGranted);
    } catch (error) {
      console.log("ジャイロ許可エラー:", error);
      isGyroAvailable = false;
    }
  } else {
    // PCでは存在してもジャイロは動作しないので、許可フラグはtrueだが
    // 実際の動作はisGyroActiveで判定
    isGyroAvailable = true;
    gyroPermissionGranted = true;
    console.log("DeviceOrientationEvent利用可能（PC/Android）");
  }
}

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

