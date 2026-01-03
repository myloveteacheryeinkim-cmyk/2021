const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 웹 검색 (DuckDuckGo)
async function webSearch(query) {
    return new Promise((resolve) => {
        const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;

        https.get(searchUrl, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const results = [];

                    if (json.AbstractText) {
                        results.push({
                            title: json.Heading || query,
                            url: json.AbstractURL || '',
                            snippet: json.AbstractText
                        });
                    }

                    if (json.RelatedTopics) {
                        json.RelatedTopics.slice(0, 5).forEach(topic => {
                            if (topic.Text && topic.FirstURL) {
                                results.push({
                                    title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 50),
                                    url: topic.FirstURL,
                                    snippet: topic.Text
                                });
                            }
                        });
                    }

                    resolve(results);
                } catch (e) {
                    resolve([]);
                }
            });
        }).on('error', () => resolve([]));
    });
}

// Claude API 호출
app.post('/api/chat', async (req, res) => {
    const { apiKey, messages, model, thinking, search, research } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API 키가 필요합니다.' });
    }

    try {
        let searchResults = null;
        let systemPrompt = '당신은 도움이 되는 AI 어시스턴트입니다. 친절하고 정확하게 답변해 주세요.';

        // 웹 검색 수행
        if (search || research) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage && lastMessage.role === 'user') {
                searchResults = await webSearch(lastMessage.content);

                if (searchResults.length > 0) {
                    let searchContext = '\n\n[웹 검색 결과]\n';
                    searchResults.forEach((r, i) => {
                        searchContext += `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}\n\n`;
                    });

                    systemPrompt += searchContext;
                    systemPrompt += '\n위 검색 결과를 참고하여 답변해주세요.';

                    if (research) {
                        systemPrompt += ' 딥 리서치 모드: 검색 결과를 깊이 분석하고 종합적인 정보를 제공해주세요.';
                    }
                }
            }
        }

        // API 요청 본문
        const requestBody = {
            model: model || 'claude-opus-4-5-20250514',
            max_tokens: 8192,
            system: systemPrompt,
            messages: messages
        };

        // Extended Thinking 설정
        if (thinking) {
            requestBody.thinking = {
                type: 'enabled',
                budget_tokens: 10000
            };
            requestBody.temperature = 1; // thinking 모드에서는 temperature 1 필수
        }

        const requestBodyStr = JSON.stringify(requestBody);

        const options = {
            hostname: 'api.anthropic.com',
            port: 443,
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Length': Buffer.byteLength(requestBodyStr)
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
                        // 검색 결과 추가
                        if (searchResults && searchResults.length > 0) {
                            jsonData.searchResults = searchResults;
                        }
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

        request.write(requestBodyStr);
        request.end();

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`
========================================
   Claude Chat Server
========================================

   http://localhost:${PORT}

   서버가 실행 중입니다!
========================================
`);
});
