#!/bin/bash

# 继续执行打包过程
sh package.sh
cp .env ./dist/
electron-builder --win --x64
