'use client';
import React, { useEffect, useState } from 'react';
import { Card, Progress, Button, message, Modal, Typography } from 'antd';
import { InstallerApi } from '@eleapi/installer.api';
import styles from './page.module.css';

const { Paragraph } = Typography;

export default function InstallerPage() {
  const [progress, setProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadComplete, setIsDownloadComplete] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; releaseNotes: string; manualDownload: boolean; downloadUrl: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setUpdateInfo({
      version: params.get('version') ?? '',
      releaseNotes: params.get('releaseNotes') ?? '',
      manualDownload: params.get('manualDownload') === 'true',
      downloadUrl: params.get('downloadUrl') ?? '',
    });

    const api = new InstallerApi();
    api.onMonitorDownloadProgress((percent: number) => {
      setProgress(Number(percent));
    });
    api.onMonitorUpdateDownloaded((event: any) => {
      setIsDownloading(false);
      setIsDownloadComplete(true);
      if (event?.version) {
        setUpdateInfo((prev) => ({
          version: event.version,
          releaseNotes: event.releaseNotes ?? '',
          manualDownload: prev?.manualDownload ?? false,
          downloadUrl: prev?.downloadUrl ?? '',
        }));
      }
    });
    api.onMonitorUpdateDownloadedError((error: any) => {
      message.error('更新出错: ' + (typeof error === 'string' ? error : error?.message ?? '未知错误'));
    });
  }, []);

  const handleUpdate = async () => {
    try {
      setIsDownloading(true);
      await new InstallerApi().update();
    } catch (error) {
      message.error('下载失败: ' + error);
      setIsDownloading(false);
    }
  };

  const handleOpenDownloadUrl = async () => {
    if (!updateInfo?.downloadUrl) {
      message.error('下载地址为空');
      return;
    }

    try {
      await new InstallerApi().openDownloadUrl(updateInfo.downloadUrl);
    } catch (error) {
      message.error('打开下载地址失败: ' + error);
    }
  };

  const handleCancel = () => {
    Modal.confirm({
      title: '确认退出',
      content: '确定要退出吗？',
      onOk: async () => {
        try {
          await new InstallerApi().cancelUpdate();
        } catch (error) {
          message.error('退出失败: ' + error);
        }
      },
    });
  };

  const handleInstall = async () => {
    try {
      await new InstallerApi().install();
    } catch (error) {
      message.error('安装失败: ' + error);
    }
  };

  return (
    <div className={styles.container}>
      <Card title="软件更新" className={styles.card}>
        {updateInfo && (
          <div className={styles.updateInfo}>
            <h3>版本 {updateInfo.version}</h3>
            {updateInfo.releaseNotes && <p>{updateInfo.releaseNotes}</p>}
            {updateInfo.manualDownload && updateInfo.downloadUrl && (
              <Paragraph copyable className={styles.downloadUrl}>
                {updateInfo.downloadUrl}
              </Paragraph>
            )}
          </div>
        )}

        {!updateInfo?.manualDownload && (
          <Progress
            percent={progress}
            status={isDownloading ? 'active' : 'normal'}
            className={styles.progress}
          />
        )}

        <div className={styles.actions}>
          {updateInfo?.manualDownload ? (
            <>
              <Button type="primary" onClick={handleOpenDownloadUrl}>
                打开下载地址
              </Button>
              <Button onClick={handleCancel}>退出</Button>
            </>
          ) : !isDownloadComplete ? (
            <>
              <Button
                type="primary"
                onClick={handleUpdate}
                loading={isDownloading}
                disabled={isDownloading}
              >
                立即更新
              </Button>
              {isDownloading && (
                <Button onClick={handleCancel}>退出</Button>
              )}
            </>
          ) : (
            <Button type="primary" onClick={handleInstall}>
              立即安装
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
