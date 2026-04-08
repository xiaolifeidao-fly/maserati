#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const demoDir = path.resolve(__dirname, '..', 'client', 'app', 'src', 'publish', 'demo_data');
const inputs = ['ori.json', 'update.draft.json'];

function trimArrays(value) {
  if (Array.isArray(value)) {
    return value.slice(0, 2).map(trimArrays);
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const trimmed = {};
    for (const key of Object.keys(value)) {
      trimmed[key] = trimArrays(value[key]);
    }
    return trimmed;
  }
  return value;
}

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    sourceFiles: inputs,
  },
  data: {},
};

for (const name of inputs) {
  const inputPath = path.join(demoDir, name);
  if (!fs.existsSync(inputPath)) {
    console.error(`Missing input file: ${inputPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(inputPath, 'utf-8');
  const trimmed = trimArrays(JSON.parse(raw));
  output.data[name] = trimmed;
  const demoName = name.replace(/\.json$/i, '.demo.json');
  const demoPath = path.join(demoDir, demoName);
  fs.writeFileSync(demoPath, JSON.stringify(trimmed, null, 2));
  console.log(`Trimmed demo file written to ${demoPath}`);
}

const botPath = path.join(demoDir, 'demo.json');
fs.writeFileSync(botPath, JSON.stringify(output, null, 2));
console.log(`Trimmed data written to ${botPath}`);
