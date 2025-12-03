/**
 * logger.js
 * デバッグ用のロギングユーティリティ
 *
 * 本番環境ではconsole.logを無効化し、パフォーマンスへの影響を最小化します。
 * 開発時はDEBUGフラグをtrueにすることでログを有効化できます。
 */

// 開発モードフラグ（本番環境ではfalseに設定）
const DEBUG = true; // 開発中はtrue、本番デプロイ時はfalseに変更

/**
 * ロギングユーティリティ
 */
export const logger = {
  /**
   * デバッグログ（DEBUG=falseの時は出力されない）
   * @param {...any} args - ログに出力する引数
   */
  log(...args) {
    if (DEBUG) {
      console.log(...args);
    }
  },

  /**
   * 警告ログ（常に出力される）
   * @param {...any} args - ログに出力する引数
   */
  warn(...args) {
    console.warn(...args);
  },

  /**
   * エラーログ（常に出力される）
   * @param {...any} args - ログに出力する引数
   */
  error(...args) {
    console.error(...args);
  },

  /**
   * 情報ログ（DEBUG=falseの時は出力されない）
   * @param {...any} args - ログに出力する引数
   */
  info(...args) {
    if (DEBUG) {
      console.info(...args);
    }
  },

  /**
   * グループ化されたログ（DEBUG=falseの時は出力されない）
   * @param {string} label - グループのラベル
   * @param {Function} fn - グループ内で実行する関数
   */
  group(label, fn) {
    if (DEBUG) {
      console.group(label);
      fn();
      console.groupEnd();
    }
  },
};

/**
 * デバッグモードかどうかを返す
 * @returns {boolean}
 */
export function isDebugMode() {
  return DEBUG;
}
