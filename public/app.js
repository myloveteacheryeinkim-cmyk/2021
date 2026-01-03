// DOM 요소
const apiKeyInput = document.getElementById('api-key');
const toggleKeyBtn = document.getElementById('toggle-key');
const saveKeyBtn = document.getElementById('save-key');
const systemPromptInput = document.getElementById('system-prompt');
const newChatBtn = document.getElementById('new-chat');
const historyList = document.getElementById('history-list');
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const charCount = document.getElementById('char-count');
const loadingOverlay = document.getElementById('loading-overlay');
const exportChatBtn = document.getElementById('export-chat');
const chatTitle = document.getElementById('chat-title');

// 상태
let conversations = {};
let currentConversationId = null;
let isStreaming = false;

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    loadApiKey();
    loadConversations();
    loadSystemPrompt();
    setupEventListeners();
});

// 이벤트 리스너 설정
function setupEventListeners() {
    // API 키 관련
    toggleKeyBtn.addEventListener('click', toggleApiKeyVisibility);
    saveKeyBtn.addEventListener('click', saveApiKey);

    // 시스템 프롬프트
    systemPromptInput.addEventListener('change', saveSystemPrompt);

    // 새 대화
    newChatBtn.addEventListener('click', startNewConversation);

    // 메시지 입력
    messageInput.addEventListener('input', handleInputChange);
    messageInput.addEventListener('keydown', handleKeyDown);
    sendBtn.addEventListener('click', sendMessage);

    // 내보내기
    exportChatBtn.addEventListener('click', exportConversation);
}

// API 키 관리
function toggleApiKeyVisibility() {
    const type = apiKeyInput.type === 'password' ? 'text' : 'password';
    apiKeyInput.type = type;
}

function saveApiKey() {
    const key = apiKeyInput.value.trim();
    if (key) {
        localStorage.setItem('claude_api_key', key);
        showNotification('API 키가 저장되었습니다.', 'success');
    }
}

function loadApiKey() {
    const key = localStorage.getItem('claude_api_key');
    if (key) {
        apiKeyInput.value = key;
    }
}

// 시스템 프롬프트 관리
function saveSystemPrompt() {
    localStorage.setItem('system_prompt', systemPromptInput.value);
}

function loadSystemPrompt() {
    const prompt = localStorage.getItem('system_prompt');
    if (prompt) {
        systemPromptInput.value = prompt;
    }
}

// 대화 관리
function loadConversations() {
    const saved = localStorage.getItem('conversations');
    if (saved) {
        conversations = JSON.parse(saved);
        renderHistoryList();
    }
}

function saveConversations() {
    localStorage.setItem('conversations', JSON.stringify(conversations));
    renderHistoryList();
}

function startNewConversation() {
    const id = Date.now().toString();
    conversations[id] = {
        id: id,
        title: '새 대화',
        messages: [],
        createdAt: new Date().toISOString()
    };
    currentConversationId = id;
    saveConversations();
    clearChatMessages();
    chatTitle.textContent = '새 대화';
}

function loadConversation(id) {
    currentConversationId = id;
    const conversation = conversations[id];
    if (conversation) {
        chatTitle.textContent = conversation.title;
        clearChatMessages();
        conversation.messages.forEach(msg => {
            appendMessage(msg.role, msg.content, false);
        });
        highlightActiveConversation();
    }
}

function deleteConversation(id, e) {
    e.stopPropagation();
    if (confirm('이 대화를 삭제하시겠습니까?')) {
        delete conversations[id];
        saveConversations();
        if (currentConversationId === id) {
            currentConversationId = null;
            clearChatMessages();
            chatTitle.textContent = '새 대화';
        }
    }
}

function renderHistoryList() {
    historyList.innerHTML = '';
    const sortedIds = Object.keys(conversations).sort((a, b) => b - a);

    sortedIds.forEach(id => {
        const conv = conversations[id];
        const li = document.createElement('li');
        li.className = id === currentConversationId ? 'active' : '';
        li.innerHTML = `
            <span class="chat-title-text">${escapeHtml(conv.title)}</span>
            <button class="delete-chat" onclick="deleteConversation('${id}', event)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        `;
        li.addEventListener('click', () => loadConversation(id));
        historyList.appendChild(li);
    });
}

function highlightActiveConversation() {
    const items = historyList.querySelectorAll('li');
    items.forEach(item => {
        item.classList.remove('active');
    });
    renderHistoryList();
}

// 메시지 처리
function handleInputChange() {
    const text = messageInput.value;
    charCount.textContent = text.length;
    sendBtn.disabled = text.trim().length === 0 || isStreaming;

    // 자동 높이 조절
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) {
            sendMessage();
        }
    }
}

async function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || isStreaming) return;

    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        showNotification('API 키를 입력해주세요.', 'error');
        return;
    }

    // 새 대화 시작
    if (!currentConversationId) {
        startNewConversation();
    }

    // 사용자 메시지 추가
    appendMessage('user', content);
    conversations[currentConversationId].messages.push({
        role: 'user',
        content: content
    });

    // 첫 메시지면 제목 업데이트
    if (conversations[currentConversationId].messages.length === 1) {
        const title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
        conversations[currentConversationId].title = title;
        chatTitle.textContent = title;
    }

    saveConversations();
    messageInput.value = '';
    handleInputChange();

    // API 호출
    await callClaudeAPI(apiKey);
}

async function callClaudeAPI(apiKey) {
    isStreaming = true;
    sendBtn.disabled = true;

    // 타이핑 인디케이터 추가
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant';
    typingDiv.id = 'typing-message';
    typingDiv.innerHTML = `
        <div class="message-avatar">🤖</div>
        <div class="message-content">
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    chatMessages.appendChild(typingDiv);
    scrollToBottom();

    try {
        const messages = conversations[currentConversationId].messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apiKey: apiKey,
                messages: messages,
                systemPrompt: systemPromptInput.value
            })
        });

        // 타이핑 인디케이터 제거
        typingDiv.remove();

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || error.error || 'API 요청 실패');
        }

        // 스트리밍 응답 처리
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantContent = '';
        let messageDiv = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);

                        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                            assistantContent += parsed.delta.text;

                            if (!messageDiv) {
                                messageDiv = appendMessage('assistant', assistantContent, false, true);
                            } else {
                                updateMessageContent(messageDiv, assistantContent);
                            }
                            scrollToBottom();
                        }

                        if (parsed.type === 'message_stop') {
                            // 메시지 완료
                        }

                        if (parsed.type === 'error') {
                            throw new Error(parsed.error?.message || '스트리밍 오류');
                        }
                    } catch (e) {
                        // JSON 파싱 실패 무시 (부분 데이터)
                    }
                }
            }
        }

        // 대화 저장
        if (assistantContent) {
            conversations[currentConversationId].messages.push({
                role: 'assistant',
                content: assistantContent
            });
            saveConversations();
        }

    } catch (error) {
        typingDiv.remove();
        showNotification(error.message, 'error');
        appendMessage('assistant', `오류가 발생했습니다: ${error.message}`, false);
    } finally {
        isStreaming = false;
        sendBtn.disabled = messageInput.value.trim().length === 0;
    }
}

function appendMessage(role, content, save = true, isStreaming = false) {
    // 환영 메시지 제거
    const welcome = chatMessages.querySelector('.welcome-message');
    if (welcome) {
        welcome.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatar = role === 'user' ? '👤' : '🤖';
    const formattedContent = role === 'assistant' ? formatMarkdown(content) : escapeHtml(content);

    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">${formattedContent}</div>
    `;

    chatMessages.appendChild(messageDiv);
    scrollToBottom();

    // 코드 블록에 복사 버튼 추가
    if (role === 'assistant') {
        addCopyButtons(messageDiv);
    }

    return messageDiv;
}

function updateMessageContent(messageDiv, content) {
    const contentDiv = messageDiv.querySelector('.message-content');
    contentDiv.innerHTML = formatMarkdown(content);
    addCopyButtons(messageDiv);
}

function formatMarkdown(text) {
    // marked 라이브러리 사용
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,
            gfm: true,
            highlight: function(code, lang) {
                if (typeof Prism !== 'undefined' && Prism.languages[lang]) {
                    return Prism.highlight(code, Prism.languages[lang], lang);
                }
                return code;
            }
        });
        return marked.parse(text);
    }
    return escapeHtml(text).replace(/\n/g, '<br>');
}

function addCopyButtons(messageDiv) {
    const codeBlocks = messageDiv.querySelectorAll('pre');
    codeBlocks.forEach(pre => {
        if (!pre.querySelector('.copy-btn')) {
            const btn = document.createElement('button');
            btn.className = 'copy-btn';
            btn.textContent = '복사';
            btn.addEventListener('click', () => {
                const code = pre.querySelector('code');
                navigator.clipboard.writeText(code ? code.textContent : pre.textContent);
                btn.textContent = '복사됨!';
                setTimeout(() => btn.textContent = '복사', 2000);
            });
            pre.appendChild(btn);
        }
    });
}

function clearChatMessages() {
    chatMessages.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                    <path d="M2 17l10 5 10-5"></path>
                    <path d="M2 12l10 5 10-5"></path>
                </svg>
            </div>
            <h2>Claude Opus 4.5에 오신 것을 환영합니다</h2>
            <p>가장 강력한 Claude 모델과 대화를 시작하세요.</p>
            <div class="welcome-tips">
                <div class="tip">
                    <span class="tip-icon">💡</span>
                    <span>왼쪽에 API 키를 입력하세요</span>
                </div>
                <div class="tip">
                    <span class="tip-icon">🔒</span>
                    <span>키는 브라우저에 안전하게 저장됩니다</span>
                </div>
                <div class="tip">
                    <span class="tip-icon">✨</span>
                    <span>코드, 분석, 창작 등 무엇이든 물어보세요</span>
                </div>
            </div>
        </div>
    `;
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 대화 내보내기
function exportConversation() {
    if (!currentConversationId || !conversations[currentConversationId]) {
        showNotification('내보낼 대화가 없습니다.', 'error');
        return;
    }

    const conv = conversations[currentConversationId];
    let markdown = `# ${conv.title}\n\n`;
    markdown += `날짜: ${new Date(conv.createdAt).toLocaleString('ko-KR')}\n\n---\n\n`;

    conv.messages.forEach(msg => {
        const role = msg.role === 'user' ? '👤 사용자' : '🤖 Claude';
        markdown += `## ${role}\n\n${msg.content}\n\n---\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conv.title}.md`;
    a.click();
    URL.revokeObjectURL(url);

    showNotification('대화가 내보내졌습니다.', 'success');
}

// 유틸리티
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
        background-color: ${type === 'error' ? '#f87171' : type === 'success' ? '#4ade80' : '#60a5fa'};
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// 전역 함수로 노출
window.deleteConversation = deleteConversation;
