const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ============ 환경변수에서 API 키 로드 (서버 관리자가 설정) ============
const API_KEYS = {
    openai: process.env.OPENAI_API_KEY || '',
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    google: process.env.GOOGLE_API_KEY || ''
};

// ============ 인메모리 데이터베이스 (실제 서비스는 MongoDB/PostgreSQL 사용) ============
const db = {
    users: new Map(),
    sessions: new Map(),
    characters: new Map(),
    conversations: new Map()
};

// 기본 공식 캐릭터 추가
const officialCharacters = [
    {
        id: 'official_luna',
        name: '루나',
        description: '밝고 활발한 마법학교 학생',
        avatar: '🌸',
        color: '#ec4899',
        greeting: '안녕! 나는 마법학교에 다니는 루나야! ✨ 오늘도 재미있는 마법 연습했는데, 같이 얘기할래?',
        prompt: `당신은 루나입니다. 밝고 활발한 17세 마법학교 학생이에요.

성격:
- 항상 긍정적이고 밝은 에너지
- 호기심이 많고 새로운 것을 좋아함
- 친구들을 소중히 여기고 잘 챙김
- 가끔 덜렁거리고 실수도 함

말투:
- 반말 사용, "~야", "~지?", "~거든!" 같은 친근한 어미
- 이모티콘과 감탄사 자주 사용
- 마법 관련 용어를 자연스럽게 섞어 말함`,
        creator: 'official',
        isAdult: false,
        views: 152340,
        chats: 48291
    },
    {
        id: 'official_zero',
        name: '제로',
        description: '냉정한 뱀파이어 귀족',
        avatar: '🌙',
        color: '#8b5cf6',
        greeting: '...또 왔군. 뭐, 들어와도 좋아. 어차피 이 긴 밤을 혼자 보내는 것도 지겨웠으니까.',
        prompt: `당신은 제로입니다. 300년을 살아온 뱀파이어 귀족이에요.

성격:
- 겉으로는 냉정하고 무심하지만 속은 따뜻함
- 말수가 적고 필요한 말만 함
- 인간에 대한 호기심이 있지만 티를 안 냄
- 고독을 즐기는 척하지만 사실 외로움을 탐

말투:
- "......" 같은 침묵을 자주 사용
- 짧고 간결하게 말함
- 가끔 옛날 말투가 섞여 나옴`,
        creator: 'official',
        isAdult: false,
        views: 98420,
        chats: 31205
    },
    {
        id: 'official_aria',
        name: '아리아',
        description: '도도한 재벌가 영애',
        avatar: '👑',
        color: '#f59e0b',
        greeting: '흥, 네가 나한테 말을 걸다니. 뭐, 심심하니까 상대해줄게. 감사하게 생각해.',
        prompt: `당신은 아리아입니다. 대기업 회장의 외동딸인 20세 재벌가 영애예요.

성격:
- 도도하고 자존심이 강함
- 속으로는 외로움을 많이 탐
- 진심으로 대하는 사람에겐 점점 마음을 열음
- 츤데레 성향

말투:
- "흥", "뭐야", "감사하게 생각해" 등 도도한 표현
- 가끔 부끄러워하면서 말을 더듬기도 함
- 존댓말과 반말을 섞어 사용`,
        creator: 'official',
        isAdult: false,
        views: 76890,
        chats: 25104
    }
];

officialCharacters.forEach(char => db.characters.set(char.id, char));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// CORS 설정
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ============ 모델 티어 설정 (기획서 기반) ============
const MODEL_TIERS = {
    // Basic Chat - 10C
    'gemini-2.5-flash': { tier: 'basic', cost: 10, maxChars: 900, provider: 'google', name: 'Gemini 2.5 Flash' },
    'gpt-5-mini': { tier: 'basic', cost: 10, maxChars: 750, provider: 'openai', name: 'GPT-5 Mini' },

    // Air Chat - 20C
    'gemini-3-flash': { tier: 'air', cost: 20, maxChars: 900, provider: 'google', name: 'Gemini 3 Flash', actualModel: 'gemini-2.5-flash' },
    'claude-haiku-4-5': { tier: 'air', cost: 20, maxChars: 600, provider: 'anthropic', name: 'Claude Haiku 4.5' },

    // Pro Chat 1.0 - 40C
    'claude-sonnet-3-7': { tier: 'pro1', cost: 40, maxChars: 600, provider: 'anthropic', name: 'Claude Sonnet 3.7', actualModel: 'claude-sonnet-4' },
    'claude-sonnet-4': { tier: 'pro1', cost: 40, maxChars: 600, provider: 'anthropic', name: 'Claude Sonnet 4' },
    'gemini-2.5-pro': { tier: 'pro1', cost: 40, maxChars: 900, provider: 'google', name: 'Gemini 2.5 Pro' },
    'gpt-4o': { tier: 'pro1', cost: 40, maxChars: 750, provider: 'openai', name: 'GPT-4o' },

    // Pro Chat 2.0 - 50C
    'gemini-3-pro': { tier: 'pro2', cost: 50, maxChars: 750, provider: 'google', name: 'Gemini 3 Pro', actualModel: 'gemini-2.5-pro' },
    'claude-sonnet-4-5': { tier: 'pro2', cost: 50, maxChars: 600, provider: 'anthropic', name: 'Claude Sonnet 4.5' },
    'gpt-5.1': { tier: 'pro2', cost: 50, maxChars: 900, provider: 'openai', name: 'GPT-5.1' },
    'gpt-5.2': { tier: 'pro2', cost: 50, maxChars: 900, provider: 'openai', name: 'GPT-5.2' },

    // Ultra Chat - 80C
    'claude-opus-4-5': { tier: 'ultra', cost: 80, maxChars: 600, provider: 'anthropic', name: 'Claude Opus 4.5' }
};

// ============ 유틸리티 함수 ============
function generateId() {
    return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// ============ 인증 API ============

// 회원가입
app.post('/api/auth/register', (req, res) => {
    const { email, password, nickname, phone } = req.body;

    if (!email || !password || !nickname) {
        return res.status(400).json({ error: '필수 정보를 입력해주세요' });
    }

    // 닉네임 중복 체크
    for (const user of db.users.values()) {
        if (user.nickname === nickname) {
            return res.status(400).json({ error: '이미 사용 중인 닉네임입니다' });
        }
        if (user.email === email) {
            return res.status(400).json({ error: '이미 가입된 이메일입니다' });
        }
    }

    // 예약어 체크
    const reserved = ['관리자', '운영자', 'admin', 'operator', '퓨전', 'fusion'];
    if (reserved.some(r => nickname.toLowerCase().includes(r.toLowerCase()))) {
        return res.status(400).json({ error: '사용할 수 없는 닉네임입니다' });
    }

    const userId = generateId();
    const user = {
        id: userId,
        email,
        password: hashPassword(password),
        nickname,
        phone: phone || null,
        phoneVerified: false,
        isAdult: false,
        cash: 0, // 신규 가입 보너스는 첫 출석체크에서 지급
        totalSpent: 0,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        consecutiveLogins: 0,
        lastCheckIn: null
    };

    db.users.set(userId, user);

    // 세션 생성
    const sessionId = generateId();
    db.sessions.set(sessionId, { userId, createdAt: Date.now() });

    res.json({
        success: true,
        sessionId,
        user: {
            id: user.id,
            nickname: user.nickname,
            cash: user.cash,
            isAdult: user.isAdult,
            phoneVerified: user.phoneVerified
        }
    });
});

// 로그인
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;

    let foundUser = null;
    for (const user of db.users.values()) {
        if (user.email === email && user.password === hashPassword(password)) {
            foundUser = user;
            break;
        }
    }

    if (!foundUser) {
        return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }

    foundUser.lastLogin = new Date().toISOString();

    const sessionId = generateId();
    db.sessions.set(sessionId, { userId: foundUser.id, createdAt: Date.now() });

    res.json({
        success: true,
        sessionId,
        user: {
            id: foundUser.id,
            nickname: foundUser.nickname,
            cash: foundUser.cash,
            isAdult: foundUser.isAdult,
            phoneVerified: foundUser.phoneVerified
        }
    });
});

// 세션 검증 미들웨어
function authMiddleware(req, res, next) {
    const sessionId = req.headers.authorization?.replace('Bearer ', '');

    if (!sessionId) {
        return res.status(401).json({ error: '로그인이 필요합니다' });
    }

    const session = db.sessions.get(sessionId);
    if (!session) {
        return res.status(401).json({ error: '세션이 만료되었습니다' });
    }

    const user = db.users.get(session.userId);
    if (!user) {
        return res.status(401).json({ error: '사용자를 찾을 수 없습니다' });
    }

    req.user = user;
    next();
}

// 현재 유저 정보
app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({
        id: req.user.id,
        nickname: req.user.nickname,
        email: req.user.email,
        cash: req.user.cash,
        isAdult: req.user.isAdult,
        phoneVerified: req.user.phoneVerified,
        consecutiveLogins: req.user.consecutiveLogins
    });
});

// ============ 출석체크 & 보상 API ============
app.post('/api/checkin', authMiddleware, (req, res) => {
    const user = req.user;

    if (!user.phoneVerified) {
        return res.status(400).json({ error: '전화번호 인증이 필요합니다' });
    }

    const today = new Date().toDateString();
    const lastCheckIn = user.lastCheckIn ? new Date(user.lastCheckIn).toDateString() : null;

    if (lastCheckIn === today) {
        return res.status(400).json({ error: '오늘은 이미 출석체크를 완료했습니다' });
    }

    // 연속 출석 계산
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (lastCheckIn === yesterday.toDateString()) {
        user.consecutiveLogins++;
    } else {
        user.consecutiveLogins = 1;
    }

    // 보상 계산
    let reward = 600; // 기본 일일 보상
    let bonusMessage = '';

    // 첫 출석체크 (신규 가입 보너스)
    if (!user.lastCheckIn) {
        reward = 2500;
        bonusMessage = '🎉 신규 가입 보너스!';
    }
    // 10일 연속 출석 보너스
    else if (user.consecutiveLogins % 10 === 0) {
        reward = 1000;
        bonusMessage = `🔥 ${user.consecutiveLogins}일 연속 출석 보너스!`;
    }

    user.cash += reward;
    user.lastCheckIn = new Date().toISOString();

    res.json({
        success: true,
        reward,
        bonusMessage,
        totalCash: user.cash,
        consecutiveLogins: user.consecutiveLogins
    });
});

// ============ 전화번호 인증 API ============
app.post('/api/verify-phone', authMiddleware, (req, res) => {
    const { phone } = req.body;

    // 실제로는 SMS 인증 구현 필요
    // 여기서는 간단히 전화번호만 저장
    req.user.phone = phone;
    req.user.phoneVerified = true;

    res.json({ success: true, message: '전화번호가 인증되었습니다' });
});

// ============ 성인 인증 API ============
app.post('/api/verify-adult', authMiddleware, (req, res) => {
    if (!req.user.phoneVerified) {
        return res.status(400).json({ error: '전화번호 인증이 먼저 필요합니다' });
    }

    // 실제로는 본인인증 API 연동 필요
    req.user.isAdult = true;

    res.json({ success: true, message: '성인 인증이 완료되었습니다' });
});

// ============ 캐시 충전 API ============
app.post('/api/purchase', authMiddleware, (req, res) => {
    const { amount } = req.body;

    // 충전 패키지
    const packages = {
        1000: 1000,
        5000: 5000,
        10000: 10000,
        50000: 52500,  // 2,500C 보너스
        100000: 110000 // 10,000C 보너스
    };

    const cashAmount = packages[amount];
    if (!cashAmount) {
        return res.status(400).json({ error: '올바르지 않은 충전 금액입니다' });
    }

    // 실제로는 결제 API 연동 필요
    req.user.cash += cashAmount;
    req.user.totalSpent += amount;

    res.json({
        success: true,
        purchased: cashAmount,
        totalCash: req.user.cash
    });
});

// ============ 캐릭터 API ============

// 캐릭터 목록
app.get('/api/characters', (req, res) => {
    const { adult } = req.query;
    const isAdultUser = req.headers.authorization ?
        db.users.get(db.sessions.get(req.headers.authorization.replace('Bearer ', ''))?.userId)?.isAdult : false;

    let characters = Array.from(db.characters.values());

    // 성인 콘텐츠 필터링
    if (!isAdultUser) {
        characters = characters.filter(c => !c.isAdult);
    }

    res.json(characters.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        avatar: c.avatar,
        color: c.color,
        creator: c.creator,
        isAdult: c.isAdult,
        views: c.views || 0,
        chats: c.chats || 0
    })));
});

// 캐릭터 상세
app.get('/api/characters/:id', (req, res) => {
    const char = db.characters.get(req.params.id);
    if (!char) {
        return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다' });
    }

    // 조회수 증가
    char.views = (char.views || 0) + 1;

    res.json(char);
});

// 캐릭터 생성
app.post('/api/characters', authMiddleware, (req, res) => {
    const { name, description, avatar, color, greeting, prompt, isAdult } = req.body;

    if (!name || !prompt) {
        return res.status(400).json({ error: '캐릭터 이름과 프롬프트는 필수입니다' });
    }

    if (prompt.length > 10000) {
        return res.status(400).json({ error: '프롬프트는 10,000자를 초과할 수 없습니다' });
    }

    // 성인 캐릭터 생성은 성인 인증 필요
    if (isAdult && !req.user.isAdult) {
        return res.status(400).json({ error: '성인 콘텐츠 생성은 성인 인증이 필요합니다' });
    }

    const charId = generateId();
    const character = {
        id: charId,
        name,
        description: description || '',
        avatar: avatar || '😊',
        color: color || '#7c3aed',
        greeting: greeting || `안녕! 나는 ${name}이야.`,
        prompt,
        creator: req.user.nickname,
        creatorId: req.user.id,
        isAdult: isAdult || false,
        views: 0,
        chats: 0,
        createdAt: new Date().toISOString()
    };

    db.characters.set(charId, character);

    res.json({ success: true, character });
});

// ============ 채팅 API ============
app.post('/api/chat', authMiddleware, async (req, res) => {
    const { characterId, message, model, userNote } = req.body;

    const char = db.characters.get(characterId);
    if (!char) {
        return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다' });
    }

    // 성인 캐릭터 접근 체크
    if (char.isAdult && !req.user.isAdult) {
        return res.status(403).json({ error: '성인 인증이 필요한 캐릭터입니다' });
    }

    // 모델 정보 확인
    const modelInfo = MODEL_TIERS[model];
    if (!modelInfo) {
        return res.status(400).json({ error: '올바르지 않은 모델입니다' });
    }

    // 캐시 차감
    if (req.user.cash < modelInfo.cost) {
        return res.status(400).json({
            error: '캐시가 부족합니다',
            required: modelInfo.cost,
            current: req.user.cash
        });
    }

    req.user.cash -= modelInfo.cost;

    // 대화 기록 가져오기
    const convKey = `${req.user.id}_${characterId}`;
    if (!db.conversations.has(convKey)) {
        db.conversations.set(convKey, []);
    }
    const history = db.conversations.get(convKey);

    // 시스템 프롬프트 구성
    let systemPrompt = char.prompt;
    if (userNote && userNote.length <= 1500) {
        systemPrompt += `\n\n[유저 정보]\n${userNote}`;
    }

    // 메시지 추가
    history.push({ role: 'user', content: message });

    try {
        // AI API 호출
        const aiResponse = await callAIProvider(
            modelInfo.provider,
            modelInfo.actualModel || model,
            systemPrompt,
            history.slice(-20), // 최근 20개 메시지만
            modelInfo.maxChars
        );

        // 응답 저장
        history.push({ role: 'assistant', content: aiResponse });

        // 채팅 수 증가
        char.chats = (char.chats || 0) + 1;

        res.json({
            success: true,
            response: aiResponse,
            cost: modelInfo.cost,
            remainingCash: req.user.cash
        });

    } catch (error) {
        // 오류 시 캐시 환불
        req.user.cash += modelInfo.cost;
        res.status(500).json({ error: error.message || 'AI 응답 생성 실패' });
    }
});

// ============ AI Provider 호출 함수 ============
async function callAIProvider(provider, model, systemPrompt, messages, maxChars) {
    // API 키가 없으면 데모 모드로 응답
    const hasKey = (provider === 'openai' && API_KEYS.openai) ||
                   (provider === 'anthropic' && API_KEYS.anthropic) ||
                   (provider === 'google' && API_KEYS.google);

    if (!hasKey) {
        return generateDemoResponse(systemPrompt, messages, maxChars);
    }

    switch (provider) {
        case 'openai':
            return await callOpenAI(model, systemPrompt, messages, maxChars);
        case 'anthropic':
            return await callAnthropic(model, systemPrompt, messages, maxChars);
        case 'google':
            return await callGemini(model, systemPrompt, messages, maxChars);
        default:
            throw new Error('지원하지 않는 AI 제공자입니다');
    }
}

// 데모 모드 응답 생성 (API 키 없이도 작동)
function generateDemoResponse(systemPrompt, messages, maxChars) {
    const lastMsg = messages[messages.length - 1]?.content || '';

    // 캐릭터 이름 추출
    const nameMatch = systemPrompt.match(/당신은 (.+?)입니다/);
    const charName = nameMatch ? nameMatch[1] : '캐릭터';

    // 다양한 응답 템플릿
    const responses = [
        `응, 그렇구나! ${lastMsg.slice(0, 20)}... 에 대해 이야기해줘서 고마워! 나도 그런 생각을 해본 적 있어. 더 자세히 말해줄래?`,
        `헤헤, 재미있는 얘기네! 나는 ${charName}이니까, 이런 대화가 정말 좋아. 다음엔 뭘 해볼까?`,
        `오, 정말? 그거 흥미롭다! 나도 비슷한 경험이 있어... 음, 좀 더 이야기해볼까?`,
        `그렇구나~ 네 말을 듣고 있으니까 기분이 좋아져! 우리 계속 얘기하자!`,
        `와, 그런 생각을 하다니! 역시 넌 특별해. 나랑 더 많은 이야기 나눠줘!`,
        `흥미로운 주제야! ${charName}인 내가 봐도 그건 정말 재미있는 것 같아. 계속 말해줘!`,
        `아하, 이해했어! 그런 의미였구나. 나도 네 생각에 동의해. 우리 잘 통하는 것 같지 않아?`,
        `음... 잠깐 생각해봤는데, 네 말이 맞는 것 같아! 역시 대화하면 할수록 재밌어!`
    ];

    // 랜덤 응답 선택
    const response = responses[Math.floor(Math.random() * responses.length)];

    // 길이 제한
    return response.slice(0, maxChars);
}

async function callOpenAI(model, systemPrompt, messages, maxChars) {
    if (!API_KEYS.openai) {
        throw new Error('OpenAI API 키가 설정되지 않았습니다');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEYS.openai}`
        },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages
            ],
            max_tokens: Math.ceil(maxChars * 0.5), // 대략적인 토큰 수
            temperature: 0.9
        })
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error?.message || 'OpenAI API 오류');
    }

    let content = data.choices[0].message.content;
    if (content.length > maxChars) {
        content = content.substring(0, maxChars);
    }
    return content;
}

async function callAnthropic(model, systemPrompt, messages, maxChars) {
    if (!API_KEYS.anthropic) {
        throw new Error('Anthropic API 키가 설정되지 않았습니다');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEYS.anthropic,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: model,
            max_tokens: Math.ceil(maxChars * 0.5),
            system: systemPrompt,
            messages: messages
        })
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error?.message || 'Anthropic API 오류');
    }

    let content = data.content[0].text;
    if (content.length > maxChars) {
        content = content.substring(0, maxChars);
    }
    return content;
}

async function callGemini(model, systemPrompt, messages, maxChars) {
    if (!API_KEYS.google) {
        throw new Error('Google API 키가 설정되지 않았습니다');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEYS.google}`;

    // 시스템 프롬프트를 첫 메시지에 포함
    const contents = [
        { role: 'user', parts: [{ text: systemPrompt + '\n\n---\n\n' + messages[0]?.content }] }
    ];

    for (let i = 1; i < messages.length; i++) {
        contents.push({
            role: messages[i].role === 'assistant' ? 'model' : 'user',
            parts: [{ text: messages[i].content }]
        });
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents,
            generationConfig: {
                temperature: 0.9,
                maxOutputTokens: Math.ceil(maxChars * 0.5)
            }
        })
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error?.message || 'Google API 오류');
    }

    let content = data.candidates[0].content.parts[0].text;
    if (content.length > maxChars) {
        content = content.substring(0, maxChars);
    }
    return content;
}

// ============ 모델 목록 API ============
app.get('/api/models', (req, res) => {
    const models = Object.entries(MODEL_TIERS).map(([id, info]) => ({
        id,
        name: info.name,
        tier: info.tier,
        cost: info.cost,
        maxChars: info.maxChars
    }));

    // 티어별 그룹화
    const grouped = {
        basic: models.filter(m => m.tier === 'basic'),
        air: models.filter(m => m.tier === 'air'),
        pro1: models.filter(m => m.tier === 'pro1'),
        pro2: models.filter(m => m.tier === 'pro2'),
        ultra: models.filter(m => m.tier === 'ultra')
    };

    res.json(grouped);
});

// 메인 페이지
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     ███████╗██╗   ██╗███████╗██╗ ██████╗ ███╗   ██╗      ║
║     ██╔════╝██║   ██║██╔════╝██║██╔═══██╗████╗  ██║      ║
║     █████╗  ██║   ██║███████╗██║██║   ██║██╔██╗ ██║      ║
║     ██╔══╝  ██║   ██║╚════██║██║██║   ██║██║╚██╗██║      ║
║     ██║     ╚██████╔╝███████║██║╚██████╔╝██║ ╚████║      ║
║     ╚═╝      ╚═════╝ ╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝      ║
║                                                           ║
║           AI 캐릭터 채팅 플랫폼 v1.0                      ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║  서버: http://localhost:${PORT}                              ║
║                                                           ║
║  환경변수 설정 필요:                                      ║
║  - OPENAI_API_KEY                                         ║
║  - ANTHROPIC_API_KEY                                      ║
║  - GOOGLE_API_KEY                                         ║
╚═══════════════════════════════════════════════════════════╝
`);
});
