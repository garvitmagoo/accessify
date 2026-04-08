const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const size = 256;
const canvas = createCanvas(size, size);
const ctx = canvas.getContext('2d');

// Scale factor (SVG was 128x128, we're drawing at 256x256)
const s = size / 128;

// Background rounded rect
ctx.fillStyle = '#0078D4';
roundRect(ctx, 0, 0, size, size, 16 * s);
ctx.fill();

// Outer circle (eye outline)
ctx.strokeStyle = '#ffffff';
ctx.lineWidth = 5 * s;
ctx.beginPath();
ctx.arc(64 * s, 52 * s, 22 * s, 0, Math.PI * 2);
ctx.stroke();

// Inner circle (pupil)
ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.arc(64 * s, 52 * s, 8 * s, 0, Math.PI * 2);
ctx.fill();

// Smile curve
ctx.strokeStyle = '#ffffff';
ctx.lineWidth = 5 * s;
ctx.lineCap = 'round';
ctx.beginPath();
ctx.moveTo(40 * s, 90 * s);
ctx.quadraticCurveTo(64 * s, 110 * s, 88 * s, 90 * s);
ctx.stroke();

// Top indicator rectangle
ctx.fillStyle = '#ffffff';
roundRect(ctx, 60 * s, 30 * s, 8 * s, 10 * s, 2 * s);
ctx.fill();

// Write PNG
const outPath = path.join(__dirname, '..', 'icon.png');
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync(outPath, buffer);
console.log(`Icon written to ${outPath} (${buffer.length} bytes)`);

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
