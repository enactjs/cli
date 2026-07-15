#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const a = fs.readFileSync(process.argv[2], 'utf8');
const b = fs.readFileSync(process.argv[3], 'utf8');

console.log('lengths', a.length, b.length);
const ca = a.match(/cacheID = "(\d+)"/);
const cb = b.match(/cacheID = "(\d+)"/);
console.log('cacheID', ca && ca[1], cb && cb[1]);

let diffCount = 0;
let firstDiff = -1;
for (let i = 0; i < Math.min(a.length, b.length); i++) {
	if (a[i] !== b[i]) {
		diffCount++;
		if (firstDiff === -1) firstDiff = i;
	}
}
console.log('diff chars', diffCount + (a.length !== b.length ? ' (length mismatch)' : ''));
if (firstDiff >= 0) {
	console.log('first diff context A:', JSON.stringify(a.slice(Math.max(0, firstDiff - 40), firstDiff + 40)));
	console.log('first diff context B:', JSON.stringify(b.slice(Math.max(0, firstDiff - 40), firstDiff + 40)));
}

const stripCache = s => s.replace(/cacheID = "\d+"/g, 'cacheID = "X"');
console.log('identical except cacheID?', stripCache(a) === stripCache(b));
