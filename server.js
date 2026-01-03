const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Claude API 프록시 엔드포인트
app.post('/api/chat', async (req, res) => {
    const { apiKey, messages, systemPrompt } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API 키가 필요합니다.' });
    }

    const requestBody = JSON.stringify({
        model: 'claude-opus-4-5-20250514',
        max_tokens: 8192,
        system: systemPrompt || '당신은 도움이 되는 AI 어시스턴트입니다.',
        messages: messages
    });

    const options = {
        hostname: 'api.anthropic.com',
        port: 443,
        path: '/v1/messages',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(requestBody)
        }
    };

    const request = https.request(options, (response) => {
        let data = '';

        response.on('data', (chunk) => {
            data += chunk;
        });

        response.on('end', () => {
            try {
                const jsonData = JSON.parse(data);
                if (response.statusCode === 200) {
                    res.json(jsonData);
                } else {
                    res.status(response.statusCode).json(jsonData);
                }
            } catch (e) {
                res.status(500).json({ error: '응답 파싱 오류', details: data });
            }
        });
    });

    request.on('error', (error) => {
        res.status(500).json({ error: 'API 요청 실패', details: error.message });
    });

    request.write(requestBody);
    request.end();
});

// 스트리밍 엔드포인트
app.post('/api/chat/stream', async (req, res) => {
    const { apiKey, messages, systemPrompt } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API 키가 필요합니다.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const requestBody = JSON.stringify({
        model: 'claude-opus-4-5-20250514',
        max_tokens: 8192,
        stream: true,
        system: systemPrompt || '당신은 도움이 되는 AI 어시스턴트입니다.',
        messages: messages
    });

    const options = {
        hostname: 'api.anthropic.com',
        port: 443,
        path: '/v1/messages',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(requestBody)
        }
    };

    const request = https.request(options, (response) => {
        response.on('data', (chunk) => {
            res.write(chunk);
        });

        response.on('end', () => {
            res.end();
        });
    });

    request.on('error', (error) => {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    });

    req.on('close', () => {
        request.destroy();
    });

    request.write(requestBody);
    request.end();
});

app.listen(PORT, () => {
    console.log(`🚀 Claude Chat 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
