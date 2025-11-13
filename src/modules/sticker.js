import { state } from "../state.js";
import { STICKER_DEFAULTS, HELP_STICKER_CONFIG } from "./constants.js";
import {
  saveStickerToDB,
  updateStickerInDB,
  deleteStickerFromDB,
} from "./db.js";
import { elements, showToast, updateInfoButtonVisibility, updateHelpStickerState, clearHelpStickerState } from "./ui.js";
import { attachStickerEventListeners } from "./events.js";
import { isPhysicsActive, addPhysicsBody, removePhysicsBody } from "./physics.js";

/**
 * SVGフィルターを適用した画像を生成（8方向drop-shadow方式：高速・確実）
 * @param {Blob} blob - 元の画像blob
 * @returns {Promise<Blob>} 縁取りが焼き込まれたblob
 */
async function applyOutlineFilter(blob) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        // 縁取りの太さ
        const borderWidth = 12;
        const padding = borderWidth + 2; // 余白
        
        // 縁取り用のCanvas（余白を含む）
        const canvas = document.createElement('canvas');
        canvas.width = img.width + padding * 2;
        canvas.height = img.height + padding * 2;
        const ctx = canvas.getContext('2d');
        
        // 背景を透明にする
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 8方向に白い影を描画して縁取りを作成
        // 各方向に影を重ねることで均一な縁取りを実現
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = borderWidth;
        
        // 8方向に影を描画
        const offsets = [
          { x: -borderWidth, y: 0 },      // 左
          { x: borderWidth, y: 0 },       // 右
          { x: 0, y: -borderWidth },      // 上
          { x: 0, y: borderWidth },       // 下
          { x: -borderWidth, y: -borderWidth }, // 左上
          { x: borderWidth, y: -borderWidth },   // 右上
          { x: -borderWidth, y: borderWidth },   // 左下
          { x: borderWidth, y: borderWidth },    // 右下
        ];
        
        // 各方向に影を描画
        for (const offset of offsets) {
          ctx.shadowOffsetX = offset.x;
          ctx.shadowOffsetY = offset.y;
          ctx.drawImage(img, padding, padding);
        }
        
        // 元の画像を上に描画（影なし）
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.drawImage(img, padding, padding);
        
        // PNGとして保存（透過を保持）
        // ドロップシャドウはCSSで適用されるため、画像には焼き込まない
        canvas.toBlob((filteredBlob) => {
          if (filteredBlob) {
            resolve(filteredBlob);
          } else {
            console.warn('縁取り画像生成失敗、元の画像を使用');
            resolve(blob);
          }
        }, 'image/png');
      } catch (error) {
        console.warn('縁取り画像生成エラー:', error);
        resolve(blob);
      }
    };
    
    img.onerror = () => {
      console.warn('画像読み込み失敗、元の画像を使用');
      resolve(blob);
    };
    
    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Blobを適切なサイズにリサイズ（Safari最適化）
 * @param {Blob} blob - 元の画像blob
 * @param {number} maxSize - 長辺の最大サイズ（px）
 * @returns {Promise<Blob>} リサイズ済みのblob
 */
async function resizeImageBlob(blob, maxSize = 1200) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // 縦横比を維持してリサイズ
      let width = img.width;
      let height = img.height;
      
      // 既に小さい画像はそのまま返す
      if (width <= maxSize && height <= maxSize) {
        resolve(blob);
        return;
      }
      
      // 長辺をmaxSizeに合わせる
      if (width > height) {
        height = (height / width) * maxSize;
        width = maxSize;
      } else {
        width = (width / height) * maxSize;
        height = maxSize;
      }
      
      // Canvasでリサイズ
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      // 高品質なリサイズ設定
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // 元の画像フォーマットを判定
      const mimeType = blob.type || 'image/png';
      const isPNG = mimeType === 'image/png';
      const quality = isPNG ? 1.0 : 0.9; // PNGは品質指定不要、JPEGは90%
      
      // Blobに変換（元のフォーマットを維持）
      canvas.toBlob((resizedBlob) => {
        if (resizedBlob) {
          console.log(`画像リサイズ: ${img.width}x${img.height} → ${width}x${height} (${mimeType})`);
          resolve(resizedBlob);
        } else {
          console.warn('リサイズ失敗、元の画像を使用');
          resolve(blob);
        }
      }, mimeType, quality);
    };
    
    img.onerror = () => {
      console.warn('画像読み込み失敗、元の画像を使用');
      resolve(blob);
    };
    
    img.src = URL.createObjectURL(blob);
  });
}

/**
 * 画像をリサイズし、縁取りあり版も生成
 * @param {Blob} blob - 元の画像blob
 * @param {number} maxSize - 長辺の最大サイズ（px）
 * @returns {Promise<{blob: Blob, blobWithBorder: Blob}>} 縁取りなし版と縁取りあり版
 */
async function resizeImageBlobWithBorder(blob, maxSize = 1200) {
  // まずリサイズ
  const resizedBlob = await resizeImageBlob(blob, maxSize);
  
  // 縁取りあり版を生成
  const blobWithBorder = await applyOutlineFilter(resizedBlob);
  
  return {
    blob: resizedBlob,
    blobWithBorder: blobWithBorder
  };
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
 * ステッカーのscaleを計算
 * @param {Object} sticker - シールオブジェクト
 * @returns {number} scale値
 */
function calculateScale(sticker) {
  return sticker.width / getBaseWidth(sticker);
}

/**
 * ステッカーのサイズ制限設定を取得
 * @param {Object} sticker - シールオブジェクト
 * @returns {Object} {minWidth, maxWidth}
 */
function getSizeConstraints(sticker) {
  if (sticker.isHelpSticker) {
    const isMobile = window.innerWidth <= 768;
    const maxWidth = isMobile 
      ? Math.min(HELP_STICKER_CONFIG.MAX_WIDTH_DESKTOP, window.innerWidth * HELP_STICKER_CONFIG.MAX_WIDTH_MOBILE_PERCENT / 100)
      : HELP_STICKER_CONFIG.MAX_WIDTH_DESKTOP;
    return {
      minWidth: HELP_STICKER_CONFIG.MIN_WIDTH,
      maxWidth: maxWidth,
    };
  } else {
    const maxWidthByScreen = (window.innerWidth * STICKER_DEFAULTS.MAX_WIDTH_PERCENT) / 100;
    return {
      minWidth: STICKER_DEFAULTS.MIN_WIDTH,
      maxWidth: Math.min(STICKER_DEFAULTS.MAX_WIDTH, maxWidthByScreen),
    };
  }
}

/**
 * ステッカーのtransformを適用（回転とスケール）
 * @param {Object} sticker - シールオブジェクト
 */
function applyStickerTransform(sticker) {
  if (sticker.imgWrapper) {
    const scale = calculateScale(sticker);
    sticker.imgWrapper.style.transform = `rotate(${sticker.rotation}deg) scale(${scale})`;
  }
}

/**
 * Blobからシールを追加
 * @param {Blob} blob - 画像Blob
 * @param {number} x - 画面中央からのX座標オフセット（px）
 * @param {number} yPercent - 画面高さに対するY座標の割合（0-100）
 * @param {number} width - 幅（px）
 * @param {number} rotation - 回転角度
 * @param {number|null} id - シールID
 * @param {number|null} zIndex - z-index
 * @param {boolean} hasBorder - 縁取りあり
 */
export async function addStickerFromBlob(
  blob,
  x,
  yPercent,
  width = STICKER_DEFAULTS.WIDTH,
  rotation = STICKER_DEFAULTS.ROTATION,
  id = null,
  zIndex = null,
  hasBorder = STICKER_DEFAULTS.HAS_BORDER,
) {
  // まずリサイズだけ実行（高速）
  const resizedBlob = await resizeImageBlob(blob, 1200);
  
  const stickerId = id || Date.now();
  
  // まず縁取りなし版で表示（即座に表示）
  const blobUrl = URL.createObjectURL(resizedBlob);
  const url = hasBorder ? blobUrl : blobUrl; // 一時的に縁取りなし版を使用
  let blobWithBorderUrl = blobUrl; // 一時的に同じURLを使用

  // DOMに追加（即座に表示）
  const actualZIndex = addStickerToDOM(
    url,
    blobUrl,
    blobWithBorderUrl,
    x,
    yPercent,
    width,
    rotation,
    stickerId,
    zIndex,
    false, // isPinned（新規追加時は常に未固定）
    hasBorder,
  );

  // 縁取り版をバックグラウンドで生成（非同期）
  applyOutlineFilter(resizedBlob).then((blobWithBorder) => {
    // 縁取り版が生成されたらURLを更新
    const newBlobWithBorderUrl = URL.createObjectURL(blobWithBorder);
    const addedSticker = state.getStickerById(stickerId);
    
    if (addedSticker) {
      // URLを更新
      addedSticker.blobWithBorderUrl = newBlobWithBorderUrl;
      
      // 縁取りがONの場合は画像を切り替え
      if (addedSticker.hasBorder && addedSticker.img) {
        addedSticker.img.src = newBlobWithBorderUrl;
        addedSticker.url = newBlobWithBorderUrl;
      }
      
      // DBに保存
      saveStickerToDB({
        id: stickerId,
        blob: resizedBlob,
        blobWithBorder: blobWithBorder,
        x: addedSticker.x,
        yPercent: addedSticker.yPercent,
        width: addedSticker.width,
        rotation: addedSticker.rotation,
        zIndex: addedSticker.zIndex,
        isPinned: addedSticker.isPinned,
        hasBorder: addedSticker.hasBorder,
        timestamp: Date.now(),
      }).catch(err => console.warn('縁取り版の保存エラー:', err));
    }
  }).catch(err => {
    console.warn('縁取り版の生成エラー:', err);
  });

  // IndexedDBに保存（まず縁取りなし版のみ）
  await saveStickerToDB({
    id: stickerId,
    blob: resizedBlob,
    x: x,
    yPercent: yPercent,
    width: width,
    rotation: rotation,
    zIndex: actualZIndex,
    isPinned: false,
    hasBorder: hasBorder,
    timestamp: Date.now(),
  });

  // 追加したステッカーを選択状態にする
  const addedSticker = state.getStickerById(stickerId);
  if (addedSticker) {
    state.selectSticker(addedSticker);
    updateInfoButtonVisibility();
  }
}

/**
 * シール（画像）をDOMに追加
 * @param {string} url - 現在表示する画像URL
 * @param {string} blobUrl - 縁取りなし版のURL
 * @param {string} blobWithBorderUrl - 縁取りあり版のURL
 * @param {number} x - 画面中央からのX座標オフセット（px）
 * @param {number} yPercent - 画面高さに対するY座標の割合（0-100）
 * @param {number} width - 幅（px）
 * @param {number} rotation - 回転角度
 * @param {number|null} id - シールID
 * @param {number|null} zIndex - z-index
 * @param {boolean} isPinned - 固定状態
 * @param {boolean} hasBorder - 縁取りあり
 * @returns {number} 実際のz-index
 */
export function addStickerToDOM(
  url,
  blobUrl,
  blobWithBorderUrl,
  x,
  yPercent,
  width = STICKER_DEFAULTS.WIDTH,
  rotation = STICKER_DEFAULTS.ROTATION,
  id = null,
  zIndex = null,
  isPinned = false,
  hasBorder = STICKER_DEFAULTS.HAS_BORDER,
) {
  const stickerId = id || Date.now();

  // シールコンテナを作成
  const stickerDiv = document.createElement("div");
  stickerDiv.className = "sticker appearing";
  stickerDiv.dataset.id = stickerId;

  // アニメーション終了後にappearingクラスを削除
  setTimeout(() => {
    stickerDiv.classList.remove("appearing");
  }, 400);

  // 画像要素を作成
  const img = document.createElement("img");
  img.src = url;

  // 画像ラッパー（回転とスケール用）
  const imgWrapper = document.createElement("div");
  imgWrapper.className = "sticker-img-wrapper";
  imgWrapper.appendChild(img);

  stickerDiv.appendChild(imgWrapper);

  // スタイルを設定（X:画面中央基準のピクセル値、Y:パーセント値）
  stickerDiv.style.left = `calc(50% + ${x}px)`;
  stickerDiv.style.top = `${yPercent}%`;
  stickerDiv.style.width = `${STICKER_DEFAULTS.BASE_WIDTH}px`; // 固定幅
  stickerDiv.style.transform = `translate(-50%, -50%)`;

  // z-indexを設定
  let actualZIndex;
  if (zIndex !== null) {
    // 読み込み時：保存されたz-indexを使用
    actualZIndex = zIndex;
    stickerDiv.style.zIndex = zIndex;
    state.updateZIndexCounter(zIndex);
  } else {
    // 新規追加時：新しいz-indexを割り当て
    actualZIndex = state.incrementZIndex();
    stickerDiv.style.zIndex = actualZIndex;
  }

  // イベントリスナーを登録（imgWrapperに設定）
  attachStickerEventListeners(imgWrapper, stickerId);

  // DOMに追加
  elements.canvas.appendChild(stickerDiv);

  // 状態に追加
  const stickerObject = {
    id: stickerId,
    url: url,
    blobUrl: blobUrl,
    blobWithBorderUrl: blobWithBorderUrl,
    x: x,
    yPercent: yPercent,
    width: width,
    rotation: rotation,
    zIndex: actualZIndex,
    element: stickerDiv,
    imgWrapper: imgWrapper,
    img: img,
    isPinned: isPinned,
    hasBorder: hasBorder,
  };
  state.addSticker(stickerObject);
  
  // 固定状態を反映
  if (isPinned) {
    stickerDiv.classList.add('pinned');
  }
  
  // 縁取り状態を反映
  if (!hasBorder) {
    stickerDiv.classList.add('no-border');
  }
  
  // transformを適用（scaleと回転）
  applyStickerTransform(stickerObject);

  // 物理モードが有効な場合は物理ボディを追加
  if (isPhysicsActive()) {
    // DOMが完全にレンダリングされるまで少し待つ
    setTimeout(() => {
      addPhysicsBody(stickerObject);
    }, 10);
  }

  // インフォボタンの表示状態を更新
  updateInfoButtonVisibility();

  return actualZIndex;
}

/**
 * シールを削除（戻す機能付き）
 * @param {number} id - シールID
 */
export async function removeSticker(id) {
  const sticker = state.removeSticker(id);

  if (sticker) {
    // being-deletedクラスを削除（ゴミ箱ドラッグ時の赤い影を解除）
    sticker.element.classList.remove("being-deleted");

    // DOM要素を非表示にする（削除はしない）
    sticker.element.style.display = "none";

    // 物理モードが有効な場合は物理ボディも削除
    if (isPhysicsActive()) {
      removePhysicsBody(id);
    }

    // 削除時にUIを表示
    state.showUI();
    
    // インフォボタンの表示状態を更新
    updateInfoButtonVisibility();

    // ヘルプステッカーの場合はlocalStorageから削除
    if (sticker.isHelpSticker) {
      clearHelpStickerState();
    }

    // 削除データを一時保存（戻すために必要なデータ）
    const stickerData = {
      id: sticker.id,
      url: sticker.url,
      blobUrl: sticker.blobUrl,
      blobWithBorderUrl: sticker.blobWithBorderUrl,
      img: sticker.img,
      x: sticker.x,
      yPercent: sticker.yPercent,
      width: sticker.width,
      rotation: sticker.rotation,
      zIndex: sticker.zIndex,
      element: sticker.element,
      imgWrapper: sticker.imgWrapper,
      isHelpSticker: sticker.isHelpSticker,
      isPinned: sticker.isPinned,
      hasBorder: sticker.hasBorder,
    };

    let deleteTimeout = null;

    // 「戻す」トーストを表示
    showToast("削除しました", {
      actionText: "戻す",
      duration: 4000, // 4秒間表示
      onAction: () => {
        // タイムアウトをキャンセル
        if (deleteTimeout) {
          clearTimeout(deleteTimeout);
        }
        // 戻す処理
        undoRemoveSticker(stickerData);
      },
    });

    // 5秒後に完全削除（戻すが押されなかった場合）
    deleteTimeout = setTimeout(async () => {
      // DOM要素を完全に削除
      sticker.element.remove();

      // ヘルプステッカーでない場合のみIndexedDBから削除
      if (!sticker.isHelpSticker) {
        await deleteStickerFromDB(id);
      }
    }, 5300); // トーストのフェードアウト時間を考慮して少し長めに設定
  }
}

/**
 * シールの削除を取り消す
 * @param {Object} stickerData - シールデータ
 */
async function undoRemoveSticker(stickerData) {
  // DOM要素を再表示
  stickerData.element.style.display = "";

  // 中央に移動
  updateStickerPosition(stickerData, 0, 50);

  // 状態に再追加
  state.addSticker(stickerData);
  
  // 固定状態を復元
  if (stickerData.isPinned) {
    stickerData.element.classList.add('pinned');
  }
  
  // 縁取り状態を復元
  if (stickerData.hasBorder === false) {
    stickerData.element.classList.add('no-border');
  } else {
    stickerData.element.classList.remove('no-border');
  }

  // 選択状態にする
  state.selectSticker(stickerData);

  // 最前面に移動
  await bringToFront(stickerData);

  // ヘルプステッカーの場合は状態を復元
  if (stickerData.isHelpSticker) {
    updateHelpStickerState(stickerData);
  }

  // インフォボタンの表示状態を更新
  updateInfoButtonVisibility();
}

/**
 * ステッカーのz-indexを更新してDBに保存
 * @param {Object} sticker - シールオブジェクト
 * @param {number} newZIndex - 新しいz-index
 */
async function updateStickerZIndex(sticker, newZIndex) {
  sticker.element.style.zIndex = newZIndex;
  sticker.zIndex = newZIndex;

  // ヘルプステッカーはlocalStorageに、通常ステッカーはDBに保存
  if (!sticker.isHelpSticker) {
    await updateStickerInDB(sticker.id, { zIndex: newZIndex });
  } else {
    updateHelpStickerState(sticker);
  }
}

/**
 * ステッカーを最前面に移動
 * @param {Object} sticker - シールオブジェクト
 */
export async function bringToFront(sticker) {
  const newZIndex = state.incrementZIndex();
  await updateStickerZIndex(sticker, newZIndex);
}

/**
 * ステッカーを最背面に移動
 * @param {Object} sticker - シールオブジェクト
 */
export async function sendToBack(sticker) {
  // 現在の最小z-indexを見つける
  const minZIndex = Math.min(...state.stickers.map(s => s.zIndex));
  
  // 最小値-1を設定（ただし1以上を保持）
  const newZIndex = Math.max(1, minZIndex - 1);
  await updateStickerZIndex(sticker, newZIndex);
  
  showToast('最背面に移動しました');
}

/**
 * シールの位置を更新
 * @param {Object} sticker - シールオブジェクト
 * @param {number} x - 画面中央からのX座標オフセット（px）
 * @param {number} yPercent - 画面高さに対するY座標の割合（0-100）
 */
export function updateStickerPosition(sticker, x, yPercent) {
  sticker.x = x;
  sticker.yPercent = yPercent;
  sticker.element.style.left = `calc(50% + ${x}px)`;
  sticker.element.style.top = `${yPercent}%`;
}

/**
 * シールの回転を更新
 * @param {Object} sticker - シールオブジェクト
 * @param {number} rotation - 回転角度
 */
export function updateStickerRotation(sticker, rotation) {
  sticker.rotation = rotation;
  applyStickerTransform(sticker);
}

/**
 * シールのサイズを更新
 * @param {Object} sticker - シールオブジェクト
 * @param {number} width - 幅（px）
 */
export function updateStickerSize(sticker, width) {
  // サイズ制限を取得
  const { minWidth, maxWidth } = getSizeConstraints(sticker);
  
  // サイズを制限して保存
  sticker.width = Math.max(minWidth, Math.min(maxWidth, width));
  
  // 固定幅を設定
  const baseWidth = getBaseWidth(sticker);
  sticker.element.style.width = `${baseWidth}px`;
  
  // transformを適用（scaleと回転）
  applyStickerTransform(sticker);
}

/**
 * シールの変更をDBに保存
 * @param {Object} sticker - シールオブジェクト
 */
export async function saveStickerChanges(sticker) {
  // nullチェック
  if (!sticker) {
    console.warn('saveStickerChanges: sticker is null');
    return;
  }
  
  // ヘルプステッカーはlocalStorageに保存
  if (sticker.isHelpSticker) {
    updateHelpStickerState(sticker);
    return;
  }
  
  await updateStickerInDB(sticker.id, {
    x: sticker.x,
    yPercent: sticker.yPercent,
    width: sticker.width,
    rotation: sticker.rotation,
  });
}

/**
 * 複数のステッカーの位置を一括保存
 * @param {Array} stickers - 保存するステッカーの配列
 * @param {Object} options - オプション
 * @param {boolean} options.showToastOnComplete - 完了時にトーストを表示するか
 * @returns {Promise<void>}
 */
export async function saveAllStickerPositions(stickers, options = {}) {
  const promises = stickers.map((sticker) => {
    // ヘルプステッカーでない場合のみDB保存
    if (!sticker.isHelpSticker) {
      return saveStickerChanges(sticker);
    } else {
      // ヘルプステッカーはlocalStorageに保存
      updateHelpStickerState(sticker);
      return Promise.resolve();
    }
  });

  await Promise.all(promises);
  
  if (options.showToastOnComplete) {
    showToast('位置を保存しました');
  }
}

/**
 * ステッカーの固定状態をトグル
 * @param {Object} sticker - シールオブジェクト
 */
export async function toggleStickerPin(sticker) {
  sticker.isPinned = !sticker.isPinned;
  
  // DOMクラスを更新
  if (sticker.isPinned) {
    sticker.element.classList.add('pinned');
  } else {
    sticker.element.classList.remove('pinned');
  }
  
  // ヘルプステッカーでない場合はDBに保存
  if (!sticker.isHelpSticker) {
    await updateStickerInDB(sticker.id, { isPinned: sticker.isPinned });
  } else {
    // ヘルプステッカーはlocalStorageに保存
    updateHelpStickerState(sticker);
  }
  
  // ボタンの表示状態を更新
  updateInfoButtonVisibility();
}

/**
 * ステッカーの縁取り状態をトグル
 * @param {Object} sticker - シールオブジェクト
 */
export async function toggleStickerBorder(sticker) {
  sticker.hasBorder = !sticker.hasBorder;
  
  // 画像URLを切り替え
  if (sticker.img && sticker.blobUrl && sticker.blobWithBorderUrl) {
    sticker.img.src = sticker.hasBorder ? sticker.blobWithBorderUrl : sticker.blobUrl;
    sticker.url = sticker.hasBorder ? sticker.blobWithBorderUrl : sticker.blobUrl;
  }
  
  // DOMクラスを更新
  if (!sticker.hasBorder) {
    sticker.element.classList.add('no-border');
  } else {
    sticker.element.classList.remove('no-border');
  }
  
  // ヘルプステッカーでない場合はDBに保存
  if (!sticker.isHelpSticker) {
    await updateStickerInDB(sticker.id, { hasBorder: sticker.hasBorder });
  } else {
    // ヘルプステッカーはlocalStorageに保存
    updateHelpStickerState(sticker);
  }
  
  // ボタンの表示状態を更新
  updateInfoButtonVisibility();
}
