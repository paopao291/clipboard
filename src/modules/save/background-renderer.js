/**
 * 背景描画モジュール
 * 背景画像またはドットパターンをCanvasに描画
 */

// 背景描画の設定
const BACKGROUND_CONFIG = {
  DOT_RADIUS_BASE: 0.5, // ドットの基本半径（px）
  DOT_SIZE_MULTIPLIER: 2, // ドットサイズの倍率
  DOT_SPACING: 24, // ドット間隔（px）
  DOT_COLOR: "rgba(0, 0, 0, 0.15)", // ドットの色
  BG_COLOR: "#f7f7f4", // 背景色（--color-bg-main）
};

/**
 * 背景画像をCanvasに描画する（CSS background-size: cover と同じ動作）
 * @param {CanvasRenderingContext2D} ctx - Canvasコンテキスト
 * @param {HTMLCanvasElement} canvas - Canvas要素
 * @returns {Promise<void>}
 */
export async function drawBackgroundImage(ctx, canvas) {
  const bgImageUrl = extractBackgroundImageUrl();
  if (!bgImageUrl) {
    return;
  }

  const bgImage = await loadImage(bgImageUrl);
  const drawParams = calculateCoverDrawParams(bgImage, canvas);

  ctx.drawImage(
    bgImage,
    drawParams.x,
    drawParams.y,
    drawParams.width,
    drawParams.height,
  );
}

/**
 * ドットパターンをCanvasに描画する
 * @param {CanvasRenderingContext2D} ctx - Canvasコンテキスト
 * @param {HTMLCanvasElement} canvas - Canvas要素
 * @param {number} scale - スケール値
 */
export function drawDotPattern(ctx, canvas, scale) {
  // 背景色を塗りつぶし
  ctx.fillStyle = BACKGROUND_CONFIG.BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ドットパターンを描画
  const dotRadius =
    BACKGROUND_CONFIG.DOT_RADIUS_BASE *
    scale *
    BACKGROUND_CONFIG.DOT_SIZE_MULTIPLIER;
  const spacing = BACKGROUND_CONFIG.DOT_SPACING * scale;

  ctx.fillStyle = BACKGROUND_CONFIG.DOT_COLOR;
  for (let x = 0; x < canvas.width; x += spacing) {
    for (let y = 0; y < canvas.height; y += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * document.bodyのbackground-imageからURLを抽出
 * @returns {string|null} 背景画像のURL、または null
 */
function extractBackgroundImageUrl() {
  const bgImageStyle = document.body.style.backgroundImage;
  const match = bgImageStyle.match(/url\(['"]?([^'"]+)['"]?\)/);
  return match ? match[1] : null;
}

/**
 * 画像を読み込む
 * @param {string} url - 画像URL
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    // blob: URLの場合はcrossOriginを設定しない
    if (!url.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * background-size: cover の描画パラメータを計算
 * @param {HTMLImageElement} image - 画像
 * @param {HTMLCanvasElement} canvas - Canvas
 * @returns {{x: number, y: number, width: number, height: number}}
 */
function calculateCoverDrawParams(image, canvas) {
  const imgAspect = image.width / image.height;
  const canvasAspect = canvas.width / canvas.height;

  let drawWidth, drawHeight, drawX, drawY;

  if (imgAspect > canvasAspect) {
    // 画像が横長：高さに合わせる
    drawHeight = canvas.height;
    drawWidth = drawHeight * imgAspect;
    drawX = (canvas.width - drawWidth) / 2;
    drawY = 0;
  } else {
    // 画像が縦長：幅に合わせる
    drawWidth = canvas.width;
    drawHeight = drawWidth / imgAspect;
    drawX = 0;
    drawY = (canvas.height - drawHeight) / 2;
  }

  return {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight,
  };
}
