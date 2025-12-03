import html2canvas from "html2canvas";
import state from "../modules/state.js";

const SAVE_CONFIG = {
  SCALE_WITH_BG: 3, // 背景画像がある場合のscale
  SCALE_WITHOUT_BG_MULTIPLIER: 2, // 背景画像がない場合のscale倍率
  DOT_SIZE_MULTIPLIER: 2, // ドットサイズの倍率
  DOT_SPACING: 24, // ドット間隔（px）
  DOT_COLOR: "rgba(0, 0, 0, 0.15)", // ドットの色
  BG_COLOR: "#f7f7f4", // 背景色（--color-bg-main）
};

/**
 * UI要素を一時的に非表示にする
 * @returns {Array} 元の表示状態を保存した配列
 */
function hideUIElements() {
  const uiElements = [
    document.getElementById("hidden-file-input"),
    document.getElementById("btn-container"),
    document.getElementById("footer"),
  ];

  return uiElements.map((el) => {
    if (!el) return null;
    const originalDisplay = el.style.display;
    el.style.display = "none";
    return { element: el, originalDisplay };
  });
}

/**
 * UI要素を元の表示状態に戻す
 * @param {Array} hiddenElements 元の表示状態を保存した配列
 */
function restoreUIElements(hiddenElements) {
  hiddenElements.forEach((item) => {
    if (item && item.element) {
      item.element.style.display = item.originalDisplay;
    }
  });
}

/**
 * html2canvasのクローン処理後にUI要素を非表示にする
 * @param {HTMLElement} clone クローンされたDOM要素
 */
function hideUIElementsInClone(clone) {
  const elementsToHide = [
    clone.querySelector("#hidden-file-input"),
    clone.querySelector("#btn-container"),
    clone.querySelector("#footer"),
  ];

  elementsToHide.forEach((el) => {
    if (el) el.style.display = "none";
  });
}

/**
 * 背景画像をcanvasに描画する
 * @param {CanvasRenderingContext2D} ctx Canvasのコンテキスト
 * @param {HTMLImageElement} bgImage 背景画像要素
 * @param {number} scale スケール倍率
 */
function drawBackgroundImage(ctx, bgImage, scale) {
  const bgWidth = bgImage.naturalWidth * scale;
  const bgHeight = bgImage.naturalHeight * scale;
  ctx.drawImage(bgImage, 0, 0, bgWidth, bgHeight);
}

/**
 * ドットパターンをcanvasに描画する
 * @param {CanvasRenderingContext2D} ctx Canvasのコンテキスト
 * @param {number} canvasWidth キャンバスの幅
 * @param {number} canvasHeight キャンバスの高さ
 * @param {number} scale スケール倍率
 */
function drawDotPattern(ctx, canvasWidth, canvasHeight, scale) {
  ctx.fillStyle = SAVE_CONFIG.BG_COLOR;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // ドットパターンを描画
  const spacing = SAVE_CONFIG.DOT_SPACING * scale; // 24px間隔をscale倍
  const dotRadius = scale;
  ctx.fillStyle = SAVE_CONFIG.DOT_COLOR;

  for (let x = 0; x < canvasWidth; x += spacing) {
    for (let y = 0; y < canvasHeight; y += spacing) {
      ctx.beginPath();
      ctx.arc(
        x,
        y,
        dotRadius * SAVE_CONFIG.DOT_SIZE_MULTIPLIER,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }
}

/**
 * canvasを画像としてダウンロードする
 * @param {HTMLCanvasElement} canvas ダウンロードするcanvas
 */
function downloadCanvasAsImage(canvas) {
  const link = document.createElement("a");
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "_");
  link.download = `capture_${timestamp}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

/**
 * 保存ボタンのクリック処理
 */
export async function handleSaveButton() {
  const bgImage = document.getElementById("bg-image");
  const hasBgImage = bgImage && bgImage.src && bgImage.style.opacity === "1";

  // UI要素を一時的に非表示
  const hiddenElements = hideUIElements();

  try {
    const scale = hasBgImage
      ? SAVE_CONFIG.SCALE_WITH_BG
      : window.devicePixelRatio * SAVE_CONFIG.SCALE_WITHOUT_BG_MULTIPLIER;

    const canvasResult = await html2canvas(document.body, {
      scale: scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: null,
      onclone: (clonedDoc) => {
        hideUIElementsInClone(clonedDoc.body);
      },
    });

    const ctx = canvasResult.getContext("2d");

    // 背景画像がある場合は背景を描画
    if (hasBgImage) {
      // 既存のcanvas内容を一時保存
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvasResult.width;
      tempCanvas.height = canvasResult.height;
      const tempCtx = tempCanvas.getContext("2d");
      tempCtx.drawImage(canvasResult, 0, 0);

      // 背景画像を描画
      drawBackgroundImage(ctx, bgImage, scale);

      // 元のcanvas内容を上に重ねる
      ctx.drawImage(tempCanvas, 0, 0);
    } else {
      // 背景画像がない場合はドットパターンを描画
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvasResult.width;
      tempCanvas.height = canvasResult.height;
      const tempCtx = tempCanvas.getContext("2d");
      tempCtx.drawImage(canvasResult, 0, 0);

      drawDotPattern(ctx, canvasResult.width, canvasResult.height, scale);
      ctx.drawImage(tempCanvas, 0, 0);
    }

    // ダウンロード
    downloadCanvasAsImage(canvasResult);
  } catch (error) {
    console.error("Error capturing canvas:", error);
  } finally {
    // UI要素を元に戻す
    restoreUIElements(hiddenElements);
  }
}
