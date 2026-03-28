rm -rf ./dist/*
# tsc
npm run build
webpack --config webpack.config.js --mode production