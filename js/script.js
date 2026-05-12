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
  "順子",
  "同花",
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
    
    // 優化: 使用 toLocaleString 簡化時間格式處理
    const timeStr = new Date().toLocaleString("zh-TW", { hour12: false }).replace(/\//g, '-');

    // 判斷是否為牌型欄位，以對應正確顯示文字
    const isHandField = field.includes("topHand") || field.includes("牌型");
    const oldDisplay = isHandField ? (HAND_RANKS[oldValue] || "None") : oldValue;
    const newDisplay = isHandField ? (HAND_RANKS[newValue] || "None") : newValue;

    AppState.logs.unshift({
      time: timeStr,
      message: `${playerName} 的 ${field}: ${oldDisplay} → ${newDisplay}`,
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
      .filter(Boolean); // 優化: 直接利用 Boolean 過濾空字串

    if (names.length === 0) return;

    const currentCount = AppState.players.length;
    // 優化: 使用 Set 來追蹤現有名稱，將重複檢查的時間複雜度降為 O(1)
    const existingNames = new Set(AppState.players.map((p) => p.name));

    names.forEach((name, index) => {
      if (!existingNames.has(name)) {
        AppState.players.push({
          id: self.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2),
          name: name,
          score: 0,
          maxPredictionSuccess: 0,
          topHand1: 0,
          topHand2: 0,
          topHand3: 0,
          allInCount: 0,
          checkInOrder: currentCount + index + 1,
        });
        existingNames.add(name);
      }
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

    // 將資料庫鍵名對應到要顯示的欄位標籤，讓紀錄更直覺
    const fieldsToTrack = {
      score: "積分",
      maxPredictionSuccess: "最高預測成功",
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
    let list = AppState.players;

    // 搜尋過濾
    if (AppState.searchQuery) {
      const q = AppState.searchQuery.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }

    // 優化: 利用 || 的短路特性與 slice() 淺拷貝進行多條件排序，寫法更簡潔
    return list.slice().sort((a, b) => 
      (b.score - a.score) ||
      (b.maxPredictionSuccess - a.maxPredictionSuccess) ||
      (b.topHand1 - a.topHand1) ||
      (b.topHand2 - a.topHand2) ||
      (b.topHand3 - a.topHand3) ||
      (b.allInCount - a.allInCount) ||
      (a.checkInOrder - b.checkInOrder)
    );
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
          (p, index) => `
            <div class="rank-card">
                <div class="col-rank">
                    <span class="rank-number rank-${index + 1}">${index + 1}</span>
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

    document.getElementById("modalTitle").textContent = `編輯: ${player.name}`;
    document.getElementById("editPlayerId").value = player.id;
    document.getElementById("editScore").value = player.score;
    document.getElementById("editMaxPrediction").value =
      player.maxPredictionSuccess;
    document.getElementById("editTopHand1").value = player.topHand1;
    document.getElementById("editTopHand2").value = player.topHand2;
    document.getElementById("editTopHand3").value = player.topHand3;
    document.getElementById("editAllIn").value = player.allInCount;

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
      PlayersModule.updatePlayer(id, {
        score: parseInt(document.getElementById("editScore").value) || 0,
        maxPredictionSuccess:
          parseInt(document.getElementById("editMaxPrediction").value) || 0,
        topHand1: parseInt(document.getElementById("editTopHand1").value) || 0,
        topHand2: parseInt(document.getElementById("editTopHand2").value) || 0,
        topHand3: parseInt(document.getElementById("editTopHand3").value) || 0,
        allInCount: parseInt(document.getElementById("editAllIn").value) || 0,
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
