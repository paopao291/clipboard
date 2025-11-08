// グローバル状態管理
const state = {
    stickers: [],
    selectedSticker: null,
    isDragging: false,
    isRotating: false,
    dragStartX: 0,
    dragStartY: 0,
    startAngle: 0,
    lastTouchX: null,
    lastTouchY: null,
    zIndexCounter: 10 // z-index管理用カウンター
};

// DOM要素
const canvas = document.getElementById('canvas');
const galleryInput = document.getElementById('galleryInput');
const cameraInput = document.getElementById('cameraInput');
const pasteArea = document.getElementById('pasteArea');
const infoBtn = document.getElementById('infoBtn');
const helpModal = document.getElementById('helpModal');
const closeHelp = document.getElementById('closeHelp');

// IndexedDB設定
const DB_NAME = 'StickerDB';
const DB_VERSION = 1;
const STORE_NAME = 'stickers';
let db = null;

// 初期化
async function init() {
    // IndexedDBを初期化
    await initDB();
    
    // ペーストイベント（pasteAreaのみにバインド）
    pasteArea.addEventListener('paste', handlePaste);
    
    // ファイル入力イベント
    galleryInput.addEventListener('change', handleFileSelect);
    cameraInput.addEventListener('change', handleFileSelect);
    
    // ペーストエリアのイベント
    pasteArea.addEventListener('focus', handlePasteAreaFocus);
    pasteArea.addEventListener('blur', handlePasteAreaBlur);
    pasteArea.addEventListener('input', handlePasteAreaInput);
    pasteArea.addEventListener('keydown', handlePasteAreaKeydown);
    
    // ボタンイベント
    infoBtn.addEventListener('click', showHelp);
    closeHelp.addEventListener('click', hideHelp);
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) hideHelp();
    });
    
    // Escキーでヘルプを閉じる
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && helpModal.classList.contains('show')) {
            hideHelp();
        }
    });
    
    // キャンバスのタッチイベント（スマホでフォーカス）
    canvas.addEventListener('touchstart', handleCanvasTouchStart);
    
    // キャンバスのクリックイベント（選択解除）
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    
    // マウスイベント
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // タッチイベント
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    
    // IndexedDBから自動読み込み
    await loadFromDB();
    
    // インフォボタンの初期表示状態を設定
    updateInfoButtonVisibility();
    
    // 初回訪問時のみヘルプを表示
    const hasVisited = localStorage.getItem('hasVisited');
    if (!hasVisited) {
        setTimeout(() => {
            showHelp();
            localStorage.setItem('hasVisited', 'true');
        }, 800);
    }
    
    // 初期フォーカス（ペースト可能にするため）
    setTimeout(() => {
        pasteArea.focus();
    }, 100);
}

// IndexedDB初期化
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => {
            console.error('IndexedDB open error');
            reject(request.error);
        };
        
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                objectStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

// ペーストイベントハンドラー
async function handlePaste(e) {
    e.preventDefault();
    
    const items = e.clipboardData.items;
    let hasImage = false;
    
    for (let item of items) {
        if (item.type.indexOf('image') !== -1) {
            hasImage = true;
            const blob = item.getAsFile();
            
            // タッチ位置があればその位置に、なければ中央に配置
            const x = state.lastTouchX || window.innerWidth / 2;
            const y = state.lastTouchY || window.innerHeight / 2;
            
            // Blobを追加
            await addStickerFromBlob(blob, x, y);
            
            showToast('画像を追加しました！');
            
            // ペーストエリアのフォーカスを外す（textareaを元に戻すため）
            pasteArea.blur();
            
            break;
        }
    }
    
    // 画像以外がペーストされた場合、写真ライブラリを開く
    if (!hasImage) {
        galleryInput.click();
        showToast('写真ライブラリから選択してください');
    }
}

// ファイル選択ハンドラー
async function handleFileSelect(e) {
    const files = e.target.files;
    
    if (files.length === 0) return;
    
    let addedCount = 0;
    
    for (let file of files) {
        if (file.type.indexOf('image') !== -1) {
            // 画像を少しずつずらして配置
            const offsetX = addedCount * 30;
            const offsetY = addedCount * 30;
            const x = state.lastTouchX ? state.lastTouchX + offsetX : window.innerWidth / 2 + offsetX;
            const y = state.lastTouchY ? state.lastTouchY + offsetY : window.innerHeight / 2 + offsetY;
            await addStickerFromBlob(file, x, y);
            
            addedCount++;
        }
    }
    
    if (addedCount > 0) {
        showToast(`${addedCount}枚の画像を追加しました！`);
    }
    
    // 入力をリセット
    e.target.value = '';
}

// Blobからシールを追加
async function addStickerFromBlob(blob, x, y, width = 200, rotation = 0, id = null, zIndex = null) {
    const stickerId = id || Date.now();
    const url = URL.createObjectURL(blob);
    
    // DOMに追加
    const actualZIndex = addSticker(url, x, y, width, rotation, stickerId, zIndex);
    
    // IndexedDBに保存
    await saveStickerToDB({
        id: stickerId,
        blob: blob,
        x: x,
        y: y,
        width: width,
        rotation: rotation,
        zIndex: actualZIndex,
        timestamp: Date.now()
    });
}

// シール（画像）を追加（DOM操作のみ）
function addSticker(url, x, y, width = 200, rotation = 0, id = null, zIndex = null) {
    const stickerId = id || Date.now();
    
    // シールコンテナを作成
    const stickerDiv = document.createElement('div');
    stickerDiv.className = 'sticker appearing';
    stickerDiv.dataset.id = stickerId;
    
    // アニメーション終了後にappearingクラスを削除
    setTimeout(() => {
        stickerDiv.classList.remove('appearing');
    }, 400);
    
    // 画像要素を作成
    const img = document.createElement('img');
    img.src = url;
    
    // 削除ボタンを作成
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '×';
    
    // クリックイベント（PC用）
    deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeSticker(stickerId);
    });
    
    // タッチイベント（スマホ用）
    deleteBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeSticker(stickerId);
    });
    
    // 画像ラッパー（回転用）
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'sticker-img-wrapper';
    imgWrapper.style.transform = `rotate(${rotation}deg)`;
    imgWrapper.appendChild(img);
    
    stickerDiv.appendChild(imgWrapper);
    stickerDiv.appendChild(deleteBtn);
    
    // スタイルを設定
    stickerDiv.style.left = `${x}px`;
    stickerDiv.style.top = `${y}px`;
    stickerDiv.style.width = `${width}px`;
    stickerDiv.style.transform = `translate(-50%, -50%)`;
    
    // z-indexを設定（読み込み時は保存されたz-index、新規追加時は新しいz-index）
    let actualZIndex;
    if (zIndex !== null) {
        // 読み込み時：保存されたz-indexを使用
        actualZIndex = zIndex;
        stickerDiv.style.zIndex = zIndex;
        // カウンターも更新（最大値を追跡）
        if (zIndex > state.zIndexCounter) {
            state.zIndexCounter = zIndex;
        }
    } else {
        // 新規追加時：新しいz-indexを割り当て
        state.zIndexCounter++;
        actualZIndex = state.zIndexCounter;
        stickerDiv.style.zIndex = actualZIndex;
    }
    
    // イベントリスナーを追加
    stickerDiv.addEventListener('mousedown', (e) => handleStickerMouseDown(e, stickerId));
    stickerDiv.addEventListener('wheel', (e) => handleWheel(e, stickerId));
    stickerDiv.addEventListener('touchstart', (e) => handleStickerTouchStart(e, stickerId), { passive: false });
    
    // DOMに追加
    canvas.appendChild(stickerDiv);
    
    // 状態に追加
    state.stickers.push({
        id: stickerId,
        url: url,
        x: x,
        y: y,
        width: width,
        rotation: rotation,
        zIndex: actualZIndex,
        element: stickerDiv,
        imgWrapper: imgWrapper
    });
    
    // インフォボタンの表示状態を更新
    updateInfoButtonVisibility();
    
    // z-indexを返す
    return actualZIndex;
}

// シール削除
async function removeSticker(id) {
    const index = state.stickers.findIndex(s => s.id === id);
    if (index !== -1) {
        const sticker = state.stickers[index];
        
        // 削除するステッカーが選択中だった場合、選択を解除
        if (state.selectedSticker === sticker) {
            state.selectedSticker = null;
        }
        
        sticker.element.remove();
        state.stickers.splice(index, 1);
        
        // IndexedDBから削除
        await deleteStickerFromDB(id);
        
        // インフォボタンの表示状態を更新
        updateInfoButtonVisibility();
    }
}

// ステッカーを最前面に移動
async function bringToFront(sticker) {
    state.zIndexCounter++;
    const newZIndex = state.zIndexCounter;
    sticker.element.style.zIndex = newZIndex;
    sticker.zIndex = newZIndex;
    
    // IndexedDBに保存
    await updateStickerInDB(sticker.id, { zIndex: newZIndex });
}

// マウスダウンイベント（シール上）
function handleStickerMouseDown(e, id) {
    e.preventDefault();
    e.stopPropagation();
    
    const sticker = state.stickers.find(s => s.id === id);
    if (!sticker) return;
    
    // 選択状態を更新
    state.stickers.forEach(s => s.element.classList.remove('selected'));
    sticker.element.classList.add('selected');
    state.selectedSticker = sticker;
    updateInfoButtonVisibility();
    
    // 最前面に移動
    bringToFront(sticker);
    
    // Shiftキーが押されていたら回転モード
    if (e.shiftKey) {
        state.isRotating = true;
        sticker.element.classList.add('rotating');
        
        const rect = sticker.element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        state.startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI) - sticker.rotation;
    } else {
        // ドラッグモード
        state.isDragging = true;
        state.dragStartX = e.clientX - sticker.x;
        state.dragStartY = e.clientY - sticker.y;
    }
}

// マウス移動イベント
function handleMouseMove(e) {
    if (!state.selectedSticker) return;
    
    if (state.isDragging) {
        // ドラッグ移動
        const newX = e.clientX - state.dragStartX;
        const newY = e.clientY - state.dragStartY;
        
        state.selectedSticker.x = newX;
        state.selectedSticker.y = newY;
        
        state.selectedSticker.element.style.left = `${newX}px`;
        state.selectedSticker.element.style.top = `${newY}px`;
    } else if (state.isRotating) {
        // 回転
        const rect = state.selectedSticker.element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
        const rotation = angle - state.startAngle;
        
        state.selectedSticker.rotation = rotation;
        state.selectedSticker.imgWrapper.style.transform = `rotate(${rotation}deg)`;
    }
}

// マウスアップイベント
async function handleMouseUp(e) {
    if (state.isDragging || state.isRotating) {
        state.isDragging = false;
        state.isRotating = false;
        
        if (state.selectedSticker) {
            state.selectedSticker.element.classList.remove('rotating');
            // 位置・角度の変更をDBに保存
            await updateStickerInDB(state.selectedSticker.id, {
                x: state.selectedSticker.x,
                y: state.selectedSticker.y,
                rotation: state.selectedSticker.rotation
            });
        }
    }
}

// マウスホイールイベント（拡大縮小）
let wheelTimeout = null;
async function handleWheel(e, id) {
    e.preventDefault();
    e.stopPropagation();
    
    const sticker = state.stickers.find(s => s.id === id);
    if (!sticker) return;
    
    // 拡大縮小の計算
    const delta = e.deltaY > 0 ? -10 : 10;
    const newWidth = Math.max(50, Math.min(800, sticker.width + delta));
    
    sticker.width = newWidth;
    sticker.element.style.width = `${newWidth}px`;
    
    // デバウンスしてDBに保存
    if (wheelTimeout) clearTimeout(wheelTimeout);
    wheelTimeout = setTimeout(async () => {
        await updateStickerInDB(id, { width: newWidth });
    }, 500);
}

// トースト通知
function showToast(message) {
    // 既存のトーストを削除
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.style.opacity = '0';
        setTimeout(() => existingToast.remove(), 300);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.opacity = '0';
    document.body.appendChild(toast);
    
    // フェードイン
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });
    
    // フェードアウト
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// IndexedDBにシールを保存
function saveStickerToDB(stickerData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.put(stickerData);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// IndexedDBのシールを更新
async function updateStickerInDB(id, updates) {
    try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const getRequest = objectStore.get(id);
        
        return new Promise((resolve, reject) => {
            getRequest.onsuccess = () => {
                const data = getRequest.result;
                if (data) {
                    Object.assign(data, updates);
                    const putRequest = objectStore.put(data);
                    putRequest.onsuccess = () => resolve();
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    resolve();
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    } catch (e) {
        console.error('DB更新エラー:', e);
    }
}

// IndexedDBからシールを削除
function deleteStickerFromDB(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// IndexedDBから全シールを読み込み
async function loadFromDB() {
    try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.getAll();
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const stickers = request.result;
                
                // z-index順にソート（小さい順から追加することで重ね順を再現）
                stickers.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
                
                stickers.forEach(stickerData => {
                    const url = URL.createObjectURL(stickerData.blob);
                    addSticker(
                        url, 
                        stickerData.x, 
                        stickerData.y, 
                        stickerData.width, 
                        stickerData.rotation, 
                        stickerData.id,
                        stickerData.zIndex
                    );
                });
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('DB読み込みエラー:', e);
    }
}

// モバイル判定
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// ヘルプ表示
function showHelp() {
    helpModal.classList.add('show');
}

// ヘルプ非表示
function hideHelp() {
    helpModal.classList.remove('show');
}

// インフォボタンの表示状態を更新
function updateInfoButtonVisibility() {
    // ステッカーがない場合：表示
    if (state.stickers.length === 0) {
        infoBtn.style.display = 'flex';
        return;
    }
    
    // ステッカーあり + 選択中：表示
    // ステッカーあり + 未選択：非表示
    if (state.selectedSticker) {
        infoBtn.style.display = 'flex';
    } else {
        infoBtn.style.display = 'none';
    }
}

// キャンバスマウスダウン（選択解除）
function handleCanvasMouseDown(e) {
    // キャンバス自体をクリックした場合、選択を解除
    if (e.target === canvas || e.target === pasteArea) {
        // すべての選択を解除
        state.stickers.forEach(s => s.element.classList.remove('selected'));
        state.selectedSticker = null;
        updateInfoButtonVisibility();
    }
}

// キャンバスタッチスタート（フォーカス用と選択解除）
function handleCanvasTouchStart(e) {
    // シールや削除ボタン、インフォボタンをタッチしていない場合
    if (e.target === canvas || e.target === pasteArea) {
        
        // タッチ位置を記録
        const touch = e.touches[0];
        state.lastTouchX = touch.clientX;
        state.lastTouchY = touch.clientY;
        
        // ペーストエリアをタッチ位置に移動
        pasteArea.style.left = `${touch.clientX - 50}px`;
        pasteArea.style.top = `${touch.clientY - 50}px`;
        pasteArea.style.width = '100px';
        pasteArea.style.height = '100px';
        
        // すべての選択を解除
        state.stickers.forEach(s => s.element.classList.remove('selected'));
        state.selectedSticker = null;
        updateInfoButtonVisibility();
        
        // ペーストエリアにフォーカス（長押しでペーストメニューを出すため）
        pasteArea.focus();
    }
}

// ペーストエリアフォーカスイベント
function handlePasteAreaFocus(e) {
    // PCの場合はそのまま（Ctrl+V / Cmd+V でペースト可能）
    // スマホの場合は長押しメニューからペースト可能
}

// ペーストエリアブラーイベント
function handlePasteAreaBlur() {
    // テキストをクリア
    pasteArea.value = '';
    
    // ペーストエリアを元の位置に戻す（全画面）
    pasteArea.style.left = '0';
    pasteArea.style.top = '0';
    pasteArea.style.width = '100%';
    pasteArea.style.height = '100%';
}

// ペーストエリア入力イベント（テキストがペーストされた場合のクリーンアップ）
function handlePasteAreaInput(e) {
    // 画像以外のコンテンツがペーストされた場合、すぐにクリア
    setTimeout(() => {
        pasteArea.value = '';
    }, 100);
}

// キーダウンイベント（キーボード入力を防ぐ）
function handlePasteAreaKeydown(e) {
    // ペースト操作のみ許可
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        // Ctrl+V / Cmd+V は許可
        return;
    }
    // その他のキー入力は防ぐ
    e.preventDefault();
}

// タッチスタートイベント（シール上）
function handleStickerTouchStart(e, id) {
    e.preventDefault();
    e.stopPropagation();
    
    const sticker = state.stickers.find(s => s.id === id);
    if (!sticker) return;
    
    // 選択状態を更新
    state.stickers.forEach(s => s.element.classList.remove('selected'));
    sticker.element.classList.add('selected');
    state.selectedSticker = sticker;
    updateInfoButtonVisibility();
    
    // 最前面に移動
    bringToFront(sticker);
    
    const touches = e.touches;
    
    if (touches.length === 1) {
        // 1本指：ドラッグ
        state.isDragging = true;
        state.dragStartX = touches[0].clientX - sticker.x;
        state.dragStartY = touches[0].clientY - sticker.y;
    } else if (touches.length === 2) {
        // 2本指：拡大縮小と回転
        state.isRotating = true;
        
        const touch1 = touches[0];
        const touch2 = touches[1];
        
        // 初期距離を保存（拡大縮小用）
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        state.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
        state.initialWidth = sticker.width;
        
        // 初期角度を保存（回転用）
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;
        state.startAngle = Math.atan2(touch2.clientY - touch1.clientY, touch2.clientX - touch1.clientX) * (180 / Math.PI) - sticker.rotation;
    }
}

// タッチ移動イベント
function handleTouchMove(e) {
    if (!state.selectedSticker) return;
    
    const touches = e.touches;
    
    if (state.isDragging && touches.length === 1) {
        e.preventDefault();
        
        // ドラッグ移動
        const newX = touches[0].clientX - state.dragStartX;
        const newY = touches[0].clientY - state.dragStartY;
        
        state.selectedSticker.x = newX;
        state.selectedSticker.y = newY;
        
        state.selectedSticker.element.style.left = `${newX}px`;
        state.selectedSticker.element.style.top = `${newY}px`;
    } else if (state.isRotating && touches.length === 2) {
        e.preventDefault();
        
        const touch1 = touches[0];
        const touch2 = touches[1];
        
        // 拡大縮小
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const scale = distance / state.initialPinchDistance;
        const newWidth = Math.max(50, Math.min(800, state.initialWidth * scale));
        
        state.selectedSticker.width = newWidth;
        state.selectedSticker.element.style.width = `${newWidth}px`;
        
        // 回転
        const angle = Math.atan2(touch2.clientY - touch1.clientY, touch2.clientX - touch1.clientX) * (180 / Math.PI);
        const rotation = angle - state.startAngle;
        
        state.selectedSticker.rotation = rotation;
        state.selectedSticker.imgWrapper.style.transform = `rotate(${rotation}deg)`;
    }
}

// タッチ終了イベント
async function handleTouchEnd(e) {
    if (state.isDragging || state.isRotating) {
        state.isDragging = false;
        state.isRotating = false;
        
        if (state.selectedSticker) {
            state.selectedSticker.element.classList.remove('rotating');
            // 位置・サイズ・角度の変更をDBに保存
            await updateStickerInDB(state.selectedSticker.id, {
                x: state.selectedSticker.x,
                y: state.selectedSticker.y,
                width: state.selectedSticker.width,
                rotation: state.selectedSticker.rotation
            });
        }
    }
}

// 初期化実行
init();



