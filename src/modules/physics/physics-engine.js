/**
 * 物理エンジン初期化・制御モジュール
 * Matter.jsエンジンの初期化、有効化/無効化、壁の管理を担当
 */

import { PHYSICS_CONFIG } from "../constants.js";

// Matter.jsモジュール
const { Engine, World, Bodies, Runner } = Matter;

// ========================================
// 物理エンジンの状態
// ========================================
let engine = null;
let world = null;
let runner = null;
let walls = [];
let isPhysicsEnabled = false;

// ========================================
// 初期化・制御
// ========================================

/**
 * 物理エンジンを初期化
 */
export function initPhysicsEngine() {
  // エンジンを作成（下向きの重力を設定）
  const { X, Y, SCALE } = PHYSICS_CONFIG.GRAVITY;

  // エンジンオプション
  const engineOptions = {
    gravity: {
      x: X,
      y: Y,
      scale: SCALE,
    },
    // スリープ機能は無効化（重力が常に作用するようにする）
    enableSleeping: false,
  };

  // SVGフィルターを削除したため、全ブラウザで同じ精度設定を使用
  engineOptions.positionIterations = 3;
  engineOptions.velocityIterations = 2;
  engineOptions.constraintIterations = 1;

  engine = Engine.create(engineOptions);

  world = engine.world;

  // 壁を作成（フレークシールのパッケージのように画面を箱にする）
  createWalls();

  // ランナーを作成（後方互換性のため保持するが、独自ループを使用）
  runner = Runner.create();
}

/**
 * 画面端に壁を作成
 */
function createWalls() {
  const { innerWidth: width, innerHeight: height } = window;
  const { WALL_THICKNESS: thickness } = PHYSICS_CONFIG;

  // 上下左右の壁
  walls = [
    Bodies.rectangle(width / 2, -thickness / 2, width, thickness, {
      isStatic: true,
    }), // 上
    Bodies.rectangle(width / 2, height + thickness / 2, width, thickness, {
      isStatic: true,
    }), // 下
    Bodies.rectangle(-thickness / 2, height / 2, thickness, height, {
      isStatic: true,
    }), // 左
    Bodies.rectangle(width + thickness / 2, height / 2, thickness, height, {
      isStatic: true,
    }), // 右
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
}

/**
 * 物理モードを無効化
 */
export function disablePhysics() {
  if (!isPhysicsEnabled) return;

  isPhysicsEnabled = false;
}

/**
 * 物理モードが有効かどうか
 */
export function isPhysicsActive() {
  return isPhysicsEnabled;
}

/**
 * エンジンを取得（他のモジュールから参照用）
 */
export function getEngine() {
  return engine;
}

/**
 * ワールドを取得（他のモジュールから参照用）
 */
export function getWorld() {
  return world;
}

/**
 * 物理モードの有効状態を取得（他のモジュールから参照用）
 */
export function getIsPhysicsEnabled() {
  return isPhysicsEnabled;
}

/**
 * 物理モードの有効状態を設定（他のモジュールから参照用）
 */
export function setIsPhysicsEnabled(value) {
  isPhysicsEnabled = value;
}
