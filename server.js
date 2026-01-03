const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 정적 파일 서빙
app.use(express.static(__dirname));

// 메인 페이지
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Claude API 스트리밍 프록시
app.post('/api/chat/stream', (req, res) => {
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
        res.write(`data: ${JSON.stringify({ type: 'error', error: { message: error.message } })}\n\n`);
        res.end();
    });

    req.on('close', () => {
        request.destroy();
    });

    request.write(requestBody);
    request.end();
});

app.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log('   Claude Opus 4.5 Chat Server');
    console.log('========================================');
    console.log('');
    console.log(`   http://localhost:${PORT}`);
    console.log('');
    console.log('   브라우저에서 위 주소로 접속하세요!');
    console.log('========================================');
    console.log('');
});
