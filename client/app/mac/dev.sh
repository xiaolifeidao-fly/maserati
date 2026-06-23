
cp -rf static/html ../resource/
webpack --config webpack.config.js --mode development
electron . --max-old-space-size=4096