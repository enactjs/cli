const { existsSync, mkdir, mkdirSync } = require('node:fs');

module.exports = {
  ensureDir: function (dir) {
    return new Promise(resolve => {
      if (!existsSync(dir)) {
        mkdir(dir, { recursive: true });
      }
      resolve();
    });
  },
  ensureDirSync: function (dir) {
    if (!existsSync(dir)) {
      mkdirSync(dir);
    }
  }
};