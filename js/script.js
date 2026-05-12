/**
 * 撲克牌型等級 (索引值越大代表牌型越大)
 * @constant {string[]}
 */
const HAND_RANKS = [
  "烏龍",
  "一對",
  "兩對",
  "三條",
  "葫蘆",
  "同花",
  "順子",
  "鐵支",
  "同花順",
];

/**
 * @typedef {Object} Player
 * @property {string} id - 玩家唯一識別碼
 * @property {string} name - 玩家名稱
 * @property {number} score - 玩家積分
 * @property {number} maxPredictionSuccess - 最高預測成功次數
 * @property {number} topHand1 - 第一大牌型 (對應 HAND_RANKS 索引)
 * @property {number} topHand2 - 第二大牌型
 * @property {number} topHand3 - 第三大牌型
 * @property {number} allInCount - All-in 次數
 * @property {number} checkInOrder - 報到順序
 */

/**
 * @typedef {Object} LogEntry
 * @property {string} time - 紀錄時間字串
 * @property {string} message - 紀錄內容訊息
 */

/**
 * 應用程式的主要狀態
 * @type {{ players: Player[], logs: LogEntry[], searchQuery: string }}
 */
const AppState = {
  players: [],
  logs: [],
  searchQuery: "",
};

/**
 * 處理 LocalStorage 資料存取的模組
 * @namespace
 */
// --- Storage 模組 ---
const StorageModule = {
  /** 將玩家陣列與歷史紀錄儲存至 LocalStorage */
  save() {
    localStorage.setItem("poker_players", JSON.stringify(AppState.players));
    localStorage.setItem("poker_logs", JSON.stringify(AppState.logs));
  },
  /** 從 LocalStorage 載入資料至 AppState */
  load() {
    const savedPlayers = localStorage.getItem("poker_players");
    const savedLogs = localStorage.getItem("poker_logs");
    if (savedPlayers) AppState.players = JSON.parse(savedPlayers);
    if (savedLogs) AppState.logs = JSON.parse(savedLogs);
  },
  /** 清空 LocalStorage 以及 AppState 資料 */
  clear() {
    localStorage.removeItem("poker_players");
    localStorage.removeItem("poker_logs");
    AppState.players = [];
    AppState.logs = [];
  },
};

/**
 * 負責歷史紀錄管理的模組
 * @namespace
 */
// --- Logs 模組 ---
const LogsModule = {
  /**
   * 新增一筆變更紀錄
   * @param {string} playerName - 玩家名稱
   * @param {string} field - 修改的欄位標籤
   * @param {number|string} oldValue - 變更前數值
   * @param {number|string} newValue - 變更后數值大
   */
  add(playerName, field, oldValue, newValue) {
    if (oldValue === newValue) return;

    const timeStr = new Date()
      .toLocaleString("zh-TW", { hour12: false })
      .replace(/\//g, "-");
    const isHand = field.includes("牌型");
    const format = (v) => (isHand ? HAND_RANKS[v] || "None" : v);

    AppState.logs.unshift({
      time: timeStr,
      message: `${playerName} 的 ${field}: ${format(oldValue)} → ${format(newValue)}`,
    });

    StorageModule.save();
    RenderModule.renderLogs();
  },
};

/**
 * 負責玩家資料處理的模組
 * @namespace
 */
// --- Players 模組 ---
const PlayersModule = {
  /**
   * 批次解析文字輸入並新增玩家
   * @param {string} text - 以換行分隔的玩家名稱字串
   */
  initFromText(text) {
    const names = text
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);
    if (!names.length) return;

    const currentCount = AppState.players.length;
    const existingNames = new Set(AppState.players.map((p) => p.name));

    names.forEach((name, index) => {
      if (existingNames.has(name)) return;

      AppState.players.push({
        id: crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
        name,
        score: 0,
        maxPredictionSuccess: 0,
        topHand1: 0,
        topHand2: 0,
        topHand3: 0,
        allInCount: 0,
        checkInOrder: currentCount + index + 1,
      });
      existingNames.add(name);
    });

    StorageModule.save();
    RenderModule.renderAll();
  },
  /**
   * 更新指定玩家的屬性
   * @param {string} id - 玩家識別碼
   * @param {Partial<Player>} updates - 要更新的玩家資料屬性
   */
  updatePlayer(id, updates) {
    const player = AppState.players.find((p) => p.id === id);
    if (!player) return;

    const fieldsToTrack = {
      score: "分數",
      maxPredictionSuccess: "最高預測",
      topHand1: "第一牌型",
      topHand2: "第二牌型",
      topHand3: "第三牌型",
      allInCount: "All-in 次數",
    };

    let isUpdated = false;
    for (const [key, label] of Object.entries(fieldsToTrack)) {
      if (updates[key] !== undefined && updates[key] !== player[key]) {
        LogsModule.add(player.name, label, player[key], updates[key]);
        player[key] = updates[key];
        isUpdated = true;
      }
    }

    if (isUpdated) {
      StorageModule.save();
      RenderModule.renderAll();
    }
  },
};

/**
 * 負責計算玩家排名的模組
 * @namespace
 */
// --- Ranking 模組 ---
const RankingModule = {
  /**
   * 取得套用搜尋過濾及排名規則排序後的玩家陣列
   * @returns {Player[]} 排序後的玩家資料
   */
  getSortedPlayers() {
    // 1. 確保先排序所有玩家，賦予真實絕對排名
    let sortedList = AppState.players
      .slice()
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.maxPredictionSuccess - a.maxPredictionSuccess ||
          b.topHand1 - a.topHand1 ||
          b.topHand2 - a.topHand2 ||
          b.topHand3 - a.topHand3 ||
          b.allInCount - a.allInCount ||
          a.checkInOrder - b.checkInOrder,
      );

    // 將真實排名寫入物件中
    sortedList = sortedList.map((p, index) => ({ ...p, _trueRank: index + 1 }));

    // 2. 搜尋過濾 (保留原本的真實排名)
    if (AppState.searchQuery) {
      const q = AppState.searchQuery.toLowerCase();
      sortedList = sortedList.filter((p) => p.name.toLowerCase().includes(q));
    }

    return sortedList;
  },
};

/**
 * 負責所有 DOM 渲染與事件綁定的模組
 * @namespace
 */
// --- Render 模組 ---
const RenderModule = {
  /** 初始化整個應用程式 */
  init() {
    this.renderSelectOptions();
    this.bindEvents();
    StorageModule.load();
    this.renderAll();
  },
  /** 動態生成 HTML 靜態選單 */
  renderSelectOptions() {
    const selects = ["editTopHand1", "editTopHand2", "editTopHand3"];
    // 預先產生 HTML 字串，減少 DOM 操作次數
    const optionsHtml = HAND_RANKS.map(
      (hand, index) => `<option value="${index}">${hand}</option>`,
    ).join("");

    selects.forEach((id) => {
      document.getElementById(id).innerHTML = optionsHtml;
    });
  },
  /** 呼叫所有渲染函式以全面更新畫面 */
  renderAll() {
    this.renderRanking();
    this.renderLogs();
  },
  /** 計算並渲染排行榜區塊 */
  renderRanking() {
    const container = document.getElementById("rankingList");
    const players = RankingModule.getSortedPlayers();

    container.innerHTML =
      players
        .map(
          (p) => `
            <div class="rank-card">
                <div class="col-rank">
                    <span class="rank-number rank-${p._trueRank}">${p._trueRank}</span>
                </div>
                <div class="col-name">${this.escapeHtml(p.name)}</div>
                <div class="col-score text-highlight">${p.score}</div>
                <div class="col-stats">
                    <div class="stat-badge tooltip" data-tip="預測成功次數">🎯 ${p.maxPredictionSuccess}</div>
                    <div class="stat-badge tooltip" data-tip="第一牌型">🃏 ${HAND_RANKS[p.topHand1] || "-"}</div>
                    <div class="stat-badge tooltip" data-tip="第二牌型">🃏 ${HAND_RANKS[p.topHand2] || "-"}</div>
                    <div class="stat-badge tooltip" data-tip="第三牌型">🃏 ${HAND_RANKS[p.topHand3] || "-"}</div>
                    <div class="stat-badge tooltip" data-tip="All-in 次數">🎰 ${p.allInCount}</div>
                    <div class="stat-detail">報到順序 #${p.checkInOrder}</div>
                </div>
                <div class="col-actions">
                    <button class="btn btn-sm btn-secondary" onclick="RenderModule.openEditModal('${p.id}')">編輯</button>
                </div>
            </div>
        `,
        )
        .join("") || '<div class="empty-state">尚無玩家資料</div>';
  },
  /** 渲染操作與歷史變更記錄 */
  renderLogs() {
    const container = document.getElementById("logsContainer");
    container.innerHTML =
      AppState.logs
        .map(
          (log) => `
            <div class="log-item">
                <div class="log-time">[${log.time}]</div>
                <div class="log-msg">${this.escapeHtml(log.message)}</div>
            </div>
        `,
        )
        .join("") || '<div class="empty-state">尚無紀錄</div>';
  },
  /**
   * 開啟玩家資料的編輯視窗並填入初始值
   * @param {string} id - 目標玩家 ID
   */
  openEditModal(id) {
    const player = AppState.players.find((p) => p.id === id);
    if (!player) return;

    const setVal = (elmId, value) => {
      document.getElementById(elmId).value = value;
    };
    document.getElementById("modalTitle").textContent = `編輯: ${player.name}`;

    setVal("editPlayerId", player.id);
    setVal("editScore", player.score);
    setVal("editMaxPrediction", player.maxPredictionSuccess);
    setVal("editTopHand1", player.topHand1);
    setVal("editTopHand2", player.topHand2);
    setVal("editTopHand3", player.topHand3);
    setVal("editAllIn", player.allInCount);

    document.getElementById("editModal").classList.add("active");
  },
  /** 關閉編輯視窗 */
  closeModal() {
    document.getElementById("editModal").classList.remove("active");
  },
  /**
   * 字串消毒，防止 XSS 攻擊
   * @param {string|number} unsafe - 可能包含不安全字元的字串或數字
   * @returns {string} 脫逸後的安全字串
   */
  escapeHtml(unsafe) {
    return (unsafe || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },
  /** 統一綁定應用程式中所有的 DOM 事件 */
  bindEvents() {
    // 初始化名單
    document.getElementById("initBtn").addEventListener("click", () => {
      const textarea = document.getElementById("initNames");
      PlayersModule.initFromText(textarea.value);
      textarea.value = "";
    });

    // 搜尋
    document.getElementById("searchInput").addEventListener("input", (e) => {
      AppState.searchQuery = e.target.value;
      this.renderRanking();
    });

    // Modal 操作
    document
      .getElementById("closeModalBtn")
      .addEventListener("click", () => this.closeModal());
    document
      .getElementById("cancelEditBtn")
      .addEventListener("click", () => this.closeModal());

    document.getElementById("saveEditBtn").addEventListener("click", () => {
      const id = document.getElementById("editPlayerId").value;
      const getVal = (elmId) =>
        parseInt(document.getElementById(elmId).value) || 0;

      PlayersModule.updatePlayer(id, {
        score: getVal("editScore"),
        maxPredictionSuccess: getVal("editMaxPrediction"),
        topHand1: getVal("editTopHand1"),
        topHand2: getVal("editTopHand2"),
        topHand3: getVal("editTopHand3"),
        allInCount: getVal("editAllIn"),
      });
      this.closeModal();
    });

    // 資料操作
    document.getElementById("resetBtn").addEventListener("click", () => {
      if (confirm("確定要清空所有資料嗎？此動作無法復原！")) {
        StorageModule.clear();
        this.renderAll();
      }
    });

    document.getElementById("exportBtn").addEventListener("click", () => {
      const dataStr =
        "data:text/json;charset=utf-8," +
        encodeURIComponent(JSON.stringify(AppState));
      const downloadAnchorNode = document.createElement("a");
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute(
        "download",
        "poker_tournament_export.json",
      );
      document.body.appendChild(downloadAnchorNode); // required for firefox
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    });

    document.getElementById("importFile").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (data.players && data.logs) {
            AppState.players = data.players;
            AppState.logs = data.logs;
            StorageModule.save();
            this.renderAll();
          } else {
            alert("無效的檔案格式");
          }
        } catch (err) {
          alert("讀取檔案失敗");
        }
      };
      reader.readAsText(file);
      e.target.value = ""; // 允許重複匯入同檔
    });
  },
};

// 啟動應用程式
document.addEventListener("DOMContentLoaded", () => {
  RenderModule.init();
});
