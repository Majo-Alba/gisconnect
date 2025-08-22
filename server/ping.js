const express = require('express');
const app = express();
app.get('/healthz', (req,res) => res.json({ ok: true, ts: Date.now() }));
app.listen(4001, () => console.log('PING server on 4001'));
