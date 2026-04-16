#!/bin/bash

# 设置远程服务器和路径
remote_path="/data/program/app/server/app-api"
# 建立SSH连接并执行远程命令
sshpass -p "$app-api_password" ssh -o StrictHostKeyChecking=no -T "$app-api_remote_server" << EOF
  mkdir -p $remote_path
  rm -rf $remote_path/*.sh
EOF

sshpass -p "$app-api_password" scp -p ./start.sh "$app-api_remote_server:$remote_path"
sshpass -p "$app-api_password" scp -p ./stop.sh "$app-api_remote_server:$remote_path"
