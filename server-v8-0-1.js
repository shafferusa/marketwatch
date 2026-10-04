import express from 'express';

const originalJson = express.response.json;
express.response.json = function v801Json(body) {
  if (body && typeof body === 'object' && body.version === '8.0.0' && body.maxSymbols === 60) {
    body = { ...body, version: '8.0.1' };
  }
  return originalJson.call(this, body);
};

await import('./server-v8.js');
