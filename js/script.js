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
 * 單局對局紀錄
 * @typedef {Object} MatchRecord
 * @property {string} id - 對局的唯一識別碼
 * @property {string} timestamp - 對局紀錄的時間字串
 * @property {MatchPlayer[]} players - 參與此局的玩家表現陣列
 */

/**
 * 玩家在單局中的表現
 * @typedef {Object} MatchPlayer
 * @property {string} playerId - 玩家 ID
 * @property {number} scoreDelta - 此局獲得的分數增減量
 * @property {number[]} hands - 此局打出的所有牌型 (對應 HAND_RANKS 的 index 陣列)
 * @property {number} allInCount - 此局 All-In 的次數
 * @property {number} maxPredictionSuccess - 此局的最大預測成功數
 */

/**
 * 應用程式的主要狀態
 * @type {{ players: Player[], matches: MatchRecord[], searchQuery: string }}
 */
const AppState = {
  players: [],
  matches: [],
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
    localStorage.setItem("poker_matches", JSON.stringify(AppState.matches));
  },
  /** 從 LocalStorage 載入資料至 AppState */
  load() {
    const savedPlayers = localStorage.getItem("poker_players");
    const savedMatches = localStorage.getItem("poker_matches");
    if (savedPlayers) AppState.players = JSON.parse(savedPlayers);
    if (savedMatches) AppState.matches = JSON.parse(savedMatches);
  },
  /** 清空 LocalStorage 以及 AppState 資料 */
  clear() {
    localStorage.removeItem("poker_players");
    localStorage.removeItem("poker_matches");
    AppState.players = [];
    AppState.matches = [];
  },
};

/**
 * 負責歷史紀錄管理的模組
 * @namespace
 */
// --- Matches 模組 ---
const MatchesModule = {
  addMatch(matchData) {
    AppState.matches.unshift({
      id: crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
      timestamp: new Date()
        .toLocaleString("zh-TW", { hour12: false })
        .replace(/\//g, "-"),
      players: matchData.players || [],
    });
    PlayersModule.recalculateAllStats();
    StorageModule.save();
    RenderModule.renderAll();
  },
  updateMatch(matchId, matchData) {
    const match = AppState.matches.find((m) => m.id === matchId);
    if (!match) return;
    match.players = matchData.players || [];
    PlayersModule.recalculateAllStats();
    StorageModule.save();
    RenderModule.renderAll();
  },
  deleteMatch(matchId) {
    AppState.matches = AppState.matches.filter((m) => m.id !== matchId);
    PlayersModule.recalculateAllStats();
    StorageModule.save();
    RenderModule.renderAll();
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
  /** 根據所有對局紀錄重新計算全體玩家的數據 */
  recalculateAllStats() {
    // 建立玩家映射以避免重複查找 (O(n) 建表, 後續查詢 O(1))
    const playerMap = new Map();
    AppState.players.forEach((p) => {
      p.score = 0;
      p.maxPredictionSuccess = 0;
      p.topHand1 = 0;
      p.topHand2 = 0;
      p.topHand3 = 0;
      p.allInCount = 0;
      p._allHands = [];
      playerMap.set(p.id, p);
    });

    // 遍歷對局累加到對應玩家 (使用 map 查找)
    for (let i = 0; i < AppState.matches.length; i++) {
      const match = AppState.matches[i];
      const mPlayers = match.players || [];
      for (let j = 0; j < mPlayers.length; j++) {
        const mp = mPlayers[j];
        const player = playerMap.get(mp.playerId);
        if (!player) continue;

        player.score += mp.scoreDelta || 0;
        player.maxPredictionSuccess = Math.max(
          player.maxPredictionSuccess,
          mp.maxPredictionSuccess || 0
        );
        player.allInCount += mp.allInCount || 0;
        if (mp.hands && mp.hands.length) {
          // 直接展開到暫存陣列
          player._allHands.push.apply(player._allHands, mp.hands);
        }
      }
    }

    // 計算前三大牌型（僅對有資料的玩家排序）
    playerMap.forEach((p) => {
      if (p._allHands && p._allHands.length > 0) {
        p._allHands.sort((a, b) => b - a);
        p.topHand1 = p._allHands[0] || 0;
        p.topHand2 = p._allHands[1] || 0;
        p.topHand3 = p._allHands[2] || 0;
      }
      delete p._allHands;
    });
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
    // 回傳依據規則排序的原始玩家陣列（不建立新物件）
    return AppState.players
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
    this.bindEvents();
    StorageModule.load();
    this.renderAll();
  },
  /** 呼叫所有渲染函式以全面更新畫面 */
  renderAll() {
    this.renderRanking();
    this.renderMatches();
  },
  /** 計算並渲染排行榜區塊 */
  renderRanking() {
    const container = document.getElementById("rankingList");
    const sortedPlayers = RankingModule.getSortedPlayers();
    const q = AppState.searchQuery ? AppState.searchQuery.toLowerCase() : "";

    let html = "";
    for (let i = 0; i < sortedPlayers.length; i++) {
      const p = sortedPlayers[i];
      if (q && !p.name.toLowerCase().includes(q)) continue;
      const trueRank = i + 1;
      html += `
        <div class="rank-card">
          <div class="col-rank">
            <span class="rank-number rank-${trueRank}">${trueRank}</span>
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
          <div class="col-actions"></div>
        </div>`;
    }

    container.innerHTML = html || '<div class="empty-state">尚無玩家資料</div>';
  },
  /** 渲染對局紀錄 */
  renderMatches() {
    const container = document.getElementById("matchesContainer");
    if (!AppState.matches || AppState.matches.length === 0) {
      container.innerHTML = '<div class="empty-state">尚無對局紀錄</div>';
      return;
    }

    // 建立玩家名稱快取以避免在每一個 match 中重複查找
    const playerNameMap = new Map();
    for (let i = 0; i < AppState.players.length; i++) {
      const p = AppState.players[i];
      playerNameMap.set(p.id, this.escapeHtml(p.name));
    }

    let html = "";
    for (let idx = 0; idx < AppState.matches.length; idx++) {
      const match = AppState.matches[idx];
      const players = match.players || [];
      const playersHtml = [];
      for (let k = 0; k < players.length; k++) {
        const mp = players[k];
        const name = playerNameMap.get(mp.playerId) || "未知玩家";
        const scoreSign = mp.scoreDelta >= 0 ? "+" : "";
        playersHtml.push(`<span>${name} (${scoreSign}${mp.scoreDelta})</span>`);
      }

      html += `
            <div class="log-item" style="flex-direction: column; align-items: stretch; gap: 8px;">
                <div style="display: flex; justify-content: space-between; width: 100%;">
                    <div class="log-time">[${match.timestamp}] 局數 #${AppState.matches.length - idx}</div>
                    <button class="btn btn-sm btn-secondary" onclick="RenderModule.openMatchModal('${match.id}')">編輯</button>
                </div>
                <div class="log-msg" style="font-size: 0.9em; color: #666;">
                    參與者: ${playersHtml.join(', ') || "無"}
                </div>
            </div>`;
    }

    container.innerHTML = html;
  },
  /** 開啟對局編輯視窗 */
  openMatchModal(matchId = null) {
    const form = document.getElementById("matchForm");
    form.reset();
    document.getElementById("matchPlayersList").innerHTML = "";
    document.getElementById("editMatchId").value = matchId || "";
    document.getElementById("matchModalTitle").textContent = matchId ? "編輯對局" : "新增對局";

    // 渲染下拉選單
    const selector = document.getElementById("playerSelector");
    selector.innerHTML = '<option value="">-- 加入玩家至本局 --</option>' + 
      AppState.players.map(p => `<option value="${p.id}">${this.escapeHtml(p.name)}</option>`).join("");

    if (matchId) {
      const match = AppState.matches.find(m => m.id === matchId);
      if (match && match.players) {
        match.players.forEach(mp => this.addPlayerToMatchForm(mp));
      }
    }

    document.getElementById("matchModal").classList.add("active");
  },
  /** 將玩家欄位加入到對局表單 */
  addPlayerToMatchForm(matchPlayer = null) {
    const selector = document.getElementById("playerSelector");
    let playerId = matchPlayer ? matchPlayer.playerId : selector.value;
    
    if (!playerId) return;

    const player = AppState.players.find(p => p.id === playerId);
    if (!player) return;

    // 檢查是否已加入
    if (document.querySelector(`.match-player-row[data-player-id="${playerId}"]`)) {
      alert("該玩家已在清單中！");
      return;
    }

    const handsOptions = HAND_RANKS.map((hand, index) => `<option value="${index}">${hand}</option>`).join("");
    
    const row = document.createElement("div");
    row.className = "match-player-row";
    row.dataset.playerId = playerId;
    
    const handsArr = matchPlayer && matchPlayer.hands ? matchPlayer.hands : [];
    
    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
        <div style="font-weight: 700; font-size: 16px; color: var(--color-primary);">${this.escapeHtml(player.name)}</div>
        <button type="button" class="btn btn-danger btn-sm" onclick="this.closest('.match-player-row').remove()">移除</button>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px;">
        <div>
          <label class="mp-label">得分增減</label>
          <input type="number" class="mp-score input" value="${matchPlayer ? matchPlayer.scoreDelta : 0}" required>
        </div>
        <div>
          <label class="mp-label">本局牌型 (必選3個)</label>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <select class="mp-hand1 input">${handsOptions}</select>
            <select class="mp-hand2 input">${handsOptions}</select>
            <select class="mp-hand3 input">${handsOptions}</select>
          </div>
        </div>
        <div>
          <label class="mp-label">All-In 次數</label>
          <input type="number" class="mp-allin input" value="${matchPlayer ? matchPlayer.allInCount : 0}" min="0" required>
        </div>
        <div>
          <label class="mp-label">最大預測成功</label>
          <input type="number" class="mp-prediction input" value="${matchPlayer ? matchPlayer.maxPredictionSuccess : 0}" min="0" required>
        </div>
      </div>
    `;

    document.getElementById("matchPlayersList").appendChild(row);

    // 預先選中牌型
    if (handsArr.length > 0) {
      if(handsArr[0] !== undefined) row.querySelector('.mp-hand1').value = handsArr[0];
      if(handsArr[1] !== undefined) row.querySelector('.mp-hand2').value = handsArr[1];
      if(handsArr[2] !== undefined) row.querySelector('.mp-hand3').value = handsArr[2];
    }

    selector.value = "";
  },
  /** 儲存對局表單資料 */
  saveMatchForm() {
    try {
      const matchId = document.getElementById("editMatchId").value;
      const playerRows = document.querySelectorAll(".match-player-row");
      
      const playersData = Array.from(playerRows).map(row => {
        const h1 = parseInt(row.querySelector('.mp-hand1').value) || 0;
        const h2 = parseInt(row.querySelector('.mp-hand2').value) || 0;
        const h3 = parseInt(row.querySelector('.mp-hand3').value) || 0;
        
        return {
          playerId: row.dataset.playerId,
          scoreDelta: parseInt(row.querySelector('.mp-score').value) || 0,
          hands: [h1, h2, h3],
          allInCount: Math.max(0, parseInt(row.querySelector('.mp-allin').value) || 0),
          maxPredictionSuccess: Math.max(0, parseInt(row.querySelector('.mp-prediction').value) || 0)
        };
      });

      if (matchId) {
        MatchesModule.updateMatch(matchId, { players: playersData });
      } else {
        MatchesModule.addMatch({ players: playersData });
      }
    } catch (err) {
      console.error(err);
      alert("儲存對局發生錯誤：" + err.message);
    }
  },
  /** 關閉對局視窗 */
  closeMatchModal() {
    document.getElementById("matchModal").classList.remove("active");
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
    // 搜尋（使用 debounce 減少重複渲染）
    const searchEl = document.getElementById("searchInput");
    let _searchTimer = null;
    searchEl.addEventListener("input", (e) => {
      AppState.searchQuery = e.target.value;
      if (_searchTimer) clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        this.renderRanking();
        _searchTimer = null;
      }, 160);
    });

    // 新增對局按鈕
    document.getElementById("addMatchBtn")?.addEventListener("click", () => {
      this.openMatchModal();
    });

    // Modal 操作
    document
      .getElementById("closeMatchModalBtn")
      .addEventListener("click", () => this.closeMatchModal());
    document
      .getElementById("cancelMatchEditBtn")
      .addEventListener("click", () => this.closeMatchModal());

    document.getElementById("addPlayerToMatchBtn").addEventListener("click", () => {
      this.addPlayerToMatchForm();
    });

    document.getElementById("saveMatchBtn").addEventListener("click", () => {
      this.saveMatchForm();
      this.closeMatchModal();
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
          if (data.players && data.matches) {
            AppState.players = data.players;
            AppState.matches = data.matches;
            StorageModule.save();
            this.renderAll();
          } else if (data.players && data.logs) {
             // 兼容舊資料架構
            AppState.players = data.players;
            AppState.matches = [];
            StorageModule.save();
            this.renderAll();
            alert("匯入成功，但舊版操作紀錄已失效，已清空對局記錄。");
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
