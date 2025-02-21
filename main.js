const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const fs = require('fs');
const os = require('os');

// require('electron-reload')(__dirname, {
//   electron: require(`${__dirname}/node_modules/electron`),
// });

(async () => {
  const { default: isDev } = await import('electron-is-dev');

  // Track a single download at a time
  let currentProc = null; // Child process for yt-dlp
  let currentItem = null; // Electron DownloadItem

  let mainWindow;
  let server;

  function getBinDir() {
    return isDev
      ? path.join(__dirname, 'bin')
      : path.join(process.resourcesPath, 'bin');
  }

  function createExpressApp() {
    const expApp = express();
    const PORT = 3000;

    // const downloadsDir = path.join(__dirname, 'downloads');
    // if (!fs.existsSync(downloadsDir)) {
    //   fs.mkdirSync(downloadsDir);
    // }

    // Test route
    expApp.get('/', (req, res) => {
      res.send('Local YouTube Downloader server is running!');
    });

    // Download route
    expApp.get('/download', (req, res) => {
      const videoId = req.query.videoId;
      const type = req.query.type; // 'mp3' or 'mp4'

      if (!videoId || !type) {
        return res.status(400).send("Missing 'videoId' or 'type' (mp3/mp4).");
      }

      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

      const outFilename = `download_${videoId}_${Date.now()}.${type}`;
      const outPath = path.join(os.tmpdir(), outFilename);
      const binDir = getBinDir();
      const ytDlpPath = path.join(binDir, 'yt-dlp');
      const ffmpegPath = path.join(binDir, 'ffmpeg');

      let args = [];
      if (type === 'mp3') {
        args = [
          '-x',
          '--audio-format',
          'mp3',
          '--ffmpeg-location',
          ffmpegPath,
          '-o',
          outPath,
          youtubeUrl,
        ];
      } else {
        args = [
          '-f',
          'best',
          '--merge-output-format',
          'mp4',
          '--ffmpeg-location',
          ffmpegPath,
          '-o',
          outPath,
          youtubeUrl,
        ];
      }

      const proc = spawn(ytDlpPath, args);
      currentProc = proc; // store reference so we can kill it on cancel

      proc.stdout.on('data', data => {
        console.log(`yt-dlp stdout: ${data}`);
      });
      proc.stderr.on('data', data => {
        console.error(`yt-dlp stderr: ${data}`);
      });

      proc.on('close', code => {
        console.log(`yt-dlp exited with code ${code}`);

        // If code === 0, success => stream the file
        if (code === 0) {
          // Only if we didnt kill the process
          if (fs.existsSync(outPath)) {
            const stat = fs.statSync(outPath);
            res.setHeader('Content-Length', stat.size);

            if (type === 'mp3') {
              res.setHeader('Content-Type', 'audio/mpeg');
              res.setHeader(
                'Content-Disposition',
                'attachment; filename="video.mp3"',
              );
            } else {
              res.setHeader('Content-Type', 'video/mp4');
              res.setHeader(
                'Content-Disposition',
                'attachment; filename="video.mp4"',
              );
            }

            const readStream = fs.createReadStream(outPath);

            readStream.on('end', () => {
              fs.unlink(outPath, err => {
                if (err) console.error('Error deleting temp file:', err);
              });
            });
            readStream.on('error', () => {
              // Also remove if theres an error
              try {
                fs.unlinkSync(outPath);
              } catch {}
            });

            readStream.pipe(res);
          } else {
            // Theoretically shouldnt happen unless file was removed
            res.status(500).send('File not found after conversion.');
          }
        } else {
          // If it failed or was canceled, send a minimal response
          res.status(500).send('Download was canceled or failed.');
        }

        // Clear references if this is the active proc
        if (currentProc === proc) {
          currentProc = null;
        }
      });
    });

    const serverInstance = expApp.listen(PORT, () => {
      console.log(`Express server running on http://localhost:${PORT}`);
    });
    return serverInstance;
  }

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 600,
      height: 400,
      frame: false,
      titleBarStyle: 'hiddenInset',

      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    // Listen for Electrons download events (the actual file download)
    mainWindow.webContents.session.on('will-download', (event, item) => {
      currentItem = item; // track for cancellation

      item.on('updated', (evt, state) => {
        if (state === 'progressing') {
          const received = item.getReceivedBytes();
          const total = item.getTotalBytes();
          const progress = total > 0 ? received / total : 0;
          console.log(`Download progress: ${Math.round(progress * 100)}%`);
          mainWindow.setProgressBar(progress);

          mainWindow.webContents.send(
            'download-progress',
            Math.round(progress * 100),
          );
        }
      });

      item.once('done', (evt, state) => {
        if (state === 'completed') {
          console.log('Download completed successfully.');
        } else {
          console.log(`Download failed or canceled: ${state}`);
        }
        mainWindow.setProgressBar(-1);
        mainWindow.webContents.send('download-complete');
        currentItem = null;
      });
    });
  }

  // Start a download from renderer
  ipcMain.on('start-download', (event, { videoId, type }) => {
    const dlUrl = `http://localhost:3000/download?videoId=${videoId}&type=${type}`;
    mainWindow.webContents.downloadURL(dlUrl, { saveAs: true });
  });

  // Cancel everything if user clicks "Cancel"
  ipcMain.on('cancel-download', () => {
    // Kill yt-dlp
    if (currentProc) {
      console.log('Killing yt-dlp process...');
      currentProc.kill();
      currentProc = null;
    }
    // Cancel the Electron download
    if (currentItem) {
      console.log('Canceling the Electron DownloadItem...');
      currentItem.cancel();
      currentItem = null;
    }
    // Notify renderer to hide loader/cancel button
    mainWindow.webContents.send('download-complete');
  });

  ipcMain.handle('get-username', () => {
    return os.userInfo().username;
  });

  app.whenReady().then(() => {
    server = createExpressApp();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    if (server) {
      server.close(() => {
        console.log('Express server stopped.');
      });
    }
  });
})();
