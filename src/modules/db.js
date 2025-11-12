import { DB_CONFIG } from './constants.js';

let db = null;

/**
 * IDBRequestをPromiseでラップする共通関数
 * @param {IDBRequest} request - IndexedDB request
 * @returns {Promise<any>}
 */
function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * IndexedDBを初期化
 * @returns {Promise<IDBDatabase>}
 */
export function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_CONFIG.NAME, DB_CONFIG.VERSION);

        request.onerror = () => {
            console.error('IndexedDB open error');
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            resolve(db); // dbを返す
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains(DB_CONFIG.STORE_NAME)) {
                const objectStore = db.createObjectStore(DB_CONFIG.STORE_NAME, { keyPath: 'id' });
                objectStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
            
            // 背景画像用のオブジェクトストアを作成
            if (!db.objectStoreNames.contains('background')) {
                db.createObjectStore('background', { keyPath: 'id' });
            }
        };
    });
}

/**
 * シールをDBに保存
 * @param {Object} stickerData - シールのデータ
 * @returns {Promise<void>}
 */
export async function saveStickerToDB(stickerData) {
    try {
        // Safari対策：BlobをArrayBufferに変換
        const dataToSave = { ...stickerData };
        if (stickerData.blob instanceof Blob) {
            const arrayBuffer = await stickerData.blob.arrayBuffer();
            dataToSave.blobData = arrayBuffer;
            dataToSave.blobType = stickerData.blob.type;
            delete dataToSave.blob; // 元のBlobプロパティを削除
        }
        
        const transaction = db.transaction([DB_CONFIG.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(DB_CONFIG.STORE_NAME);
        const request = objectStore.put(dataToSave);
        return promisifyRequest(request);
    } catch (error) {
        console.error('DB保存エラー:', error);
        throw error;
    }
}

/**
 * DBのシールを更新
 * @param {number} id - シールID
 * @param {Object} updates - 更新内容
 * @returns {Promise<void>}
 */
export async function updateStickerInDB(id, updates) {
    try {
        const transaction = db.transaction([DB_CONFIG.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(DB_CONFIG.STORE_NAME);
        const data = await promisifyRequest(objectStore.get(id));
        
        if (data) {
            Object.assign(data, updates);
            await promisifyRequest(objectStore.put(data));
        }
    } catch (e) {
        console.error('DB更新エラー:', e);
    }
}

/**
 * DBからシールを削除
 * @param {number} id - シールID
 * @returns {Promise<void>}
 */
export function deleteStickerFromDB(id) {
    const transaction = db.transaction([DB_CONFIG.STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(DB_CONFIG.STORE_NAME);
    const request = objectStore.delete(id);
    return promisifyRequest(request);
}

/**
 * DBから全シールを取得
 * @returns {Promise<Array>}
 */
export async function loadAllStickersFromDB() {
    try {
        const transaction = db.transaction([DB_CONFIG.STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(DB_CONFIG.STORE_NAME);
        const stickers = await promisifyRequest(objectStore.getAll());
        
        // Safari対策：ArrayBufferをBlobに戻す
        for (const sticker of stickers) {
            if (sticker.blobData && sticker.blobType) {
                // ArrayBufferからBlobを復元
                sticker.blob = new Blob([sticker.blobData], { type: sticker.blobType });
                delete sticker.blobData;
                delete sticker.blobType;
            }
        }
        
        // z-index順にソート（小さい順から追加することで重ね順を再現）
        stickers.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
        return stickers;
    } catch (e) {
        console.error('DB読み込みエラー:', e);
        return [];
    }
}
