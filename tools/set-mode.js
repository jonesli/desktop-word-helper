// 临时工具：修改 userData 配置（用于模式切换测试）
const fs = require('fs');
const path = require('path');
const cfg = path.join(process.env.APPDATA, 'buzhijue-beidanci', 'config.json');
const d = JSON.parse(fs.readFileSync(cfg, 'utf8'));
const mode = process.argv[2];        // scroll | flash
const stay = process.argv[3];
if (mode) d.settings.mode = mode;
if (stay) d.settings.staySec = +stay;
fs.writeFileSync(cfg, JSON.stringify(d, null, 2));
console.log('now:', d.settings.dict, d.settings.mode, d.settings.staySec);
