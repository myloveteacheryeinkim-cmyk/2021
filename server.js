const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`
========================================
   CharaChat - AI 캐릭터 채팅 플랫폼
========================================

   http://localhost:${PORT}

   서버가 실행 중입니다!
========================================
`);
});
