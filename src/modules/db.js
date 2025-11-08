import { DB_CONFIG } from './constants.js';

let db = null;

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
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([DB_CONFIG.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(DB_CONFIG.STORE_NAME);
        const request = objectStore.put(stickerData);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
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

/**
 * DBからシールを削除
 * @param {number} id - シールID
 * @returns {Promise<void>}
 */
export function deleteStickerFromDB(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([DB_CONFIG.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(DB_CONFIG.STORE_NAME);
        const request = objectStore.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * DBから全シールを取得
 * @returns {Promise<Array>}
 */
export async function loadAllStickersFromDB() {
    try {
        const transaction = db.transaction([DB_CONFIG.STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(DB_CONFIG.STORE_NAME);
        const request = objectStore.getAll();

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const stickers = request.result;
                // z-index順にソート（小さい順から追加することで重ね順を再現）
                stickers.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
                resolve(stickers);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('DB読み込みエラー:', e);
        return [];
    }
}
