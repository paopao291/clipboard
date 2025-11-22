import { initDB, loadAllStickersFromDB, updateStickerInDB } from "./modules/db.js";
import { PASTE_AREA_CONFIG, STICKER_DEFAULTS, HELP_STICKER_CONFIG } from "./modules/constants.js";
import { state } from "./state.js";
import {
  initElements,
  showHelp,
  hideHelp,
  updateInfoButtonVisibility,
  showInitialHelp,
  restoreHelpSticker,
  elements,
  showToast,
} from "./modules/ui.js";
import { showConfirmDialog } from "./modules/dialog.js";
import {
  handlePaste,
  handleFileSelect,
  handleCanvasMouseDown,
  handleCanvasTouchStart,
  handleMouseMove,
  handleMouseUp,
  handleTouchMove,
  handleTouchEnd,
  handlePasteAreaBlur,
  handlePasteAreaInput,
  handlePasteAreaKeydown,
  handleCanvasWheel,
  handleKeyboardShortcut,
  setAddButtonTriggered,
} from "./modules/events.js";
import { addStickerToDOM, toggleStickerPin, toggleStickerBorder, toggleStickerBgRemoval, sendToBack, copySticker } from "./modules/sticker.js";
import { initPhysicsEngine, enablePhysics, disablePhysics, isPhysicsActive } from "./modules/physics.js";
import { startAutoLayout, isLayoutRunning } from "./modules/layout.js";
import { setBackgroundImage, removeBackgroundImage, restoreBackgroundImage, hasBackgroundImage, initBackgroundDB } from "./modules/background.js";

/**
 * アプリケーションの初期化
 */
async function init() {
  // DOM要素を取得
  initElements();

  // IndexedDBを初期化
  const database = await initDB();
  
  // 背景画像用のDBを初期化
  initBackgroundDB(database);

  // 物理エンジンを初期化
  initPhysicsEngine();

  // コピーしたステッカーデータを明示的に復元（リロード後のペースト対応）
  await state.restoreCopiedStickerData();

  // ペーストイベント（pasteAreaのみにバインド）
  elements.pasteArea.addEventListener("paste", handlePaste);

  // ファイル入力イベント
  elements.galleryInput.addEventListener("change", handleFileSelect);
  elements.cameraInput.addEventListener("change", handleFileSelect);
  elements.backgroundInput.addEventListener("change", handleBackgroundSelect);

  // ペーストエリアのイベント
  elements.pasteArea.addEventListener("blur", handlePasteAreaBlur);
  elements.pasteArea.addEventListener("input", handlePasteAreaInput);
  elements.pasteArea.addEventListener("keydown", handlePasteAreaKeydown);
  
  // モバイルでの長押しペーストを最適化するための設定
  // iOS Safariでの長押しメニュー表示を有効化
  elements.pasteArea.style.webkitUserSelect = "text";
  elements.pasteArea.style.userSelect = "text";
  elements.pasteArea.style.webkitTouchCallout = "default";
  
  // グローバルなキーボードショートカット（コピー＆ペースト）
  document.addEventListener("keydown", handleKeyboardShortcut);

  // ボタンイベント
  elements.backgroundBtn.addEventListener("click", handleBackgroundButton);
  elements.saveBtn.addEventListener("click", handleSaveButton);
  elements.infoBtn.addEventListener("click", showHelp);
  elements.hideUIBtn.addEventListener("click", () => {
    state.hideUI();
    updateInfoButtonVisibility();
  });
  elements.addBtn.addEventListener("click", () => {
    setAddButtonTriggered();
    elements.galleryInput.click();
  });
  
  // 背面に送るボタンイベント
  elements.sendToBackBtn.addEventListener("click", handleSendToBackButton);
  
  // 固定ボタンイベント
  elements.pinBtn.addEventListener("click", handlePinButton);
  
  // 縁取りボタンイベント
  elements.borderBtn.addEventListener("click", handleBorderButton);
  
  // 背景除去ボタンイベント
  elements.bgRemovalBtn.addEventListener("click", handleBgRemovalButton);
  
  // コピーボタンイベント
  elements.copyBtn.addEventListener("click", handleCopyButton);
  
  // 物理モードボタンイベント
  elements.physicsBtn.addEventListener("click", togglePhysicsMode);
  
  // 自動レイアウトボタンイベント
  elements.layoutBtn.addEventListener("click", handleLayoutButton);

  // Escキーでヘルプステッカーを閉じる
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const helpSticker = document.querySelector('.help-sticker');
      if (helpSticker) {
        hideHelp();
      }
    }
  });

  // オーバーレイのクリックで選択解除してUIを表示
  elements.selectionOverlay.addEventListener("click", () => {
    state.deselectAll();
    state.showUI();
    updateInfoButtonVisibility();
  });

  // キャンバスのタッチイベント（スマホでフォーカス）
  elements.canvas.addEventListener("touchstart", handleCanvasTouchStart);

  // キャンバスのクリックイベント（選択解除）
  elements.canvas.addEventListener("mousedown", handleCanvasMouseDown);

  // キャンバスのホイールイベント（選択中のステッカーを拡大縮小）
  elements.canvas.addEventListener("wheel", handleCanvasWheel, {
    passive: false,
  });

  // マウスイベント
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);

  // タッチイベント（passiveをtrueに変更してスクロール最適化を有効に）
  document.addEventListener("touchmove", handleTouchMove, { passive: true });
  document.addEventListener("touchend", handleTouchEnd);

  // IndexedDBから自動読み込み
  await loadStickersFromDB();

  // ヘルプステッカーを復元
  restoreHelpSticker();
  
  // 背景画像を復元
  await restoreBackgroundImage();

  // インフォボタンの初期表示状態を設定
  updateInfoButtonVisibility();

  // 初回訪問時のみヘルプを表示
  showInitialHelp();

  // 初期フォーカス（ペースト可能にするため）
  setTimeout(() => {
    elements.pasteArea.focus();
  }, PASTE_AREA_CONFIG.FOCUS_DELAY_MS);
}

/**
 * IndexedDBからシールを読み込み
 */
async function loadStickersFromDB() {
  const stickers = await loadAllStickersFromDB();
  
  // データ形式の変換が必要かチェック
  const needsConversion = !localStorage.getItem('hybrid_coordinate_migrated');
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  for (const stickerData of stickers) {
    // 画像情報を取得
    const img = new Image();
    const tempBlobUrl = URL.createObjectURL(stickerData.blob);
    const imgLoadPromise = new Promise((resolve) => {
      img.onload = () => {
        URL.revokeObjectURL(tempBlobUrl);
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(tempBlobUrl);
        resolve();
      };
      img.src = tempBlobUrl;
    });
    await imgLoadPromise;
    
    // モードを確認
    const borderMode = stickerData.borderMode !== undefined ? stickerData.borderMode : STICKER_DEFAULTS.BORDER_MODE;
    console.log(`ステッカー${stickerData.id}のリロード: モード${borderMode}の処理を実行`);
    
    // オリジナル画像のURL（元画像を保持）
    const originalBlobUrl = URL.createObjectURL(stickerData.originalBlob || stickerData.blob);
    const originalBlob = stickerData.originalBlob || stickerData.blob;
    
    // モジュールをインポート
    const { calculateBorderWidth, addPaddingToImage, applyOutlineFilter } = await import('./modules/sticker.js');
    
    // 5%相当の幅を計算（モード2）
    const maxBorderWidth = calculateBorderWidth(img.width, img.height, 2);
    
    // 現在のモードの縁取り幅を計算
    const borderWidth = calculateBorderWidth(img.width, img.height, borderMode);
    
    // モードに応じてパディング付き画像と縁取り画像を生成（常に新規生成）
    let paddedBlob, borderBlob, blobUrl, blobWithBorderUrl;
    
    // パディング付き画像を生成（すべてのモードで5%パディング）
    paddedBlob = await addPaddingToImage(originalBlob, maxBorderWidth);
    // 注意: この時点ではimg要素がまだ作成されていないため、後でaddStickerToDOMで関連付ける
    blobUrl = URL.createObjectURL(paddedBlob);
    
    if (borderMode === 0) {
      // モード0: 縁取りなし（blobWithBorderUrlはnull）
      blobWithBorderUrl = null;
    } else if (borderMode === 1) {
      // モード1: 2.5%縁取り + 残りパディング
      const { blob: borderResult } = await applyOutlineFilter(originalBlob, 1);
      // 残りのパディング幅を計算
      const remainingPadding = maxBorderWidth - borderWidth;
      console.log(`モード1: 残りのパディング幅 = ${remainingPadding}px`);
      const paddedBorderBlob = await addPaddingToImage(borderResult, remainingPadding);
      blobWithBorderUrl = URL.createObjectURL(paddedBorderBlob);
    } else {
      // モード2: 5%縁取り
      const { blob: borderResult } = await applyOutlineFilter(originalBlob, 2);
      blobWithBorderUrl = URL.createObjectURL(borderResult);
    }
    
    // 背景除去版のURL作成
    const removedBgBlobUrl = stickerData.removedBgBlob 
      ? URL.createObjectURL(stickerData.removedBgBlob)
      : null;
    const removedBgBlobWithBorderUrl = stickerData.removedBgBlobWithBorder 
      ? URL.createObjectURL(stickerData.removedBgBlobWithBorder)
      : null;
    
    // 状態フラグ（背景除去版が存在しない場合はリセット）
    const hasBorder = stickerData.hasBorder !== undefined ? stickerData.hasBorder : STICKER_DEFAULTS.HAS_BORDER;
    let hasBgRemoved = stickerData.hasBgRemoved || false;
    let bgRemovalProcessed = stickerData.bgRemovalProcessed || false;
    
    // 背景除去版のBlobが存在しない場合は状態をリセット
    if (hasBgRemoved && (!removedBgBlobUrl || !removedBgBlobWithBorderUrl)) {
      console.warn(`ステッカー${stickerData.id}: 背景除去版のBlobが存在しないため状態をリセット`);
      hasBgRemoved = false;
      bgRemovalProcessed = false;
    }
    
    // 現在の表示URLを決定（背景除去状態と縁取り状態の両方を考慮）
    let url;
    if (hasBgRemoved && removedBgBlobUrl && removedBgBlobWithBorderUrl) {
      url = hasBorder ? removedBgBlobWithBorderUrl : removedBgBlobUrl;
    } else {
      // モードに応じた表示URLを決定
      const borderMode = stickerData.borderMode !== undefined ? stickerData.borderMode : STICKER_DEFAULTS.BORDER_MODE;
      console.log(`ステッカー${stickerData.id}のリロード: borderMode=${borderMode}, hasBorder=${hasBorder}`);
      
      if (borderMode === 0 || !hasBorder) {
        // モード0または縁取りOFF: パディング付き画像
        url = blobUrl;
      } else {
        // モード1,2で縁取りON: 縁取り付き画像
        url = blobWithBorderUrl;
      }
    }
    
    let x, yPercent, width;
    
    // X座標の変換（画面中央からのオフセット px）
    if (stickerData.x !== undefined && stickerData.yPercent !== undefined && stickerData.width !== undefined) {
      // 新形式（X:px, Y:%, width:px）
      x = stickerData.x;
      yPercent = stickerData.yPercent;
      width = stickerData.width;
      
      // 異常な値をチェックして修正
      let needsFixing = false;
      
      if (!isFinite(x) || Math.abs(x) > 10000) {
        console.warn(`DBから読み込んだステッカー${stickerData.id}のx座標が異常: ${x} → 0に修正`);
        x = 0;
        needsFixing = true;
      }
      
      if (!isFinite(yPercent) || Math.abs(yPercent) > 200) {
        console.warn(`DBから読み込んだステッカー${stickerData.id}のyPercent座標が異常: ${yPercent} → 50に修正`);
        yPercent = 50;
        needsFixing = true;
      }
      
      if (!isFinite(width) || width < 10 || width > 5000) {
        console.warn(`DBから読み込んだステッカー${stickerData.id}のwidth が異常: ${width} → デフォルトに修正`);
        width = STICKER_DEFAULTS.WIDTH;
        needsFixing = true;
      }
      
      // 修正した場合はDBにも保存
      if (needsFixing) {
        await updateStickerInDB(stickerData.id, { x, yPercent, width });
      }
    } else if (needsConversion) {
      // 旧形式からの変換
      if (stickerData.xPercent !== undefined && stickerData.yPercent !== undefined) {
        // パーセント値形式から変換
        const absoluteX = (stickerData.xPercent / 100) * screenWidth;
        const centerX = screenWidth / 2;
        x = absoluteX - centerX;
        yPercent = stickerData.yPercent;
        
        // サイズの変換
        if (stickerData.widthPercent !== undefined) {
          width = (stickerData.widthPercent / 100) * screenWidth;
        } else if (stickerData.width !== undefined) {
          width = stickerData.width;
        } else {
          width = STICKER_DEFAULTS.WIDTH;
        }
      } else {
        // デフォルト（中央）
        x = 0;
        yPercent = 50;
        width = STICKER_DEFAULTS.WIDTH;
      }
      
      // 変換後のデータをDBに保存
      await updateStickerInDB(stickerData.id, { 
        x, 
        yPercent, 
        width 
      });
    } else {
      // デフォルト
      x = 0;
      yPercent = 50;
      width = STICKER_DEFAULTS.WIDTH;
    }
    
    addStickerToDOM(
      url,
      blobUrl,
      blobWithBorderUrl,
      x,
      yPercent,
      width,
      stickerData.rotation,
      stickerData.id,
      stickerData.zIndex,
      stickerData.isPinned || false,
      hasBorder,
      borderWidth,
      stickerData.borderMode,
      originalBlobUrl, // オリジナル画像URL
      removedBgBlobUrl,
      removedBgBlobWithBorderUrl,
      hasBgRemoved,
      bgRemovalProcessed, // この値が背景除去ボタンの表示/非表示を決定する
      stickerData.removedBgBlob,
      stickerData.removedBgBlobWithBorder,
      originalBlob // オリジナル画像Blob（優先使用）
    );
  }
  
  // 変換完了フラグを保存
  if (needsConversion && stickers.length > 0) {
    localStorage.setItem('hybrid_coordinate_migrated', 'true');
  }
}

/**
 * 物理モードを切り替え
 */
async function togglePhysicsMode() {
  if (isPhysicsActive()) {
    // 物理モード OFF
    await disablePhysics();
    state.disablePhysicsMode();
    elements.physicsBtn.classList.remove("active");
    elements.canvas.classList.remove("physics-mode");
    
    // 選択状態を解除してUIを表示
    state.deselectAll();
    state.showUI();
    
    // pasteAreaを有効化
    elements.pasteArea.disabled = false;
  } else {
    // 物理モード ON
    enablePhysics();
    state.enablePhysicsMode();
    elements.physicsBtn.classList.add("active");
    elements.canvas.classList.add("physics-mode");
    
    // 選択状態を解除してUIを表示
    state.deselectAll();
    state.showUI();
    
    // pasteAreaを無効化（画像追加不可）
    elements.pasteArea.disabled = true;
    elements.pasteArea.blur(); // フォーカスを外す
  }
  
  // ボタンの表示状態を更新
  updateInfoButtonVisibility();
}

/**
 * 保存時の設定
 */
const SAVE_CONFIG = {
  SCALE_WITH_BG: 3,              // 背景画像がある場合のscale
  SCALE_WITHOUT_BG_MULTIPLIER: 2, // 背景画像がない場合のscale倍率
  DOT_SIZE_MULTIPLIER: 2,        // ドットサイズの倍率
  DOT_SPACING: 24,               // ドット間隔（px）
  DOT_COLOR: 'rgba(0, 0, 0, 0.15)', // ドットの色
  BG_COLOR: '#f7f7f4',           // 背景色（--color-bg-main）
};

/**
 * UI要素を一時的に非表示にする
 * @returns {Array} 元の表示状態を保存した配列
 */
function hideUIElements() {
  const uiElements = [
    elements.headerButtons,
    elements.footerButtons,
    elements.addBtn,
    elements.trashBtn,
    elements.selectionButtons,
    elements.selectionOverlay,
  ];
  
  const originalDisplay = [];
  uiElements.forEach((el) => {
    if (el) {
      originalDisplay.push({ element: el, display: el.style.display });
      el.style.display = 'none';
    }
  });
  
  return originalDisplay;
}

/**
 * UI要素を元の表示状態に戻す
 * @param {Array} originalDisplay - 元の表示状態の配列
 */
function restoreUIElements(originalDisplay) {
  originalDisplay.forEach(({ element, display }) => {
    element.style.display = display;
  });
}

/**
 * html2canvasのoncloneコールバックでUI要素を非表示にする
 * @param {Document} clonedDoc - クローンされたドキュメント
 */
function hideUIElementsInClone(clonedDoc) {
  const clonedUIElements = [
    clonedDoc.querySelector('.header-buttons'),
    clonedDoc.querySelector('.footer-buttons'),
    clonedDoc.querySelector('.add-btn'),
    clonedDoc.querySelector('.trash-btn'),
    clonedDoc.querySelector('.selection-buttons'),
    clonedDoc.querySelector('.selection-overlay'),
  ];
  clonedUIElements.forEach((el) => {
    if (el) el.style.display = 'none';
  });
}

/**
 * 背景画像をCanvasに描画する
 * @param {CanvasRenderingContext2D} ctx - Canvasコンテキスト
 * @param {HTMLCanvasElement} canvas - Canvas要素
 * @returns {Promise<void>}
 */
async function drawBackgroundImage(ctx, canvas) {
  const bgImageUrl = document.body.style.backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
  if (!bgImageUrl || !bgImageUrl[1]) {
    return;
  }
  
  const bgImage = new Image();
  const url = bgImageUrl[1];
  
  // blob: URLの場合はcrossOriginを設定しない
  if (!url.startsWith('blob:')) {
    bgImage.crossOrigin = 'anonymous';
  }
  
  await new Promise((resolve, reject) => {
    bgImage.onload = resolve;
    bgImage.onerror = reject;
    bgImage.src = url;
  });
  
  // 背景画像をcoverで描画
  const imgAspect = bgImage.width / bgImage.height;
  const canvasAspect = canvas.width / canvas.height;
  let drawWidth, drawHeight, drawX, drawY;
  
  if (imgAspect > canvasAspect) {
    // 画像が横長
    drawHeight = canvas.height;
    drawWidth = drawHeight * imgAspect;
    drawX = (canvas.width - drawWidth) / 2;
    drawY = 0;
  } else {
    // 画像が縦長
    drawWidth = canvas.width;
    drawHeight = drawWidth / imgAspect;
    drawX = 0;
    drawY = (canvas.height - drawHeight) / 2;
  }
  
  ctx.drawImage(bgImage, drawX, drawY, drawWidth, drawHeight);
}

/**
 * ドットパターンをCanvasに描画する
 * @param {CanvasRenderingContext2D} ctx - Canvasコンテキスト
 * @param {HTMLCanvasElement} canvas - Canvas要素
 * @param {number} scale - スケール値
 */
function drawDotPattern(ctx, canvas, scale) {
  // クリーム色の背景を描画
  ctx.fillStyle = SAVE_CONFIG.BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // ドットパターンを描画
  // CSS: radial-gradient(circle, rgba(0, 0, 0, 0.15) 1px, transparent 1px)
  // CSS: background-size: 24px 24px
  const dotRadius = 0.5 * scale; // 1pxのドットの半径（0.5px）をscale倍
  const spacing = SAVE_CONFIG.DOT_SPACING * scale; // 24px間隔をscale倍
  
  ctx.fillStyle = SAVE_CONFIG.DOT_COLOR;
  for (let x = 0; x < canvas.width; x += spacing) {
    for (let y = 0; y < canvas.height; y += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, dotRadius * SAVE_CONFIG.DOT_SIZE_MULTIPLIER, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Canvasを画像ファイルとしてダウンロードする
 * @param {HTMLCanvasElement} canvas - Canvas要素
 */
function downloadCanvasAsImage(canvas) {
  canvas.toBlob((blob) => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sticker-album-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast('画像を保存しました');
    } else {
      showToast('保存に失敗しました');
    }
  }, 'image/png');
}

/**
 * 保存ボタンハンドラ（画像として保存）
 */
async function handleSaveButton() {
  try {
    // UI要素を一時的に非表示
    const originalDisplay = hideUIElements();
    
    // 背景画像があるか確認
    const hasBgImage = document.body.classList.contains('has-background-image');
    
    // 高解像度対応：scaleを設定
    const scale = hasBgImage
      ? SAVE_CONFIG.SCALE_WITH_BG
      : (window.devicePixelRatio || 1) * SAVE_CONFIG.SCALE_WITHOUT_BG_MULTIPLIER;
    
    // 画面サイズを取得
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // 最終的なCanvasを作成
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = screenWidth * scale;
    finalCanvas.height = screenHeight * scale;
    const finalCtx = finalCanvas.getContext('2d');
    
    // 背景を描画
    if (hasBgImage) {
      await drawBackgroundImage(finalCtx, finalCanvas);
    } else {
      drawDotPattern(finalCtx, finalCanvas, scale);
    }
    
    // html2canvasで#app要素だけを画像化（背景は含めない）
    const html2canvasResult = await html2canvas(document.getElementById('app'), {
      backgroundColor: null,
      useCORS: true,
      scale: scale,
      logging: false,
      allowTaint: true,
      width: screenWidth,
      height: screenHeight,
      onclone: hideUIElementsInClone,
    });
    
    // UI要素を元に戻す
    restoreUIElements(originalDisplay);
    
    // html2canvasの結果を背景の上に描画（シールがドット/背景画像の上に来るように）
    finalCtx.drawImage(html2canvasResult, 0, 0);
    
    // Canvasを画像ファイルとしてダウンロード
    downloadCanvasAsImage(finalCanvas);
  } catch (error) {
    console.error('画像保存エラー:', error);
    showToast('保存に失敗しました');
  }
}

/**
 * 背景画像ボタンハンドラ
 */
function handleBackgroundButton() {
  // 背景画像がある場合は削除、ない場合はアップロード
  if (hasBackgroundImage()) {
    removeBackgroundImage();
  } else {
    elements.backgroundInput.click();
  }
}

/**
 * 背景画像選択ハンドラ
 * @param {Event} e
 */
async function handleBackgroundSelect(e) {
  const file = e.target.files[0];
  
  if (!file) return;
  
  // 画像リサイズ処理を追加
  const optimizedImage = await optimizeBackgroundImage(file);
  
  await setBackgroundImage(optimizedImage);
  
  // 入力をリセット
  e.target.value = "";
}

/**
 * 背景画像を最適なサイズに調整
 * @param {File} imageFile - 元の画像ファイル
 * @returns {Promise<Blob>} 最適化された画像
 */
async function optimizeBackgroundImage(imageFile) {
  // 画面サイズの取得
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  
  // 最大解像度の設定（デバイスピクセル比を考慮）
  const devicePixelRatio = window.devicePixelRatio || 1;
  const maxWidth = screenWidth * devicePixelRatio * 1.5;  // 余裕を持たせる
  const maxHeight = screenHeight * devicePixelRatio * 1.5;
  
  // 画像ファイルのBlobをImageオブジェクトに変換
  const imageUrl = URL.createObjectURL(imageFile);
  const img = new Image();
  
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageUrl;
    });
    
    // 元の画像サイズを取得
    const originalWidth = img.width;
    const originalHeight = img.height;
    
    // リサイズが必要かチェック
    if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
      console.log('背景画像: リサイズ不要（元サイズ使用）');
      return imageFile; // リサイズ不要
    }
    
    // アスペクト比を維持してリサイズ
    let newWidth, newHeight;
    if (originalWidth / originalHeight > maxWidth / maxHeight) {
      // 横長画像
      newWidth = maxWidth;
      newHeight = (originalHeight * maxWidth) / originalWidth;
    } else {
      // 縦長画像
      newHeight = maxHeight;
      newWidth = (originalWidth * maxHeight) / originalHeight;
    }
    
    // Canvas使ってリサイズ
    const canvas = document.createElement('canvas');
    canvas.width = newWidth;
    canvas.height = newHeight;
    const ctx = canvas.getContext('2d');
    
    // 画質を維持するための設定
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, newWidth, newHeight);
    
    // Canvasからリサイズ画像を取得
    const resizedImageBlob = await new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), imageFile.type, 0.92);
    });
    
    console.log(`背景画像: リサイズ完了 (${originalWidth}x${originalHeight} → ${newWidth}x${newHeight})`);
    return resizedImageBlob;
  } catch (error) {
    console.error('背景画像のリサイズに失敗:', error);
    return imageFile; // エラー時は元の画像を返す
  } finally {
    // リソース解放
    URL.revokeObjectURL(imageUrl);
  }
}

/**
 * 背面に送るボタンハンドラ
 */
async function handleSendToBackButton() {
  if (!state.selectedSticker) return;
  
  await sendToBack(state.selectedSticker);
  // 選択を解除してUIを表示
  state.deselectAll();
  state.showUI();
  updateInfoButtonVisibility();
}

/**
 * 固定ボタンハンドラ
 */
async function handlePinButton() {
  if (!state.selectedSticker) return;
  
  await toggleStickerPin(state.selectedSticker);
  // 固定ボタンの状態を更新
  updateInfoButtonVisibility();
}

/**
 * 縁取りボタンハンドラ
 */
async function handleBorderButton() {
  if (!state.selectedSticker) return;
  
  await toggleStickerBorder(state.selectedSticker);
  // 縁取りボタンの状態を更新
  updateInfoButtonVisibility();
}

/**
 * 背景除去ボタンハンドラ
 */
async function handleBgRemovalButton() {
  if (!state.selectedSticker) return;
  
  // ステッカーの参照を保持
  const targetSticker = state.selectedSticker;

  // 確認ダイアログを表示
  showConfirmDialog(
    '背景除去処理を行いますか？<br>この操作は元に戻せません。',
    '実行',
    async () => {
      // 選択状態を解除（ステッカーのselectedクラスを削除）
      targetSticker.element.classList.remove("selected");
      state.selectedSticker = null;
      
      // 選択オーバーレイを非表示に
      elements.selectionOverlay.classList.remove("visible");
      
      // 選択時のUIのみを非表示に
      elements.selectionButtons.classList.add("hidden");
      elements.trashBtn.classList.add("hidden");
      
      // 通常のUIを表示（右上、左下、右下のボタンなど）
      elements.headerButtons.classList.remove("hidden");
      elements.footerButtons.classList.remove("hidden");
      elements.addBtn.classList.remove("hidden");
      
      // 背景除去処理を実行（一方通行の処理）
      await toggleStickerBgRemoval(targetSticker);
      
      // ボタンの表示状態を再更新
      updateInfoButtonVisibility();
    }
  );
}

/**
 * コピーボタンハンドラ
 */
async function handleCopyButton() {
  if (!state.selectedSticker) return;
  
  await copySticker(state.selectedSticker);
}

/**
 * 自動レイアウトボタンハンドラ
 */
async function handleLayoutButton() {
  // 既に実行中なら何もしない
  if (isLayoutRunning()) {
    return;
  }

  // ステッカーが2個未満なら何もしない
  if (state.getStickerCount() < 2) {
    return;
  }

  // 物理モードが有効な場合は無効化
  if (isPhysicsActive()) {
    disablePhysics();
    state.disablePhysicsMode();
    elements.physicsBtn.classList.remove("active");
    elements.canvas.classList.remove("physics-mode");
  }

  // 選択状態を解除してUIを表示
  state.deselectAll();
  state.showUI();
  updateInfoButtonVisibility();

  // ボタンをアクティブ状態に
  elements.layoutBtn.classList.add("active");
  elements.layoutBtn.disabled = true;

  try {
    // 自動レイアウトを実行
    await startAutoLayout();
  } finally {
    // ボタンを元の状態に戻す
    elements.layoutBtn.classList.remove("active");
    elements.layoutBtn.disabled = false;
  }
}

// 初期化実行
init();
