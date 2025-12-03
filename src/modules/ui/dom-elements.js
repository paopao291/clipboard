import { DOM_IDS } from "../constants.js";

// DOM要素の取得
export const elements = {
  canvas: null,
  galleryInput: null,
  cameraInput: null,
  backgroundInput: null,
  pasteArea: null,
  headerButtons: null,
  backgroundBtn: null,
  saveBtn: null,
  infoBtn: null,
  hideUIBtn: null,
  selectionButtons: null,
  sendToBackBtn: null,
  pinBtn: null,
  borderBtn: null,
  bgRemovalBtn: null, // 背景除去ボタン
  trashBtn: null,
  addBtn: null,
  footerButtons: null,
  physicsBtn: null,
  layoutBtn: null,
  selectionOverlay: null,
  helpStickerTemplate: null,
};

// ゴミ箱の中心座標（キャッシュ）
let trashCenterX = null;
let trashCenterY = null;

/**
 * DOM要素を初期化
 */
export function initElements() {
  elements.canvas = document.getElementById(DOM_IDS.CANVAS);
  elements.galleryInput = document.getElementById(DOM_IDS.GALLERY_INPUT);
  elements.cameraInput = document.getElementById(DOM_IDS.CAMERA_INPUT);
  elements.backgroundInput = document.getElementById("backgroundInput");
  elements.pasteArea = document.getElementById(DOM_IDS.PASTE_AREA);
  elements.headerButtons = document.querySelector(".header-buttons");
  elements.backgroundBtn = document.getElementById("backgroundBtn");
  elements.saveBtn = document.getElementById("saveBtn");
  elements.infoBtn = document.getElementById(DOM_IDS.INFO_BTN);
  elements.hideUIBtn = document.getElementById("hideUIBtn");
  elements.selectionButtons = document.querySelector(".selection-buttons");
  elements.sendToBackBtn = document.getElementById("sendToBackBtn");
  elements.pinBtn = document.getElementById("pinBtn");
  elements.borderBtn = document.getElementById("borderBtn");
  elements.bgRemovalBtn = document.getElementById("bgRemovalBtn");
  elements.copyBtn = document.getElementById("copyBtn");
  elements.trashBtn = document.getElementById(DOM_IDS.TRASH_BTN);
  elements.addBtn = document.getElementById(DOM_IDS.ADD_BTN);
  elements.footerButtons = document.querySelector(".footer-buttons");
  elements.physicsBtn = document.getElementById("physicsBtn");
  elements.layoutBtn = document.getElementById("layoutBtn");
  elements.selectionOverlay = document.getElementById("selectionOverlay");
  elements.helpStickerTemplate = document.getElementById("helpStickerTemplate");

  // ゴミ箱の中心座標を計算（初期化時に一度だけ）
  updateTrashCenter();
}

/**
 * ゴミ箱の中心座標を更新
 */
export function updateTrashCenter() {
  if (elements.trashBtn) {
    const rect = elements.trashBtn.getBoundingClientRect();
    trashCenterX = rect.left + rect.width / 2;
    trashCenterY = rect.top + rect.height / 2;
  }
}

// ウィンドウリサイズ時にゴミ箱の座標を再計算
if (typeof window !== 'undefined') {
  window.addEventListener('resize', updateTrashCenter);
}

/**
 * モバイル判定
 * @returns {boolean}
 */
export function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

// 内部で使用するためのゴミ箱座標取得関数（他のモジュール用）
export function getTrashCenter() {
  return { x: trashCenterX, y: trashCenterY };
}
