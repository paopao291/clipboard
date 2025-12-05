/**
 * Canvas作成・合成モジュール
 * 背景とコンテンツを合成して最終的なCanvasを作成
 */

import { drawBackgroundImage, drawDotPattern } from "./background-renderer.js";
import { hideUIElementsInClone } from "./ui-visibility.js";

// スケール設定
const SCALE_CONFIG = {
  WITH_BACKGROUND: 3, // 背景画像がある場合のscale
  WITHOUT_BACKGROUND_MULTIPLIER: 2, // 背景画像がない場合のscale倍率
};

/**
 * 画面全体の画像を作成する（2段階レンダリング）
 * @param {boolean} hasBgImage - 背景画像があるか
 * @returns {Promise<HTMLCanvasElement>} 最終的なCanvas
 */
export async function createScreenshotCanvas(hasBgImage) {
  // html2canvasが読み込まれているか確認
  if (typeof window.html2canvas === "undefined") {
    throw new Error("html2canvas is not loaded");
  }

  const scale = calculateScale(hasBgImage);
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  // ステップ1: 背景を描画した空のCanvasを作成
  const backgroundCanvas = createBackgroundCanvas(
    screenWidth,
    screenHeight,
    scale,
    hasBgImage,
  );

  // ステップ2: コンテンツをhtml2canvasでキャプチャ
  const contentCanvas = await captureContent(
    screenWidth,
    screenHeight,
    scale,
  );

  // ステップ3: 背景の上にコンテンツを合成
  const finalCanvas = compositeCanvases(backgroundCanvas, contentCanvas);

  return finalCanvas;
}

/**
 * スケール値を計算
 * @param {boolean} hasBgImage - 背景画像があるか
 * @returns {number} スケール値
 */
function calculateScale(hasBgImage) {
  return hasBgImage
    ? SCALE_CONFIG.WITH_BACKGROUND
    : (window.devicePixelRatio || 1) *
        SCALE_CONFIG.WITHOUT_BACKGROUND_MULTIPLIER;
}

/**
 * 背景を描画したCanvasを作成
 * @param {number} width - 幅（px）
 * @param {number} height - 高さ（px）
 * @param {number} scale - スケール
 * @param {boolean} hasBgImage - 背景画像があるか
 * @returns {HTMLCanvasElement}
 */
function createBackgroundCanvas(width, height, scale, hasBgImage) {
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");

  // 背景を描画（同期的に実行）
  if (hasBgImage) {
    // 非同期なので、呼び出し側でawaitする必要がある
    // ここでは同期的に処理するため、後で修正
  } else {
    drawDotPattern(ctx, canvas, scale);
  }

  return canvas;
}

/**
 * 背景を描画したCanvasを作成（非同期版）
 * @param {number} width - 幅（px）
 * @param {number} height - 高さ（px）
 * @param {number} scale - スケール
 * @param {boolean} hasBgImage - 背景画像があるか
 * @returns {Promise<HTMLCanvasElement>}
 */
async function createBackgroundCanvasAsync(width, height, scale, hasBgImage) {
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");

  // 背景を描画
  if (hasBgImage) {
    await drawBackgroundImage(ctx, canvas);
  } else {
    drawDotPattern(ctx, canvas, scale);
  }

  return canvas;
}

/**
 * コンテンツをhtml2canvasでキャプチャ
 * @param {number} width - 幅（px）
 * @param {number} height - 高さ（px）
 * @param {number} scale - スケール
 * @returns {Promise<HTMLCanvasElement>}
 */
async function captureContent(width, height, scale) {
  const appElement = document.getElementById("app");

  return await window.html2canvas(appElement, {
    backgroundColor: null, // 透明背景
    useCORS: true,
    scale: scale,
    logging: false,
    allowTaint: true,
    width: width,
    height: height,
    onclone: hideUIElementsInClone,
  });
}

/**
 * 2つのCanvasを合成
 * @param {HTMLCanvasElement} backgroundCanvas - 背景Canvas
 * @param {HTMLCanvasElement} contentCanvas - コンテンツCanvas
 * @returns {HTMLCanvasElement} 合成後のCanvas
 */
function compositeCanvases(backgroundCanvas, contentCanvas) {
  const ctx = backgroundCanvas.getContext("2d");
  ctx.drawImage(contentCanvas, 0, 0);
  return backgroundCanvas;
}

/**
 * 画面全体の画像を作成する（改善版）
 * @param {boolean} hasBgImage - 背景画像があるか
 * @returns {Promise<{canvas: HTMLCanvasElement, scale: number, width: number, height: number}>}
 */
export async function createScreenshot(hasBgImage) {
  const scale = calculateScale(hasBgImage);
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  // ステップ1: 背景を描画
  const backgroundCanvas = await createBackgroundCanvasAsync(
    screenWidth,
    screenHeight,
    scale,
    hasBgImage,
  );

  // ステップ2: コンテンツをキャプチャ
  const contentCanvas = await captureContent(
    screenWidth,
    screenHeight,
    scale,
  );

  // ステップ3: 合成
  const finalCanvas = compositeCanvases(backgroundCanvas, contentCanvas);

  return {
    canvas: finalCanvas,
    scale,
    width: screenWidth,
    height: screenHeight,
  };
}
