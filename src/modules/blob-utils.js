/**
 * Blobユーティリティモジュール
 * Blob ↔ ArrayBuffer変換、URL取得などの共通処理
 */

/**
 * BlobをArrayBufferに変換
 * @param {Blob} blob - 変換するBlob
 * @returns {Promise<ArrayBuffer>} ArrayBuffer
 */
export async function blobToArrayBuffer(blob) {
  if (!(blob instanceof Blob)) {
    throw new Error('引数はBlobである必要があります');
  }
  return await blob.arrayBuffer();
}

/**
 * ArrayBufferをBlobに変換
 * @param {ArrayBuffer|Array} arrayBuffer - ArrayBufferまたは配列
 * @param {string} type - MIMEタイプ
 * @returns {Blob} Blob
 */
export function arrayBufferToBlob(arrayBuffer, type) {
  // 配列の場合はUint8Arrayに変換してからArrayBufferを取得
  let buffer = arrayBuffer;
  if (Array.isArray(arrayBuffer)) {
    buffer = new Uint8Array(arrayBuffer).buffer;
  }

  return new Blob([buffer], { type });
}

/**
 * URLからBlobを取得
 * @param {string} url - 取得するURL（blob:またはhttp:）
 * @returns {Promise<Blob>} Blob
 */
export async function fetchBlobFromUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('有効なURLを指定してください');
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`URL取得失敗: ${response.status} ${response.statusText}`);
  }

  return await response.blob();
}

/**
 * Blobを配列データに変換（IndexedDB保存用）
 * Safari互換性のため、BlobをArrayBufferに変換してから配列化
 * @param {Blob} blob - 変換するBlob
 * @returns {Promise<{data: Array, type: string}>} 配列データとMIMEタイプ
 */
export async function blobToArrayData(blob) {
  if (!(blob instanceof Blob)) {
    throw new Error('引数はBlobである必要があります');
  }

  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  return {
    data: Array.from(uint8Array),
    type: blob.type,
  };
}

/**
 * 配列データをBlobに復元（IndexedDB取得用）
 * @param {Array|ArrayBuffer} data - 配列データまたはArrayBuffer
 * @param {string} type - MIMEタイプ
 * @returns {Blob} Blob
 */
export function arrayDataToBlob(data, type) {
  if (!data) {
    throw new Error('データが指定されていません');
  }

  return arrayBufferToBlob(data, type);
}

/**
 * Blobのクローンを作成
 * @param {Blob} blob - クローン元のBlob
 * @returns {Blob} クローンされたBlob
 */
export function cloneBlob(blob) {
  if (!(blob instanceof Blob)) {
    throw new Error('引数はBlobである必要があります');
  }

  return new Blob([blob], { type: blob.type });
}
