#!/bin/bash

# 设置远程服务器和路径
remote_path="/data/program/app/server/web-api"
# 建立SSH连接并执行远程命令
sshpass -p "$web-api_password" ssh -o StrictHostKeyChecking=no -T "$web-api_remote_server" << EOF
  mkdir -p $remote_path
  rm -rf $remote_path/*.sh
EOF

sshpass -p "$web-api_password" scp -p ./start.sh "$web-api_remote_server:$remote_path"
sshpass -p "$web-api_password" scp -p ./stop.sh "$web-api_remote_server:$remote_path"
