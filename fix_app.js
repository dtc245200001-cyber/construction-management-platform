const fs = require('fs');
let c = fs.readFileSync('backend/app.js', 'utf8');
c = c.replace(/pruneSessionInterval: 60/g, "pruneSessionInterval: process.env.NODE_ENV === 'test' ? false : 60");
fs.writeFileSync('backend/app.js', c);
