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
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains(DB_CONFIG.STORE_NAME)) {
                const objectStore = db.createObjectStore(DB_CONFIG.STORE_NAME, { keyPath: 'id' });
                objectStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

/**
 * シールをDBに保存
 * @param {Object} stickerData - シールのデータ
 * @returns {Promise<void>}
 */
export function saveStickerToDB(stickerData) {
    const transaction = db.transaction([DB_CONFIG.STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(DB_CONFIG.STORE_NAME);
    const request = objectStore.put(stickerData);
    return promisifyRequest(request);
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
        
        // z-index順にソート（小さい順から追加することで重ね順を再現）
        stickers.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
        return stickers;
    } catch (e) {
        console.error('DB読み込みエラー:', e);
        return [];
    }
}
