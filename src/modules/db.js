import { DB_CONFIG } from "./constants.js";
import { blobToArrayBuffer, arrayBufferToBlob } from "./blob-utils.js";
import { logger } from "../utils/logger.js";

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
      logger.error("IndexedDB open error");
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db); // dbを返す
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(DB_CONFIG.STORE_NAME)) {
        const objectStore = db.createObjectStore(DB_CONFIG.STORE_NAME, {
          keyPath: "id",
        });
        objectStore.createIndex("timestamp", "timestamp", { unique: false });
      }

      // 背景画像用のオブジェクトストアを作成
      if (!db.objectStoreNames.contains("background")) {
        db.createObjectStore("background", { keyPath: "id" });
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
      const arrayBuffer = await blobToArrayBuffer(stickerData.blob);
      dataToSave.blobData = arrayBuffer;
      dataToSave.blobType = stickerData.blob.type;
      delete dataToSave.blob; // 元のBlobプロパティを削除
    }

    // blobWithBorderも同様に処理
    if (stickerData.blobWithBorder instanceof Blob) {
      const arrayBuffer = await blobToArrayBuffer(stickerData.blobWithBorder);
      dataToSave.blobWithBorderData = arrayBuffer;
      dataToSave.blobWithBorderType = stickerData.blobWithBorder.type;
      delete dataToSave.blobWithBorder; // 元のBlobプロパティを削除
    }

    // originalBlobも同様に処理
    if (stickerData.originalBlob instanceof Blob) {
      const arrayBuffer = await blobToArrayBuffer(stickerData.originalBlob);
      dataToSave.originalBlobData = arrayBuffer;
      dataToSave.originalBlobType = stickerData.originalBlob.type;
      delete dataToSave.originalBlob;
    }

    const transaction = db.transaction([DB_CONFIG.STORE_NAME], "readwrite");
    const objectStore = transaction.objectStore(DB_CONFIG.STORE_NAME);
    const request = objectStore.put(dataToSave);
    return promisifyRequest(request);
  } catch (error) {
    logger.error("DB保存エラー:", error);
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
    // Safari対策：BlobをArrayBufferに変換（トランザクション開始前に実行）
    const updatesToApply = { ...updates };

    // blobを処理
    if (updates.blob instanceof Blob) {
      const arrayBuffer = await blobToArrayBuffer(updates.blob);
      updatesToApply.blobData = arrayBuffer;
      updatesToApply.blobType = updates.blob.type;
      delete updatesToApply.blob;
    }

    // blobWithBorderを処理
    if (updates.blobWithBorder instanceof Blob) {
      const arrayBuffer = await blobToArrayBuffer(updates.blobWithBorder);
      updatesToApply.blobWithBorderData = arrayBuffer;
      updatesToApply.blobWithBorderType = updates.blobWithBorder.type;
      delete updatesToApply.blobWithBorder;
    }

    // originalBlobを処理
    if (updates.originalBlob instanceof Blob) {
      const arrayBuffer = await blobToArrayBuffer(updates.originalBlob);
      updatesToApply.originalBlobData = arrayBuffer;
      updatesToApply.originalBlobType = updates.originalBlob.type;
      delete updatesToApply.originalBlob;
    }

    // ステップ1: 既存データを取得（読み取り専用トランザクション）
    const readTransaction = db.transaction([DB_CONFIG.STORE_NAME], "readonly");
    const readStore = readTransaction.objectStore(DB_CONFIG.STORE_NAME);
    const data = await promisifyRequest(readStore.get(id));

    if (!data) {
      logger.warn(`DB更新: ID ${id} のデータが見つかりません`);
      return;
    }

    // Safari対策：既存のdataからBlobプロパティを削除（念のため）
    if (data.blob instanceof Blob) {
      delete data.blob;
    }
    if (data.blobWithBorder instanceof Blob) {
      delete data.blobWithBorder;
    }
    if (data.originalBlob instanceof Blob) {
      delete data.originalBlob;
    }

    // データをマージ
    Object.assign(data, updatesToApply);

    // ステップ2: 更新されたデータを保存（書き込みトランザクション）
    const writeTransaction = db.transaction(
      [DB_CONFIG.STORE_NAME],
      "readwrite",
    );
    const writeStore = writeTransaction.objectStore(DB_CONFIG.STORE_NAME);
    const putRequest = writeStore.put(data);
    await promisifyRequest(putRequest);
  } catch (e) {
    logger.error("DB更新エラー:", e);
    throw e; // エラーを再スロー
  }
}

/**
 * DBからシールを削除
 * @param {number} id - シールID
 * @returns {Promise<void>}
 */
export function deleteStickerFromDB(id) {
  const transaction = db.transaction([DB_CONFIG.STORE_NAME], "readwrite");
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
    const transaction = db.transaction([DB_CONFIG.STORE_NAME], "readonly");
    const objectStore = transaction.objectStore(DB_CONFIG.STORE_NAME);
    const stickers = await promisifyRequest(objectStore.getAll());

    // Safari対策：ArrayBufferをBlobに戻す
    for (const sticker of stickers) {
      if (sticker.blobData && sticker.blobType) {
        // ArrayBufferからBlobを復元
        sticker.blob = arrayBufferToBlob(sticker.blobData, sticker.blobType);
        delete sticker.blobData;
        delete sticker.blobType;
      }

      // blobWithBorderも同様に処理（既存データとの互換性を維持）
      if (sticker.blobWithBorderData && sticker.blobWithBorderType) {
        sticker.blobWithBorder = arrayBufferToBlob(
          sticker.blobWithBorderData,
          sticker.blobWithBorderType,
        );
        delete sticker.blobWithBorderData;
        delete sticker.blobWithBorderType;
      }

      // originalBlobも同様に処理
      if (sticker.originalBlobData && sticker.originalBlobType) {
        sticker.originalBlob = arrayBufferToBlob(
          sticker.originalBlobData,
          sticker.originalBlobType,
        );
        delete sticker.originalBlobData;
        delete sticker.originalBlobType;
      }
    }

    // z-index順にソート（小さい順から追加することで重ね順を再現）
    stickers.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    return stickers;
  } catch (e) {
    logger.error("DB読み込みエラー:", e);
    return [];
  }
}
