// チェックリストのインタラクション
document.querySelectorAll(".checklist-item").forEach((item) => {
  item.addEventListener("click", function () {
    this.classList.toggle("checked");
  });
});

// ドキュメントボタンのクリックイベント
document.querySelectorAll(".doc-button").forEach((button) => {
  button.addEventListener("click", function () {
    const title = this.querySelector(".doc-title").textContent;
    console.log(`${title}を作成します`);
  });
});

// Googleドライブ保存オプション
const gdriveCheckbox = document.getElementById("save-to-gdrive");
gdriveCheckbox.addEventListener("change", function () {
  console.log("Googleドライブ保存:", this.checked);
});

// 設定アイコンのクリックイベント
function openSettings() {
  console.log("設定を開きます");
  // ここに設定画面を開く処理を追加
}

// AIマネージャー設定（3人）
const aiManagers = [
  {
    id: 1,
    name: "ファシリテーターAI",
    icon: "smart_toy",
    description: "会議の進行と戦略をサポート",
    color: "manager-1",
  },
  {
    id: 2,
    name: "コーチAI",
    icon: "support_agent",
    description: "参加者の状態をモニタリング",
    color: "manager-2",
  },
  {
    id: 3,
    name: "アナリストAI",
    icon: "analytics",
    description: "データと進捗を分析",
    color: "manager-3",
  },
];

// AIアドバイス履歴の配列（全履歴を保存）
let aiAdviceHistory = [
  {
    text: "プロジェクトの予算について詳しく確認することをお勧めします。",
    time: "2分前",
    managerId: 1,
  },
  {
    text: "参加者の方々が積極的に発言されています。良い雰囲気ですね！",
    time: "5分前",
    managerId: 2,
  },
  {
    text: "次のアジェンダ「スケジュール確認」に移る時間です。",
    time: "8分前",
    managerId: 1,
  },
  {
    text: "話題が少し脱線しているようです。本題に戻ることをお勧めします。",
    time: "12分前",
    managerId: 1,
  },
  {
    text: "全員が発言できているか確認してみましょう。",
    time: "15分前",
    managerId: 2,
  },
  {
    text: "そろそろ休憩を取ると良いかもしれません。",
    time: "18分前",
    managerId: 2,
  },
  {
    text: "重要な決定事項が出ました。議事録に記録しましょう。",
    time: "22分前",
    managerId: 1,
  },
  {
    text: "アジェンダの進行が予定より遅れています。",
    time: "25分前",
    managerId: 3,
  },
  {
    text: "参加者の集中力が高まっています。重要な議題を話すのに良いタイミングです。",
    time: "28分前",
    managerId: 3,
  },
  {
    text: "現在の進捗は良好です。このペースを維持しましょう。",
    time: "30分前",
    managerId: 3,
  },
];

// 履歴ページを表示
function showAIHistory() {
  const mainContent = document.querySelector(".main-content");
  const historyPage = document.getElementById("history-page");
  const historyList = document.getElementById("history-list");

  // メインコンテンツを非表示
  mainContent.classList.add("hidden");

  // 履歴ページを表示
  historyPage.classList.add("active");

  // 履歴リストを生成
  historyList.innerHTML = "";
  aiAdviceHistory.forEach((advice) => {
    const manager =
      aiManagers.find((m) => m.id === advice.managerId) || aiManagers[0];
    const bubble = document.createElement("div");
    bubble.className = "ai-advice-bubble";
    bubble.innerHTML = `
            <div class="ai-advice-avatar ${manager.color}">
                <span class="material-symbols-outlined">${manager.icon}</span>
            </div>
            <div class="ai-advice-content">
                <div class="ai-advice-text">${advice.text}</div>
                <div class="ai-advice-meta">
                    <span class="ai-advice-name">${manager.name}</span>
                    <span class="ai-advice-time">${advice.time}</span>
                </div>
            </div>
        `;
    historyList.appendChild(bubble);
  });
}

// 履歴ページを非表示にして戻る
function hideAIHistory() {
  const mainContent = document.querySelector(".main-content");
  const historyPage = document.getElementById("history-page");

  // 履歴ページを非表示
  historyPage.classList.remove("active");

  // メインコンテンツを表示
  mainContent.classList.remove("hidden");
}

// 感情バロメータのアニメーション（ランダムで変動するデモ）
function updateEmotionBars() {
  const bars = document.querySelectorAll(".emotion-bar");
  bars.forEach((bar) => {
    const currentWidth = parseInt(bar.style.width);
    const newWidth = Math.max(
      10,
      Math.min(100, currentWidth + (Math.random() - 0.5) * 10),
    );
    bar.style.width = newWidth + "%";
    const valueElement = bar
      .closest(".emotion-item")
      .querySelector(".emotion-value");
    valueElement.textContent = Math.round(newWidth) + "%";
  });
}

// 3秒ごとに感情バロメータを更新（デモ用）
setInterval(updateEmotionBars, 3000);

// AIアドバイスを追加する関数（デモ用）
function addAIAdvice(text, managerId = 1) {
  const container = document.querySelector(".ai-advice-container");

  // containerが存在するか確認
  if (!container) {
    console.error("ai-advice-container not found");
    return;
  }

  // マネージャー情報を取得
  const manager = aiManagers.find((m) => m.id === managerId) || aiManagers[0];

  // 最大5件まで表示 - 新規追加前にチェック
  // fade-outクラスがついている要素（削除予定）を除外してカウント
  const activeBubbles = Array.from(container.children).filter(
    (child) => !child.classList.contains("fade-out"),
  );

  if (activeBubbles.length >= 5) {
    // アクティブな吹き出しの中で最も古いもの（最後の要素）を取得
    const oldestBubble = activeBubbles[activeBubbles.length - 1];

    // oldestBubbleが存在するか確認
    if (oldestBubble && oldestBubble.classList) {
      // フェードアウトアニメーションを追加
      oldestBubble.classList.add("fade-out");
      // アニメーション終了後に削除
      setTimeout(() => {
        if (oldestBubble && oldestBubble.parentNode === container) {
          container.removeChild(oldestBubble);
        }
      }, 500); // fadeOutアニメーションの時間と合わせる
    }
  }

  const bubble = document.createElement("div");
  bubble.className = "ai-advice-bubble";
  bubble.onclick = showAIHistory;
  bubble.innerHTML = `
    <div class="ai-advice-avatar ${manager.color}">
        <span class="material-symbols-outlined">${manager.icon}</span>
    </div>
    <div class="ai-advice-content">
        <div class="ai-advice-text">${text}</div>
        <div class="ai-advice-meta">
            <span class="ai-advice-name">${manager.name}</span>
            <span class="ai-advice-time">たった今</span>
        </div>
    </div>
`;
  container.insertBefore(bubble, container.firstChild);

  // 履歴にも追加
  aiAdviceHistory.unshift({
    text: text,
    time: "たった今",
    managerId: managerId,
  });
}

// 20秒ごとに新しいAIアドバイスを追加（デモ用）
const adviceExamples = [
  {
    text: "話題が少し脱線しているようです。本題に戻ることをお勧めします。",
    managerId: 1,
  },
  {
    text: "全員が発言できているか確認してみましょう。",
    managerId: 2,
  },
  {
    text: "そろそろ休憩を取ると良いかもしれません。",
    managerId: 2,
  },
  {
    text: "重要な決定事項が出ました。議事録に記録しましょう。",
    managerId: 1,
  },
  {
    text: "アジェンダの進行が予定より遅れています。",
    managerId: 3,
  },
  {
    text: "参加者の集中力が高まっています。重要な議題を話すのに良いタイミングです。",
    managerId: 3,
  },
];

let adviceIndex = 0;

// 初期表示用のデータを追加
function initializeAIAdvice() {
  const initialAdvices = [
    {
      text: "プロジェクトの予算について詳しく確認することをお勧めします。",
      time: "2分前",
      managerId: 1,
    },
    {
      text: "参加者の方々が積極的に発言されています。良い雰囲気ですね！",
      time: "5分前",
      managerId: 2,
    },
    {
      text: "次のアジェンダ「スケジュール確認」に移る時間です。",
      time: "8分前",
      managerId: 1,
    },
  ];

  const container = document.querySelector(".ai-advice-container");
  if (!container) return;

  initialAdvices.forEach((advice) => {
    const manager =
      aiManagers.find((m) => m.id === advice.managerId) || aiManagers[0];
    const bubble = document.createElement("div");
    bubble.className = "ai-advice-bubble";
    bubble.onclick = showAIHistory;
    bubble.innerHTML = `
            <div class="ai-advice-avatar ${manager.color}">
                <span class="material-symbols-outlined">${manager.icon}</span>
            </div>
            <div class="ai-advice-content">
                <div class="ai-advice-text">${advice.text}</div>
                <div class="ai-advice-meta">
                    <span class="ai-advice-name">${manager.name}</span>
                    <span class="ai-advice-time">${advice.time}</span>
                </div>
            </div>
        `;
    container.appendChild(bubble);
  });
}

// ページ読み込み時に初期データを表示
initializeAIAdvice();

setInterval(() => {
  const advice = adviceExamples[adviceIndex % adviceExamples.length];
  addAIAdvice(advice.text, advice.managerId);
  adviceIndex++;
}, 20000);

// ========== MTGチェックマスター機能 ==========

// テンプレートデータ
let templates = [
  {
    id: 1,
    name: "標準ミーティング",
    items: [
      "アイスブレイク・自己紹介",
      "プロジェクトの進捗報告",
      "予算とリソースの確認",
      "スケジュールの調整",
      "次回ミーティングの日程決定",
    ],
  },
  {
    id: 2,
    name: "キックオフミーティング",
    items: [
      "プロジェクト概要の説明",
      "チームメンバー紹介",
      "役割分担の決定",
      "スケジュール確認",
    ],
  },
];

let currentTemplateId = null;
let editingTemplate = null; // 編集中のテンプレート（保存前）
let isNewTemplate = false; // 新規作成中かどうか
let selectedTemplateId = 1; // デフォルトで最初のテンプレートを選択
let nextTemplateId = 3;

// マスターページを表示
function showMasterPage() {
  const mainContent = document.querySelector(".main-content");
  const masterPage = document.getElementById("master-page");

  mainContent.classList.add("hidden");
  masterPage.classList.add("active");

  renderTemplateList();
}

// マスターページを非表示
function hideMasterPage() {
  const mainContent = document.querySelector(".main-content");
  const masterPage = document.getElementById("master-page");

  masterPage.classList.remove("active");
  mainContent.classList.remove("hidden");
}

// テンプレート一覧を描画
function renderTemplateList() {
  const templateList = document.getElementById("template-list");
  templateList.innerHTML = "";

  templates.forEach((template) => {
    const templateItem = document.createElement("div");
    templateItem.className =
      "template-item" + (template.id === selectedTemplateId ? " selected" : "");
    templateItem.innerHTML = `
            <div class="template-radio"></div>
            <div class="template-info">
                <div class="template-name">${template.name}</div>
                <div class="template-count">${template.items.length}項目</div>
            </div>
            <div class="template-actions">
                <button class="template-action-btn" onclick="editTemplate(${template.id}); event.stopPropagation();">
                    <span class="material-symbols-outlined">edit</span>
                </button>
                <button class="template-action-btn delete" onclick="deleteTemplate(${template.id}); event.stopPropagation();">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </div>
        `;

    // カード全体をクリックして選択
    templateItem.addEventListener("click", function (e) {
      // アクションボタンのクリックは除外
      if (e.target.closest(".template-actions")) {
        return;
      }
      selectTemplate(template.id);
    });

    templateList.appendChild(templateItem);
  });
}

// テンプレートを選択
function selectTemplate(id) {
  selectedTemplateId = id;
  renderTemplateList();
  updateChecklistFromTemplate();
}

// 新しいテンプレートを追加（編集ページを開くのみ）
function addTemplate() {
  editingTemplate = {
    id: nextTemplateId,
    name: "新しいテンプレート",
    items: [""], // 最初から1つの空項目を追加
  };
  isNewTemplate = true;
  currentTemplateId = editingTemplate.id;

  const masterPage = document.getElementById("master-page");
  const templateEditPage = document.getElementById("template-edit-page");
  const templateNameInput = document.getElementById("template-name-input");

  masterPage.classList.remove("active");
  templateEditPage.classList.add("active");

  templateNameInput.value = editingTemplate.name;
  renderChecklistItems();
}

// テンプレートを削除
function deleteTemplate(id) {
  if (confirm("このテンプレートを削除しますか？")) {
    templates = templates.filter((t) => t.id !== id);
    renderTemplateList();
  }
}

// テンプレートを編集
function editTemplate(id) {
  const template = templates.find((t) => t.id === id);
  if (!template) return;

  editingTemplate = { ...template, items: [...template.items] }; // コピーを作成
  isNewTemplate = false;
  currentTemplateId = id;

  const masterPage = document.getElementById("master-page");
  const templateEditPage = document.getElementById("template-edit-page");
  const templateNameInput = document.getElementById("template-name-input");

  masterPage.classList.remove("active");
  templateEditPage.classList.add("active");

  templateNameInput.value = editingTemplate.name;
  renderChecklistItems();
}

// テンプレート編集ページを非表示
function hideTemplateEdit() {
  const masterPage = document.getElementById("master-page");
  const templateEditPage = document.getElementById("template-edit-page");

  templateEditPage.classList.remove("active");
  masterPage.classList.add("active");

  renderTemplateList();
}

// テンプレートを保存
function saveTemplate() {
  if (!editingTemplate) return;

  const templateNameInput = document.getElementById("template-name-input");
  editingTemplate.name = templateNameInput.value || "無題のテンプレート";

  if (isNewTemplate) {
    // 新規テンプレートの場合は配列に追加
    templates.push(editingTemplate);
    nextTemplateId++; // IDをインクリメント
  } else {
    // 既存テンプレートの場合は更新
    const index = templates.findIndex((t) => t.id === currentTemplateId);
    if (index !== -1) {
      templates[index] = editingTemplate;
    }
  }

  // 状態をリセット
  editingTemplate = null;
  isNewTemplate = false;
  currentTemplateId = null;

  hideTemplateEdit();
}

// チェックリスト項目を描画
function renderChecklistItems() {
  if (!editingTemplate) return;

  const container = document.getElementById("checklist-items-edit");
  container.innerHTML = "";

  editingTemplate.items.forEach((item, index) => {
    const itemElement = document.createElement("div");
    itemElement.className = "checklist-item-edit";
    itemElement.dataset.index = index;
    itemElement.innerHTML = `
            <div class="drag-handle">
                <span class="material-symbols-outlined">drag_indicator</span>
            </div>
            <input
                type="text"
                class="item-input"
                value="${item}"
                placeholder="チェック項目を入力"
                onchange="updateChecklistItem(${index}, this.value)"
            />
            <button class="delete-item-btn" onclick="deleteChecklistItem(${index})">
                <span class="material-symbols-outlined">close</span>
            </button>
        `;
    container.appendChild(itemElement);

    // ドラッグ&ドロップイベントを設定
    setupDragAndDrop(itemElement);
  });
}

// チェックリスト項目を追加
function addChecklistItem() {
  if (!editingTemplate) return;

  editingTemplate.items.push(""); // 空の項目を追加
  renderChecklistItems();
}

// チェックリスト項目を更新
function updateChecklistItem(index, value) {
  if (!editingTemplate) return;

  editingTemplate.items[index] = value;
}

// チェックリスト項目を削除
function deleteChecklistItem(index) {
  if (!editingTemplate) return;

  editingTemplate.items.splice(index, 1);
  renderChecklistItems();
}

// ドラッグ&ドロップの設定
let draggedElement = null;

function setupDragAndDrop(element) {
  const dragHandle = element.querySelector(".drag-handle");

  // ドラッグハンドルのみでドラッグを開始
  dragHandle.addEventListener("mousedown", function (e) {
    element.draggable = true;
  });

  element.addEventListener("dragstart", function (e) {
    // ドラッグハンドル以外からのドラッグは無効
    if (!element.draggable) {
      e.preventDefault();
      return;
    }
    draggedElement = this;
    this.classList.add("dragging");
  });

  element.addEventListener("dragend", function (e) {
    this.classList.remove("dragging");
    element.draggable = false; // ドラッグ終了後は無効に
  });

  element.addEventListener("dragover", function (e) {
    e.preventDefault();
    const afterElement = getDragAfterElement(this.parentElement, e.clientY);
    const dragging = document.querySelector(".dragging");
    if (dragging) {
      if (afterElement == null) {
        this.parentElement.appendChild(dragging);
      } else {
        this.parentElement.insertBefore(dragging, afterElement);
      }
    }
  });

  element.addEventListener("drop", function (e) {
    e.preventDefault();
    updateItemOrder();
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [
    ...container.querySelectorAll(".checklist-item-edit:not(.dragging)"),
  ];

  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    },
    { offset: Number.NEGATIVE_INFINITY },
  ).element;
}

function updateItemOrder() {
  if (!editingTemplate) return;

  const container = document.getElementById("checklist-items-edit");
  const itemElements = container.querySelectorAll(".checklist-item-edit");
  const newItems = [];

  itemElements.forEach((element) => {
    const input = element.querySelector(".item-input");
    newItems.push(input.value);
  });

  editingTemplate.items = newItems;
  renderChecklistItems();
}

// 選択されたテンプレートをMTGチェックに反映
function updateChecklistFromTemplate() {
  const template = templates.find((t) => t.id === selectedTemplateId);
  if (!template) return;

  // テンプレート名を更新
  updateTemplateNameDisplay();

  const checklistContainer = document.querySelector(".checklist-container");
  if (!checklistContainer) return;

  checklistContainer.innerHTML = "";

  template.items.forEach((item) => {
    const checklistItem = document.createElement("div");
    checklistItem.className = "checklist-item";
    checklistItem.innerHTML = `
            <div class="checkbox"></div>
            <div class="checklist-text">${item}</div>
        `;
    checklistItem.addEventListener("click", function () {
      this.classList.toggle("checked");
    });
    checklistContainer.appendChild(checklistItem);
  });
}

// テンプレート名を表示
function updateTemplateNameDisplay() {
  const template = templates.find((t) => t.id === selectedTemplateId);
  const titleElement = document.getElementById("mtg-check-title");

  if (template && titleElement) {
    titleElement.textContent = `MTGチェック（${template.name}）`;
  }
}

// ページ読み込み時に選択されたテンプレートを反映
updateChecklistFromTemplate();
