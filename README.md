# Colta

**Colta** is a small app designed to simplify the process of converting YouTube
videos. The idea came up because Justi was annoyed by having to search for
online converters, which often have download limits or simply don’t work as
expected.

The build is configured to generate a version of the app for Macs with ARM
processors. If you're using an Intel Mac, you can easily change the parameter by
replacing `--arch=arm64` with `--arch=x86`. Either way, I'll leave both versions
available in the releases.

---

## Features

- **Easy YouTube Downloads**  
  Convert YouTube videos to MP3 or MP4 by simply pasting the video URL.

- **Modern Utility Design**  
  Looks cool and is easy to use.

---

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/cijjas/colta.git
   cd colta
   ```

2. **Install Dependancies**

   ```bash
   npm install
   ```

3. **Ensure binaries are executable**

   ```bash
   chmod +x bin/yt-dlp bin/ffmpeg
   ```

---

## Usage

- **Run in Development**

  ```bash
  npm start
  ```

This will launch the Electron app. Enter a YouTube URL, and choose to download
as MP3 or MP4.

- **Package for Distribution**

To package the app for macOS (ARM64 or x64), run:

    ```bash
    npm run build
    ```

The packaged .app will be created in the output folder. Zip the .app file to
share it with your friends.

--

## Troubleshooting

Troubleshooting

- **App Flagged as “Damaged”:**

On macOS, if the app is blocked, try running:

    ```bash
    sudo xattr -rd com.apple.quarantine /path/to/Colta.app
    ```

- **Binaries Not Found:**

Ensure that yt-dlp and ffmpeg are correctly placed in the bin folder and marked
as executable.
