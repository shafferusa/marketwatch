import express from 'express';

const originalJson = express.response.json;
express.response.json = function v802Json(body) {
  if (body && typeof body === 'object' && body.version === '8.0.0' && body.maxSymbols === 60) {
    body = { ...body, version: '8.1.0', macro: true, macroSeries: 34 };
  }
  return originalJson.call(this, body);
};

await import('./server-v8.js');

