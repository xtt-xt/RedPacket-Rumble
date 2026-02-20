(function() {
    // ---------- 配置 ----------
    const MY_NAME = '我';
    const SIM_USERS = ['小明', '小红', '小刚', '李华', '小丽', '阿强'];
    const ALL_USERS = [MY_NAME, ...SIM_USERS];

    const BLESSINGS = [
        '恭喜发财，大吉大利',
        '万事如意，心想事成',
        '好运连连，身体健康',
        '财源广进，阖家欢乐',
        '年年有余，岁岁平安',
        '笑口常开，好运自来'
    ];

    let myBalance = 100.0;
    let messages = [];
    let redPackets = new Map();
    let lastRedPacketTime = Date.now();
    let activeFactor = 1.0;
    let recentRedpacketAmounts = [];
    let grabIntervals = new Map();

    // 规则相关
    let keywordRules = [];
    let rulesLoaded = false;

    const STORAGE_KEY = 'hongbao2025';

    // DOM
    const messageArea = document.getElementById('messageArea');
    const balanceSpan = document.getElementById('balanceDisplay');
    const modal = document.getElementById('redpacketModal');
    const openResultModal = document.getElementById('openResultModal');
    const dynamicContent = document.getElementById('dynamicRedpacketContent');
    const activeStatus = document.getElementById('activeStatus');
    const importFileInput = document.getElementById('importFile');
    const exportOptionsModal = document.getElementById('exportOptionsModal');
    const exportMsgCount = document.getElementById('exportMsgCount');
    const exportKeepDetails = document.getElementById('exportKeepDetails');

    // ----- 新增：粘贴导入模态框（动态创建）-----
    const pasteModal = document.createElement('div');
    pasteModal.className = 'modal';
    pasteModal.id = 'pasteImportModal';
    pasteModal.innerHTML = `
        <div class="modal-card">
            <h3>📋 粘贴加密存档</h3>
            <textarea id="pasteArchiveText" rows="6" placeholder="请将加密文本粘贴到这里..." style="width:100%; padding:12px; border-radius:16px; border:1px solid #ddd; margin:16px 0; resize:vertical;"></textarea>
            <div class="modal-actions">
                <button class="btn-secondary" id="cancelPaste">取消</button>
                <button class="btn-primary" id="confirmPaste">确认导入</button>
            </div>
        </div>
    `;
    document.body.appendChild(pasteModal);

    // 新增粘贴按钮到 header（放在导入按钮旁边）
    const headerActions = document.querySelector('.header-actions');
    const pasteBtn = document.createElement('button');
    pasteBtn.className = 'icon-btn';
    pasteBtn.id = 'pasteBtn';
    pasteBtn.title = '粘贴导入';
    pasteBtn.innerText = '📋';
    headerActions.appendChild(pasteBtn);

    // ----- 辅助函数 -----
    function updateBalanceUI() {
        balanceSpan.innerText = myBalance.toFixed(2);
        balanceSpan.classList.add('balance-update');
        setTimeout(() => balanceSpan.classList.remove('balance-update'), 200);
    }

    function formatTime(timestamp) {
        const d = new Date(timestamp);
        return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    }

    function shouldInsertTimeSeparator(prevTime, currentTime) {
        if (!prevTime) return true;
        return (currentTime - prevTime) > 10 * 60 * 1000;
    }

    function addSystemMessage(text) {
        messages.push({
            id: 'sys_' + Date.now() + Math.random(),
            type: 'system',
            time: Date.now(),
            content: text
        });
        renderMessages();
        saveToLocalStorage();
    }

    function addTextMessage(sender, content) {
        messages.push({
            id: 'msg_' + Date.now() + Math.random(),
            type: 'text',
            sender: sender,
            time: Date.now(),
            content: content
        });
        renderMessages();
        saveToLocalStorage();

        // 只有“我”的发言才触发机器人回复，80%概率
        if (sender === MY_NAME && SIM_USERS.length > 0 && rulesLoaded) {
            setTimeout(() => {
                if (Math.random() < 0.8) {
                    const userMessage = content;
                    let matchedReply = null;

                    for (let rule of keywordRules) {
                        const { keywords, matchType, replies } = rule;
                        let match = false;

                        if (matchType === 'exact') {
                            if (keywords.length === 1 && userMessage === keywords[0]) {
                                match = true;
                            }
                        } else if (matchType === 'all') {
                            match = keywords.every(kw => userMessage.includes(kw));
                        } else {
                            match = keywords.some(kw => userMessage.includes(kw));
                        }

                        if (match) {
                            matchedReply = replies[Math.floor(Math.random() * replies.length)];
                            break;
                        }
                    }

                    if (!matchedReply) {
                        const defaultReplies = ['哈哈', '真的吗', '有意思', '👍', '嗯嗯', '对呀'];
                        matchedReply = defaultReplies[Math.floor(Math.random() * defaultReplies.length)];
                    }

                    const replier = SIM_USERS[Math.floor(Math.random() * SIM_USERS.length)];
                    addTextMessage(replier, matchedReply);
                }
            }, 1200 + Math.random() * 2000);
        }
    }

    // 执行抢红包逻辑
    function performGrab(rpId, grabber) {
        const rp = redPackets.get(rpId);
        if (!rp) return null;
        if (rp.remainingCount <= 0) return null;
        if (rp.grabbedUsers.includes(grabber)) return null;

        let amount;
        if (rp.remainingCount === 1) {
            amount = rp.remainingAmount;
        } else {
            const avg = rp.remainingAmount / rp.remainingCount;
            const max = avg * 2;
            amount = Math.random() * max;
            amount = Math.max(0.01, amount);
            amount = Math.round(amount * 100) / 100;
            if ((rp.remainingAmount - amount) < 0.01 * (rp.remainingCount - 1)) {
                amount = rp.remainingAmount - 0.01 * (rp.remainingCount - 1);
                amount = Math.round(amount * 100) / 100;
            }
        }

        rp.remainingAmount = Math.round((rp.remainingAmount - amount) * 100) / 100;
        rp.remainingCount--;
        rp.grabbedUsers.push(grabber);
        rp.grabbedDetails.push({ user: grabber, amount });

        if (grabber === MY_NAME) {
            myBalance += amount;
            updateBalanceUI();
        }

        if (!(rp.totalCount === 1 && grabber === rp.sender)) {
            lastRedPacketTime = Date.now();
        }

        const senderName = rp.sender;
        if (grabber === MY_NAME) {
            addSystemMessage(`你领取了${senderName}的红包💰${amount.toFixed(2)}元`);
        } else {
            addSystemMessage(`${grabber}领取了${senderName}的红包`);
        }

        if (rp.remainingCount === 0) {
            let bestUser = '', bestAmount = -1;
            rp.grabbedDetails.forEach(d => {
                if (d.amount > bestAmount) { bestAmount = d.amount; bestUser = d.user; }
            });
            addSystemMessage(`恭喜${bestUser}手气最佳，获得${bestAmount.toFixed(2)}元`);
            if (grabIntervals.has(rpId)) {
                clearInterval(grabIntervals.get(rpId));
                grabIntervals.delete(rpId);
            }
        }

        renderMessages();
        saveToLocalStorage();
        return amount;
    }

    // 展示红包封面
    function showRedpacketCover(rpId) {
        const rp = redPackets.get(rpId);
        if (!rp) return;

        if (rp.grabbedUsers.includes(MY_NAME) || rp.remainingCount === 0) {
            showFullResult(rpId);
            return;
        }

        const blessing = rp.blessing || '恭喜发财，大吉大利';
        dynamicContent.innerHTML = `
            <div class="redpacket-cover">
                <div class="cover-sender">${rp.sender} 的红包</div>
                <div class="cover-message">${blessing}</div>
                <div class="cover-open-btn" id="coverOpenBtn">开</div>
                <div style="margin-top: 20px; font-size: 14px; color: #fcd28c;">${rp.totalCount}个红包</div>
            </div>
        `;
        openResultModal.classList.add('show');

        document.getElementById('coverOpenBtn').addEventListener('click', function onClick() {
            const amount = performGrab(rpId, MY_NAME);
            showFullResult(rpId);
        }, { once: true });
    }

    function showFullResult(rpId) {
        const rp = redPackets.get(rpId);
        if (!rp) return;

        let itemsHtml = '';
        const sorted = [...rp.grabbedDetails].sort((a, b) => b.amount - a.amount);
        const bestAmount = sorted.length > 0 ? sorted[0].amount : 0;

        sorted.forEach(d => {
            const isBest = d.amount === bestAmount && bestAmount > 0;
            itemsHtml += `<div class="list-item">
                <span>${d.user} ${isBest ? '<span class="best-flag">🏆手气最佳</span>' : ''}</span>
                <span class="my-amount">${d.amount.toFixed(2)}元</span>
            </div>`;
        });

        dynamicContent.innerHTML = `
            <div class="redpacket-result">
                <div class="result-header">${rp.sender} 的红包 · ${rp.blessing || '恭喜发财，大吉大利'}</div>
                <div class="grabbed-list">
                    ${itemsHtml || '<p style="text-align:center; color:#aaa;">暂无人领取</p>'}
                </div>
                <button class="close-result" id="closeResultBtn">关闭</button>
            </div>
        `;
        openResultModal.classList.add('show');
        document.getElementById('closeResultBtn').addEventListener('click', () => {
            openResultModal.classList.remove('show');
        });
    }

    function addRedpacket(sender, amount, count, blessing = '恭喜发财，大吉大利') {
        if (amount < 0.01) return false;
        if (count < 1 || count > 6) return false;
        if (sender === MY_NAME && amount > myBalance) {
            alert('余额不足');
            return false;
        }

        const available = ALL_USERS.filter(u => u !== sender).length;
        if (count > available) {
            alert(`当前最多${available}人可抢`);
            return false;
        }

        if (sender === MY_NAME) {
            myBalance -= amount;
            updateBalanceUI();
        }

        const rpId = 'rp_' + Date.now() + '_' + Math.random().toString(36);
        const newRp = {
            id: rpId,
            sender,
            totalAmount: amount,
            totalCount: count,
            remainingAmount: amount,
            remainingCount: count,
            grabbedUsers: [],
            grabbedDetails: [],
            blessing: blessing.trim() || '恭喜发财，大吉大利'
        };
        redPackets.set(rpId, newRp);

        messages.push({
            id: 'msg_' + Date.now(),
            type: 'redpacket',
            sender,
            time: Date.now(),
            redpacketId: rpId
        });

        recentRedpacketAmounts.push(amount);
        if (recentRedpacketAmounts.length > 5) recentRedpacketAmounts.shift();

        lastRedPacketTime = Date.now();
        updateActiveFactor();

        startAutoGrab(rpId);
        renderMessages();
        saveToLocalStorage();
        return true;
    }

    function startAutoGrab(rpId) {
        const rp = redPackets.get(rpId);
        if (!rp) return;
        const interval = setInterval(() => {
            const curRp = redPackets.get(rpId);
            if (!curRp || curRp.remainingCount <= 0) {
                clearInterval(interval);
                grabIntervals.delete(rpId);
                return;
            }
            const ungrabbedSims = SIM_USERS.filter(u => u !== curRp.sender && !curRp.grabbedUsers.includes(u));
            if (ungrabbedSims.length === 0) return;

            const randomSim = ungrabbedSims[Math.floor(Math.random() * ungrabbedSims.length)];
            performGrab(rpId, randomSim);
        }, 1500 + Math.random() * 2000);
        grabIntervals.set(rpId, interval);
    }

    function robotSendRedpacket() {
        if (SIM_USERS.length === 0) return;
        const sender = SIM_USERS[Math.floor(Math.random() * SIM_USERS.length)];

        let baseAmount = 2.0;
        if (recentRedpacketAmounts.length > 0) {
            const avgRecent = recentRedpacketAmounts.reduce((a,b)=>a+b,0) / recentRedpacketAmounts.length;
            baseAmount = Math.min(10, Math.max(0.5, avgRecent * 1.2));
        }
        let amount = baseAmount * (0.6 + 0.8 * Math.random()) * activeFactor;
        amount = Math.round(amount * 100) / 100;
        if (Math.random() < 0.2) amount = Math.round((0.2 + Math.random() * 0.5) * 100) / 100;

        const available = ALL_USERS.filter(u => u !== sender).length;
        let count = Math.floor(Math.random() * available) + 1;
        const blessing = BLESSINGS[Math.floor(Math.random() * BLESSINGS.length)];
        addRedpacket(sender, amount, count, blessing);
    }

    function updateActiveFactor() {
        const now = Date.now();
        const diffSec = (now - lastRedPacketTime) / 1000;
        if (diffSec <= 20) activeFactor = 1.0;
        else if (diffSec >= 70) activeFactor = 0.2;
        else activeFactor = 1.0 - 0.8 * ((diffSec - 20) / 50);
        activeFactor = Math.min(1, Math.max(0.2, activeFactor));
        if (activeFactor > 0.75) activeStatus.innerText = '🔥活跃';
        else if (activeFactor > 0.4) activeStatus.innerText = '🙂平静';
        else activeStatus.innerText = '💤冷清';
    }

    function escapeHtml(unsafe) {
        return unsafe.replace(/[&<>"]/g, function(m) {
            if (m === '&') return '&amp;'; if (m === '<') return '&lt;'; if (m === '>') return '&gt;'; if (m === '"') return '&quot;';
            return m;
        });
    }

    function renderMessages() {
        let html = '';
        let lastMsgTime = null;

        messages.forEach((msg) => {
            const currentTime = msg.time;
            if (shouldInsertTimeSeparator(lastMsgTime, currentTime)) {
                html += `<div class="time-separator">${formatTime(currentTime)}</div>`;
            }
            lastMsgTime = currentTime;

            if (msg.type === 'system') {
                html += `<div class="system-message">${msg.content}</div>`;
            } else if (msg.type === 'text') {
                const isMe = msg.sender === MY_NAME;
                const avatarLetter = msg.sender.charAt(0);
                html += `<div class="message-row ${isMe ? 'me' : ''}">
                    <div class="avatar">${avatarLetter}</div>
                    <div class="message-bubble-wrapper">
                        ${!isMe ? `<div class="sender-name">${msg.sender}</div>` : ''}
                        <div class="message-bubble">
                            <div>${escapeHtml(msg.content)}</div>
                        </div>
                    </div>
                </div>`;
            } else if (msg.type === 'redpacket') {
                const rp = redPackets.get(msg.redpacketId);
                if (!rp) return;
                const isMe = msg.sender === MY_NAME;
                const avatarLetter = msg.sender.charAt(0);
                const blessing = rp.blessing || '恭喜发财，大吉大利';
                html += `<div class="message-row ${isMe ? 'me' : ''}">
                    <div class="avatar">${avatarLetter}</div>
                    <div class="message-bubble-wrapper">
                        ${!isMe ? `<div class="sender-name">${msg.sender}</div>` : ''}
                        <div class="message-bubble" style="background: transparent; box-shadow: none; padding: 0;">
                            <div class="redpacket-card" data-rp-id="${msg.redpacketId}">
                                <div class="redpacket-icon">🧧</div>
                                <div class="redpacket-info">
                                    <div class="redpacket-title">${blessing}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
            }
        });
        messageArea.innerHTML = html;
        messageArea.scrollTop = messageArea.scrollHeight;

        document.querySelectorAll('.redpacket-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const rpId = card.dataset.rpId;
                const rp = redPackets.get(rpId);
                if (!rp) return;
                showRedpacketCover(rpId);
            });
        });
    }

    // ----- 加载外部规则文件 -----
    async function loadRules() {
        try {
            const response = await fetch('./rules.json');
            if (!response.ok) throw new Error('规则文件不存在');
            let rules = await response.json();
            keywordRules = rules.map(rule => {
                let keywords = rule.keyword;
                if (!Array.isArray(keywords)) {
                    keywords = [keywords];
                }
                const matchType = rule.matchType || 'any';
                return {
                    keywords: keywords,
                    matchType: matchType,
                    replies: rule.replies
                };
            });
            console.log('规则加载成功', keywordRules);
        } catch (error) {
            console.warn('加载失败，使用默认规则', error);
            keywordRules = [
                { keywords: ['你好'], matchType: 'any', replies: ['你好呀', '嗨'] },
                { keywords: ['红包'], matchType: 'any', replies: ['哪里哪里？', '我也想要！'] }
            ];
        } finally {
            rulesLoaded = true;
        }
    }

    // ----- 加密存档 (localStorage + 文件) -----
    function getState() {
        return {
            myBalance,
            messages,
            redPackets: Array.from(redPackets.entries()),
            lastRedPacketTime,
            activeFactor,
            recentRedpacketAmounts,
            version: 1
        };
    }

    function restoreState(state) {
        if (!state) return false;
        myBalance = state.myBalance ?? 100.0;
        messages = state.messages ?? [];
        for (let [id, interval] of grabIntervals.entries()) {
            clearInterval(interval);
        }
        grabIntervals.clear();
        redPackets = new Map(state.redPackets || []);
        lastRedPacketTime = state.lastRedPacketTime ?? Date.now();
        activeFactor = state.activeFactor ?? 1.0;
        recentRedpacketAmounts = state.recentRedpacketAmounts ?? [];
        redPackets.forEach((rp, rpId) => {
            if (rp.remainingCount > 0 && rp.grabbedUsers.length < rp.totalCount) {
                startAutoGrab(rpId);
            }
        });
        updateBalanceUI();
        renderMessages();
        return true;
    }

    // 保存到 localStorage (截断为最近300条)
    function saveToLocalStorage() {
        try {
            const fullState = getState();
            // 截断 messages 为最近300条
            const trimmedMessages = fullState.messages.slice(-300);
            const stateToSave = {
                ...fullState,
                messages: trimmedMessages
            };
            const json = JSON.stringify(stateToSave);
            const encrypted = CryptoJS.AES.encrypt(json, STORAGE_KEY).toString();
            localStorage.setItem('redpacket_archive', encrypted);
        } catch (e) {
            console.warn('保存失败', e);
        }
    }

    function loadFromLocalStorage() {
        try {
            const encrypted = localStorage.getItem('redpacket_archive');
            if (!encrypted) return false;
            const decrypted = CryptoJS.AES.decrypt(encrypted, STORAGE_KEY).toString(CryptoJS.enc.Utf8);
            if (!decrypted) return false;
            const state = JSON.parse(decrypted);
            return restoreState(state);
        } catch (e) {
            console.warn('读取缓存失败', e);
            return false;
        }
    }

    // 导出为文件 (带选项)
    function exportArchiveWithOptions() {
        const msgLimit = parseInt(exportMsgCount.value, 10);
        const keepDetails = exportKeepDetails.checked;

        let state = getState();

        if (!isNaN(msgLimit) && msgLimit > 0 && msgLimit < state.messages.length) {
            state.messages = state.messages.slice(-msgLimit);
        }

        if (!keepDetails) {
            state.redPackets = state.redPackets.map(([id, rp]) => {
                const newRp = { ...rp, grabbedDetails: [] };
                return [id, newRp];
            });
        }

        const json = JSON.stringify(state, null, 2);
        const encrypted = CryptoJS.AES.encrypt(json, STORAGE_KEY).toString();
        const blob = new Blob([encrypted], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const filename = `抢红包游戏_${year}年${month}月${day}日存档.txt`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        exportOptionsModal.classList.remove('show');
    }

    // 新增：复制加密文本到剪贴板
    async function copyEncryptedToClipboard() {
        const msgLimit = parseInt(exportMsgCount.value, 10);
        const keepDetails = exportKeepDetails.checked;

        let state = getState();

        if (!isNaN(msgLimit) && msgLimit > 0 && msgLimit < state.messages.length) {
            state.messages = state.messages.slice(-msgLimit);
        }

        if (!keepDetails) {
            state.redPackets = state.redPackets.map(([id, rp]) => {
                const newRp = { ...rp, grabbedDetails: [] };
                return [id, newRp];
            });
        }

        const json = JSON.stringify(state, null, 2);
        const encrypted = CryptoJS.AES.encrypt(json, STORAGE_KEY).toString();

        try {
            await navigator.clipboard.writeText(encrypted);
            alert('加密文本已复制到剪贴板！');
        } catch (err) {
            // 降级方案：使用 prompt 显示文本
            prompt('复制失败，请手动复制以下加密文本：', encrypted);
        }
    }

    // 新增：从剪贴板粘贴导入
    function importFromPastedText(encryptedText) {
        try {
            const decrypted = CryptoJS.AES.decrypt(encryptedText, STORAGE_KEY).toString(CryptoJS.enc.Utf8);
            if (!decrypted) throw new Error('解密失败，密码错误或文件损坏');
            const state = JSON.parse(decrypted);
            if (restoreState(state)) {
                alert('导入成功');
                saveToLocalStorage();
            } else {
                alert('导入失败');
            }
        } catch (ex) {
            alert('导入出错: ' + ex.message);
        }
    }

    // 导入文件
    function importArchive(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const encrypted = e.target.result;
                const decrypted = CryptoJS.AES.decrypt(encrypted, STORAGE_KEY).toString(CryptoJS.enc.Utf8);
                if (!decrypted) throw new Error('解密失败，密码错误或文件损坏');
                const state = JSON.parse(decrypted);
                if (restoreState(state)) {
                    alert('导入成功');
                    saveToLocalStorage();
                } else {
                    alert('导入失败');
                }
            } catch (ex) {
                alert('导入出错: ' + ex.message);
            }
            importFileInput.value = '';
        };
        reader.readAsText(file);
    }

    // 初始演示数据
    function initDemo() {
        if (!loadFromLocalStorage()) {
            addTextMessage('小明', '欢迎来抢红包🧧');
            setTimeout(() => addRedpacket('小红', 3.2, 3, '恭喜发财，大吉大利'), 500);
            setTimeout(() => addRedpacket('小刚', 0.6, 2, '万事如意，心想事成'), 1200);
        }
    }

    // ----- 启动 -----
    async function startApp() {
        await loadRules();
        initDemo();
        updateBalanceUI();
    }

    startApp();

    // 定时任务
    setInterval(updateActiveFactor, 2000);
    setInterval(() => robotSendRedpacket(), 15000 + Math.random() * 10000);
    setInterval(() => {
        if (Math.random() > 0.5 && rulesLoaded) {
            const speaker = SIM_USERS[Math.floor(Math.random() * SIM_USERS.length)];
            const talks = ['有人吗', '再来一个包', '今天运气不错', '哈哈', '谢谢老板'];
            addTextMessage(speaker, talks[Math.floor(Math.random() * talks.length)]);
        }
    }, 20000);

    // ----- 事件绑定 -----
    document.getElementById('showRedpacketModal').addEventListener('click', () => {
        modal.classList.add('show');
    });
    document.getElementById('cancelRedpacket').addEventListener('click', () => {
        modal.classList.remove('show');
    });
    document.getElementById('confirmRedpacket').addEventListener('click', () => {
        const amount = parseFloat(document.getElementById('rpAmount').value);
        const count = parseInt(document.getElementById('rpCount').value, 10);
        const blessing = document.getElementById('rpBlessing').value.trim() || '恭喜发财，大吉大利';
        if (isNaN(amount) || isNaN(count) || amount <= 0 || count < 1) {
            alert('请填写正确金额和个数');
            return;
        }
        modal.classList.remove('show');
        addRedpacket(MY_NAME, amount, count, blessing);
    });

    document.getElementById('sendMsgBtn').addEventListener('click', () => {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        if (text) {
            addTextMessage(MY_NAME, text);
            input.value = '';
        }
    });

    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('sendMsgBtn').click();
    });

    openResultModal.addEventListener('click', (e) => {
        if (e.target === openResultModal) openResultModal.classList.remove('show');
    });

    // 导出按钮显示选项弹窗
    document.getElementById('exportBtn').addEventListener('click', () => {
        exportOptionsModal.classList.add('show');
    });

    document.getElementById('cancelExport').addEventListener('click', () => {
        exportOptionsModal.classList.remove('show');
    });

    document.getElementById('confirmExport').addEventListener('click', exportArchiveWithOptions);

    // 新增：复制按钮
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-primary';
    copyBtn.id = 'copyArchiveBtn';
    copyBtn.innerText = '复制加密文本';
    copyBtn.style.marginLeft = '8px';
    // 插入到导出选项模态框的按钮组中
    const exportModalActions = document.querySelector('#exportOptionsModal .modal-actions');
    exportModalActions.insertBefore(copyBtn, exportModalActions.firstChild);

    copyBtn.addEventListener('click', async () => {
        await copyEncryptedToClipboard();
        // 不关闭弹窗，方便继续操作
    });

    // 粘贴按钮
    document.getElementById('pasteBtn').addEventListener('click', () => {
        pasteModal.classList.add('show');
        document.getElementById('pasteArchiveText').value = ''; // 清空
    });

    document.getElementById('cancelPaste').addEventListener('click', () => {
        pasteModal.classList.remove('show');
    });

    document.getElementById('confirmPaste').addEventListener('click', () => {
        const text = document.getElementById('pasteArchiveText').value.trim();
        if (text) {
            importFromPastedText(text);
            pasteModal.classList.remove('show');
        } else {
            alert('请输入加密文本');
        }
    });

    // 点击模态背景关闭
    pasteModal.addEventListener('click', (e) => {
        if (e.target === pasteModal) pasteModal.classList.remove('show');
    });

    document.getElementById('importBtn').addEventListener('click', () => {
        importFileInput.click();
    });
    importFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importArchive(e.target.files[0]);
        }
    });
})();