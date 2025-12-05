/**
 * 保存機能のメインハンドラ
 * 各モジュールをオーケストレートして画像保存を実行
 */

import { logger } from "../utils/logger.js";
import {
  hideUIElements,
  restoreUIElements,
} from "../modules/save/ui-visibility.js";
import { createScreenshot } from "../modules/save/canvas-creator.js";
import { downloadCanvas } from "../modules/save/file-downloader.js";

/**
 * 保存ボタンのクリック処理
 * @returns {Promise<void>}
 */
export async function handleSaveButton() {
  // html2canvasが読み込まれているか確認
  if (typeof window.html2canvas === "undefined") {
    logger.error("html2canvas is not loaded");
    alert(
      "画像保存機能の読み込みに失敗しました。ページを再読み込みしてください。",
    );
    return;
  }

  try {
    // UI要素を一時的に非表示
    const hiddenUIElements = hideUIElements();

    // 背景画像の有無を確認
    const hasBgImage = document.body.classList.contains("has-background-image");

    logger.log("保存開始:", {
      hasBgImage,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
    });

    // スクリーンショットを作成（2段階レンダリング）
    const screenshot = await createScreenshot(hasBgImage);

    logger.log("スクリーンショット作成完了:", {
      width: screenshot.canvas.width,
      height: screenshot.canvas.height,
      scale: screenshot.scale,
    });

    // UI要素を元に戻す
    restoreUIElements(hiddenUIElements);

    // ダウンロード
    downloadCanvas(screenshot.canvas, "capture", "png");

    logger.log("保存完了");
  } catch (error) {
    logger.error("画像保存エラー:", error);
    alert("画像の保存中にエラーが発生しました。");
  }
}
