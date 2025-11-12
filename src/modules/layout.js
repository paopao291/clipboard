/**
 * 自動レイアウトモジュール（斥力ベース配置システム）
 * ステッカーを重なりを避けながらバランスよく配置する
 * 
 * 【アルゴリズム】
 * - 各ステッカーが他のステッカーから斥力を受ける
 * - 重なっている場合は強い斥力、離れている場合は弱い斥力
 * - 画面境界からも反発力を受ける
 * - 画面中心への弱い引力で配置範囲を制限
 * - 最終位置を事前計算し、スムーズなアニメーションで移動
 * 
 * 【物理モードとの違い】
 * - 物理モード: リアルタイムの重力シミュレーション（Matter.js使用）
 * - 自動レイアウト: 斥力による最適配置の計算とアニメーション
 */

import { state } from "../state.js";
import { updateStickerPosition, saveAllStickerPositions } from "./sticker.js";
import { showToast, elements } from "./ui.js";

// ========================================
// 定数
// ========================================

const LAYOUT_CONFIG = {
  // 最終位置計算の反復回数（Safari最適化：200→100に削減）
  CALCULATION_ITERATIONS: 100,
  // 計算時の力の減衰（Safari最適化：収束を早めるため0.3→0.4に増加）
  CALCULATION_DAMPING: 0.4,
  // 計算時の最小移動量（収束判定：緩和して早期終了しやすく）
  CALCULATION_MIN_MOVEMENT: 0.5,
  // 斥力の強さ
  REPULSION_STRENGTH: 100,
  // 画面境界からの斥力の強さ
  BOUNDARY_REPULSION: 100,
  // 画面境界とのマージン（px）
  BOUNDARY_MARGIN: 50,
  // 画面中心への引力の強さ
  CENTER_ATTRACTION: 0.15,
  // 理想的な配置範囲（画面サイズに対する割合 0-1）
  IDEAL_AREA_RATIO: 0.4,
  // アニメーション時間（ミリ秒）
  ANIMATION_DURATION: 800,
  // アニメーションのイージング関数の係数
  EASING_POWER: 3,
  // 力の最大値（発散防止）
  MAX_FORCE: 300,
  // 最小距離（ゼロ除算防止）
  MIN_DISTANCE: 10,
};

// ========================================
// レイアウトエンジンの状態
// ========================================

let isLayoutActive = false;
let layoutAnimationId = null;

// ========================================
// 公開API
// ========================================

/**
 * 自動レイアウトを開始
 * @returns {Promise<void>}
 */
export async function startAutoLayout() {
  // 既に実行中なら停止
  if (isLayoutActive) {
    stopAutoLayout();
  }

  // 固定されていないステッカーが2つ未満なら何もしない
  const unpinnedStickers = state.stickers.filter(s => !s.isPinned);
  if (unpinnedStickers.length < 2) {
    return;
  }

  isLayoutActive = true;

  try {
    // Step 1: 最終位置を計算（見えないところで完了まで実行）
    const finalPositions = calculateFinalPositions();

    // Step 2: 各ステッカーを最終位置にスムーズにアニメーション
    return new Promise((resolve) => {
      animateToFinalPositions(finalPositions, resolve);
    });
  } catch (error) {
    console.error('自動レイアウトエラー:', error);
    isLayoutActive = false;
    throw error;
  }
}

/**
 * 自動レイアウトを停止
 */
export function stopAutoLayout() {
  if (isLayoutActive) {
    isLayoutActive = false;
  }
  if (layoutAnimationId) {
    cancelAnimationFrame(layoutAnimationId);
    layoutAnimationId = null;
  }
  
  // アニメーション中クラスを削除
  removeLayoutAnimatingClass();
  
  // UIボタンの状態をリセット
  resetLayoutButtonState();
}

/**
 * レイアウトボタンの状態をリセット
 */
function resetLayoutButtonState() {
  if (elements.layoutBtn) {
    elements.layoutBtn.classList.remove("active");
    elements.layoutBtn.disabled = false;
  }
}

/**
 * 自動レイアウトが実行中か確認
 * @returns {boolean}
 */
export function isLayoutRunning() {
  return isLayoutActive;
}

// ========================================
// レイアウトアルゴリズム
// ========================================

/**
 * 最終位置を計算（見えないところで一気に計算）
 * @returns {Map<number, {x: number, yPercent: number}>} ステッカーIDと最終位置のマップ
 */
function calculateFinalPositions() {
  // 固定されていないステッカーのみを対象にする
  const stickers = state.stickers.filter(s => !s.isPinned);
  const positions = new Map();
  
  // 現在の位置を仮想位置としてコピー（異常値を修正）
  stickers.forEach(sticker => {
    let x = sticker.x;
    let yPercent = sticker.yPercent;
    
    // 異常な値をチェックして修正
    if (!isFinite(x) || Math.abs(x) > 10000) {
      console.warn(`ステッカー${sticker.id} の x座標が異常: ${x} → 0に修正`);
      x = 0;
      sticker.x = 0;
    }
    
    if (!isFinite(yPercent) || Math.abs(yPercent) > 200) {
      console.warn(`ステッカー${sticker.id} の yPercent座標が異常: ${yPercent} → 50に修正`);
      yPercent = 50;
      sticker.yPercent = 50;
      updateStickerPosition(sticker, x, yPercent);
    }
    
    positions.set(sticker.id, {
      x: x,
      yPercent: yPercent,
    });
  });
  
  // 収束するまで計算を繰り返す（Safari最適化：早期終了条件を緩和）
  let stableCount = 0;
  for (let i = 0; i < LAYOUT_CONFIG.CALCULATION_ITERATIONS; i++) {
    const maxMovement = performCalculationStep(stickers, positions);
    
    // 収束判定（3回連続で安定したら終了）
    if (maxMovement < LAYOUT_CONFIG.CALCULATION_MIN_MOVEMENT) {
      stableCount++;
      if (stableCount >= 3) {
        console.log(`自動レイアウト: ${i + 1}回のイテレーションで収束`);
        break;
      }
    } else {
      stableCount = 0;
    }
  }
  
  return positions;
}

/**
 * 計算ステップ（実際の位置は変更せず、仮想位置を更新）
 * @param {Array} stickers - ステッカー配列
 * @param {Map} positions - 仮想位置マップ
 * @returns {number} 最大移動量
 */
function performCalculationStep(stickers, positions) {
  const forces = new Map();
  
  // 各ステッカーに働く力を初期化
  stickers.forEach(sticker => {
    forces.set(sticker.id, { x: 0, y: 0 });
  });
  
  // ステッカー間の斥力を計算
  for (let i = 0; i < stickers.length; i++) {
    for (let j = i + 1; j < stickers.length; j++) {
      const force = calculateRepulsionForceVirtual(
        stickers[i], 
        stickers[j], 
        positions
      );
      
      const forceI = forces.get(stickers[i].id);
      forceI.x += force.x;
      forceI.y += force.y;
      
      const forceJ = forces.get(stickers[j].id);
      forceJ.x -= force.x;
      forceJ.y -= force.y;
    }
  }
  
  // 画面境界からの斥力を計算
  stickers.forEach(sticker => {
    const boundaryForce = calculateBoundaryForceVirtual(sticker, positions);
    const force = forces.get(sticker.id);
    force.x += boundaryForce.x;
    force.y += boundaryForce.y;
  });
  
  // 画面中心への引力を計算
  stickers.forEach(sticker => {
    const centerForce = calculateCenterAttractionVirtual(sticker, positions);
    const force = forces.get(sticker.id);
    force.x += centerForce.x;
    force.y += centerForce.y;
  });
  
  // 仮想位置を更新
  let maxMovement = 0;
  stickers.forEach(sticker => {
    const force = forces.get(sticker.id);
    const position = positions.get(sticker.id);
    
    // 力の大きさを制限（ログなしで静かに）
    const forceMagnitude = Math.sqrt(force.x * force.x + force.y * force.y);
    if (forceMagnitude > LAYOUT_CONFIG.MAX_FORCE) {
      const scale = LAYOUT_CONFIG.MAX_FORCE / forceMagnitude;
      force.x *= scale;
      force.y *= scale;
    }
    
    const dx = force.x * LAYOUT_CONFIG.CALCULATION_DAMPING;
    const dy = force.y * LAYOUT_CONFIG.CALCULATION_DAMPING;
    
    // NaNや無限大をチェック
    if (!isFinite(dx) || !isFinite(dy)) {
      return; // 静かにスキップ
    }
    
    position.x += dx;
    position.yPercent += (dy / window.innerHeight) * 100;
    
    // 座標が異常な値になっていないかチェック
    if (!isFinite(position.x) || Math.abs(position.x) > 10000) {
      position.x = 0;
    }
    
    if (!isFinite(position.yPercent) || Math.abs(position.yPercent) > 200) {
      position.yPercent = 50;
    }
    
    const movement = Math.sqrt(dx * dx + dy * dy);
    maxMovement = Math.max(maxMovement, movement);
  });
  
  return maxMovement;
}

/**
 * 最終位置にアニメーション
 * @param {Map} finalPositions - 最終位置マップ
 * @param {Function} resolve - 完了コールバック
 */
function animateToFinalPositions(finalPositions, resolve) {
  const stickers = state.stickers;
  const startTime = performance.now();
  const startPositions = new Map();
  
  // 開始位置を記録し、アニメーション中クラスを追加
  stickers.forEach(sticker => {
    startPositions.set(sticker.id, {
      x: sticker.x,
      yPercent: sticker.yPercent,
    });
    sticker.element.classList.add('layout-animating');
  });
  
  function animate(currentTime) {
    if (!isLayoutActive) {
      // アニメーション中断時はクラスを削除
      removeLayoutAnimatingClass();
      resolve();
      return;
    }
    
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / LAYOUT_CONFIG.ANIMATION_DURATION, 1);
    
    // イージング関数（ease-out cubic）
    const eased = 1 - Math.pow(1 - progress, LAYOUT_CONFIG.EASING_POWER);
    
    // 各ステッカーを補間位置に移動
    stickers.forEach(sticker => {
      const start = startPositions.get(sticker.id);
      const end = finalPositions.get(sticker.id);
      
      if (!start || !end) return;
      
      const currentX = start.x + (end.x - start.x) * eased;
      const currentYPercent = start.yPercent + (end.yPercent - start.yPercent) * eased;
      
      updateStickerPosition(sticker, currentX, currentYPercent);
    });
    
    // アニメーション完了判定
    if (progress >= 1) {
      // アニメーション完了時はクラスを削除
      removeLayoutAnimatingClass();
      
      // 画面外チェックと保存
      checkAndFixAllOutOfBounds().then(() => {
        return saveAllStickersWithValidation();
      }).then(() => {
        isLayoutActive = false;
        resolve();
      });
      return;
    }
    
    // 次のフレーム
    layoutAnimationId = requestAnimationFrame(animate);
  }
  
  layoutAnimationId = requestAnimationFrame(animate);
}

/**
 * 全ステッカーからlayout-animatingクラスを削除
 */
function removeLayoutAnimatingClass() {
  state.stickers.forEach(sticker => {
    if (sticker.element) {
      sticker.element.classList.remove('layout-animating');
    }
  });
}


/**
 * 2つのステッカー間の斥力を計算（仮想位置版）
 * @param {Object} sticker1 - ステッカー1
 * @param {Object} sticker2 - ステッカー2
 * @param {Map} positions - 仮想位置マップ
 * @returns {Object} 力ベクトル {x, y}（画面中央基準のオフセットとして返す）
 */
function calculateRepulsionForceVirtual(sticker1, sticker2, positions) {
  const pos1 = positions.get(sticker1.id);
  const pos2 = positions.get(sticker2.id);
  
  // 絶対座標に変換
  const centerX = window.innerWidth / 2;
  const x1 = centerX + pos1.x;
  const y1 = (pos1.yPercent / 100) * window.innerHeight;
  const x2 = centerX + pos2.x;
  const y2 = (pos2.yPercent / 100) * window.innerHeight;

  // 距離ベクトル（絶対座標系）
  const dx = x1 - x2;
  const dy = y1 - y2;
  let distance = Math.sqrt(dx * dx + dy * dy);
  
  // 最小距離を確保（ゼロ除算と発散を防止）
  distance = Math.max(distance, LAYOUT_CONFIG.MIN_DISTANCE);
  
  const radius1 = sticker1.width / 2;
  const radius2 = sticker2.width / 2;
  const minDistance = radius1 + radius2;
  
  // 重なりを計算
  const overlap = Math.max(0, minDistance - distance);
  
  // 斥力を計算（ソフトな逆数則 + 重なりペナルティ）
  // 距離の逆数（逆二乗則より穏やか）
  let repulsionMagnitude = 
    (LAYOUT_CONFIG.REPULSION_STRENGTH * minDistance) / distance +
    overlap * 5;
  
  // 力の大きさを制限（発散防止）
  repulsionMagnitude = Math.min(repulsionMagnitude, LAYOUT_CONFIG.MAX_FORCE);
  
  // 力ベクトルを返す（絶対座標系での力）
  return {
    x: (dx / distance) * repulsionMagnitude,
    y: (dy / distance) * repulsionMagnitude,
  };
}

/**
 * 画面境界からの斥力を計算（仮想位置版）
 * @param {Object} sticker - ステッカー
 * @param {Map} positions - 仮想位置マップ
 * @returns {Object} 力ベクトル {x, y}（絶対座標系での力）
 */
function calculateBoundaryForceVirtual(sticker, positions) {
  const position = positions.get(sticker.id);
  
  // 絶対座標に変換
  const centerX = window.innerWidth / 2;
  const x = centerX + position.x;
  const y = (position.yPercent / 100) * window.innerHeight;
  
  const radius = sticker.width / 2;
  const margin = LAYOUT_CONFIG.BOUNDARY_MARGIN;

  let fx = 0;
  let fy = 0;

  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  // 左端
  if (x - radius < margin) {
    const penetration = margin - (x - radius);
    fx += penetration * LAYOUT_CONFIG.BOUNDARY_REPULSION;
  }

  // 右端
  if (x + radius > screenWidth - margin) {
    const penetration = (x + radius) - (screenWidth - margin);
    fx -= penetration * LAYOUT_CONFIG.BOUNDARY_REPULSION;
  }

  // 上端
  if (y - radius < margin) {
    const penetration = margin - (y - radius);
    fy += penetration * LAYOUT_CONFIG.BOUNDARY_REPULSION;
  }

  // 下端
  if (y + radius > screenHeight - margin) {
    const penetration = (y + radius) - (screenHeight - margin);
    fy -= penetration * LAYOUT_CONFIG.BOUNDARY_REPULSION;
  }

  return { x: fx, y: fy };
}

/**
 * 画面中心への引力を計算（仮想位置版）
 * @param {Object} sticker - ステッカー
 * @param {Map} positions - 仮想位置マップ
 * @returns {Object} 力ベクトル {x, y}（絶対座標系での力）
 */
function calculateCenterAttractionVirtual(sticker, positions) {
  const position = positions.get(sticker.id);
  
  // 絶対座標に変換
  const centerX = window.innerWidth / 2;
  const x = centerX + position.x;
  const y = (position.yPercent / 100) * window.innerHeight;
  
  const screenCenterX = window.innerWidth / 2;
  const screenCenterY = window.innerHeight / 2;

  // 中心からの距離ベクトル
  const dx = screenCenterX - x;
  const dy = screenCenterY - y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // 理想的な配置範囲の半径
  const idealRadius = Math.min(window.innerWidth, window.innerHeight) * LAYOUT_CONFIG.IDEAL_AREA_RATIO / 2;

  // 理想的な範囲を超えている場合のみ引力を働かせる
  if (distance > idealRadius) {
    const excessDistance = distance - idealRadius;
    const attractionMagnitude = excessDistance * LAYOUT_CONFIG.CENTER_ATTRACTION;
    
    return {
      x: (dx / distance) * attractionMagnitude,
      y: (dy / distance) * attractionMagnitude,
    };
  }

  return { x: 0, y: 0 };
}

/**
 * 全ステッカーが画面内にあるかチェックして修正
 * @returns {Promise<void>}
 */
async function checkAndFixAllOutOfBounds() {
  let outOfBoundsCount = 0;
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const margin = 50; // 50px以上見えていればOK

  for (const sticker of state.stickers) {
    const rect = sticker.element.getBoundingClientRect();
    
    // 画面外判定
    const isOutOfBounds = 
      rect.right < margin ||
      rect.left > screenWidth - margin ||
      rect.bottom < margin ||
      rect.top > screenHeight - margin;
    
    if (isOutOfBounds) {
      // 画面内の安全な位置に移動
      const safeX = Math.max(-screenWidth * 0.4, Math.min(screenWidth * 0.4, sticker.x));
      const safeYPercent = Math.max(10, Math.min(90, sticker.yPercent));
      
      updateStickerPosition(sticker, safeX, safeYPercent);
      outOfBoundsCount++;
    }
  }

  if (outOfBoundsCount > 0) {
    showToast(`${outOfBoundsCount}個のステッカーを画面内に調整しました`);
  }
}

/**
 * 全ステッカーの位置をDBに保存（異常値チェック付き）
 * @returns {Promise<void>}
 */
async function saveAllStickersWithValidation() {
  // 異常な値をチェック・修正
  state.stickers.forEach((sticker) => {
    if (!isFinite(sticker.x) || Math.abs(sticker.x) > 10000) {
      console.error(`保存前に異常な x を検出: ステッカー${sticker.id}, x=${sticker.x}`);
      sticker.x = 0;
    }
    
    if (!isFinite(sticker.yPercent) || Math.abs(sticker.yPercent) > 200) {
      console.error(`保存前に異常な yPercent を検出: ステッカー${sticker.id}, yPercent=${sticker.yPercent}`);
      sticker.yPercent = 50;
    }
  });

  // 共通の保存関数を使用
  await saveAllStickerPositions(state.stickers);
}

