const path = require('path');
const nodeExternals = require('webpack-node-externals');

const sharedConfig = {
  resolve: {
    extensions: ['.ts', '.js', '.json'],
    alias: {
      "@src": path.resolve(__dirname, './src'),
      "@model": path.resolve(__dirname, '../common/model'),
      "@api": path.resolve(__dirname, '../common/api'),
      "@utils": path.resolve(__dirname, '../common/utils'),
      "@eleapi": path.resolve(__dirname, '../common/eleapi'),
      "@enums": path.resolve(__dirname, '../common/enums')
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  node: {
    __dirname: false,
  }
};

const mainConfig = {
  ...sharedConfig,
  name: 'main',
  target: 'electron-main',
  entry: {
    main: './src/main.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  externals: [nodeExternals({
    allowlist: [/^electron-store$/],
  })],
};

const preloadConfig = {
  ...sharedConfig,
  name: 'preload',
  target: 'electron-preload',
  entry: {
    preload: './src/preload.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  // Preload 运行在受限上下文，依赖需要直接打进 bundle，避免运行时 require 失败。
  externals: [
    ({ request }, callback) => {
      if (request === 'electron') {
        return callback(null, 'commonjs2 electron');
      }
      return callback();
    }
  ],
};

module.exports = [mainConfig, preloadConfig];
