
cp -rf static/html ../resource/
webpack --config webpack.config.js --mode development
electron . --disable-gpu --no-sandbox --max-old-space-size=4096