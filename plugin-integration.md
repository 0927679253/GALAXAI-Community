# GALAXAI Minecraft plugin/API integration

เว็บจะถือข้อมูลใน `players` เป็นข้อมูลจากเซิร์ฟเวอร์เกมเมื่อปลั๊กอินของคุณส่งเข้ามา

## ส่งผู้เล่น 1 คน

`POST /api/plugin/player`

Header:
`x-plugin-key: <PLUGIN_API_KEY>`

JSON:
```json
{
  "name": "Steve_TH",
  "gamertag": "SteveTH",
  "level": 42,
  "playtime": 123.5,
  "balance": 9000
}
```

## ส่งหลายคน

`POST /api/plugin/players`

Header เดิม และ body:
```json
{
  "players": [
    {"name":"Steve_TH","gamertag":"SteveTH","level":42,"playtime":123.5,"balance":9000},
    {"name":"Alex_TH","gamertag":"AlexTH","level":18,"playtime":44,"balance":2500}
  ]
}
```

เรียกทุก 1–5 นาทีจากปลั๊กอินเพื่อให้ leaderboard และหน้า Player Lookup อัปเดต

> Endpoint นี้ไม่ใช่ Microsoft/Xbox OAuth และไม่ควรนำ `PLUGIN_API_KEY` ไปใส่ใน JavaScript ฝั่งเว็บ
