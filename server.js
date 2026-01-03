const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// CORS 설정
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// OpenAI API 프록시
app.post('/api/openai', async (req, res) => {
    const { apiKey, messages, model, stream } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API 키가 필요합니다' });
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model || 'gpt-4o-mini',
                messages,
                max_tokens: 2048,
                temperature: 0.9,
                stream: false
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data.error?.message || 'API 오류' });
        }

        res.json({
            content: data.choices[0].message.content,
            usage: data.usage
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Claude API 프록시
app.post('/api/claude', async (req, res) => {
    const { apiKey, messages, model, system } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API 키가 필요합니다' });
    }

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model || 'claude-3-5-sonnet-20241022',
                max_tokens: 2048,
                system: system || '',
                messages
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data.error?.message || 'API 오류' });
        }

        res.json({
            content: data.content[0].text,
            usage: data.usage
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Google Gemini API 프록시
app.post('/api/gemini', async (req, res) => {
    const { apiKey, messages, model } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API 키가 필요합니다' });
    }

    try {
        const geminiModel = model || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

        // 메시지 포맷 변환
        const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    temperature: 0.9,
                    maxOutputTokens: 2048
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data.error?.message || 'API 오류' });
        }

        res.json({
            content: data.candidates[0].content.parts[0].text,
            usage: data.usageMetadata
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════╗
║         퓨전 AI 채팅 플랫폼           ║
╠═══════════════════════════════════════╣
║  http://localhost:${PORT}               ║
║  서버 실행 중...                       ║
╚═══════════════════════════════════════╝
`);
});
