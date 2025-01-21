const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

// Define folder structure
const documentsPath = app.getPath('documents'); // Get user's Documents folder
const appFolder = path.join(documentsPath, 'watermarker-app'); // Root folder for the app
const logsFolder = path.join(appFolder, 'logs'); // Logs folder
const outputFolder = path.join(appFolder, 'output'); // Output folder
const inputFolder = path.join(appFolder, 'input'); // Input Folder

// Ensure required folders exist
function createRequiredFolders() {
  [appFolder, logsFolder, outputFolder, inputFolder].forEach(folder => {
    if (!fs.existsSync(folder)) {
      logger.debug(`Creating required folder: ${folder}`);
      fs.mkdirSync(folder, { recursive: true });
    }
  });
}

// Configure Winston logger
const logger = winston.createLogger({
  level: 'debug', // Log levels: error, warn, info, http, verbose, debug, silly
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(), // Logs to console
    new DailyRotateFile({
      filename: path.join(logsFolder, 'app-%DATE%.log'), // Save logs in the 'logs' folder
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    }),
  ],
});

logger.info('Application starting...');

let mainWindow;

app.on('ready', () => {
  // Ensure required folders are created
  createRequiredFolders();
  logger.info('Required folders checked and created if necessary.');

  mainWindow = new BrowserWindow({
    width: 600,
    height: 700,
    minHeight: 600,
    maxHeight: 600,
    minWidth: 700,
    maxWidth: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });

  mainWindow.loadFile('index.html');
  logger.info('Main window loaded.');
});

ipcMain.handle('apply-watermark', async (event, config) => {
  logger.info('Received "apply-watermark" event.');
  logger.debug(`Configuration received: ${JSON.stringify(config)}`);

  const {
    inputDir,
    watermarkText,
    fontSize,
    opacity,
    paddingTopBottom,
    paddingLeftRight,
    crop,
  } = config;

  // Use the predefined folders
  const outputDir = path.join(app.getPath('documents'), 'watermarker-app', 'output');

  try {
    if (!fs.existsSync(inputDir)) {
      logger.error(`Input directory does not exist: ${inputDir}`);
      throw new Error(`Input directory does not exist: ${inputDir}`);
    }

    if (!fs.existsSync(outputDir)) {
      logger.info(`Output directory does not exist. Creating: ${outputDir}`);
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const files = fs.readdirSync(inputDir).filter(file => /\.(jpg|jpeg|png)$/i.test(file));
    logger.info(`Found ${files.length} image(s) to process.`);

    if (files.length === 0) {
      throw new Error('No images found in the input directory.');
    }

    for (const file of files) {
      logger.info(`Processing file: ${file}`);
      const inputFile = path.join(inputDir, file);
      const outputFile = path.join(outputDir, file);

      let image = sharp(inputFile);

      if (crop) {
        const { width, height } = await image.metadata();
        logger.info(`Original dimensions for ${file}: ${width}x${height}`);

        const aspectRatio = 5 / 4;

        if (width / height > aspectRatio) {
          const newWidth = Math.floor(height * aspectRatio);
          logger.info(`Cropping ${file} to width: ${newWidth}`);
          image = image.extract({ left: (width - newWidth) / 2, top: 0, width: newWidth, height });
        } else {
          const newHeight = Math.floor(width / aspectRatio);
          logger.info(`Cropping ${file} to height: ${newHeight}`);
          image = image.extract({ left: 0, top: (height - newHeight) / 2, width, height: newHeight });
        }
      }

      const { width, height } = await image.metadata();
      logger.info(`Tiling watermark text over image dimensions: ${width}x${height}`);

      const svg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <style>
            .watermark {
              fill: rgba(255, 255, 255, ${opacity / 100});
              font-size: ${fontSize}px;
              font-family: Arial, sans-serif;
              text-anchor: middle;
              dominant-baseline: middle;
            }
          </style>
          ${generateTiledText(width, height, watermarkText, fontSize, paddingLeftRight, paddingTopBottom)}
        </svg>
      `;

      await image
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .toFile(outputFile);

      logger.info(`File processed and saved to: ${outputFile}`);
    }

    logger.info('Watermark processing completed successfully.');
    return { success: true, message: `Processed ${files.length} images successfully.` };
  } catch (error) {
    logger.error(`Error during watermarking: ${error.message}`);
    return { success: false, message: error.message };
  }
});

function generateTiledText(width, height, text, fontSize, paddingX, paddingY) {
  let svgContent = '';
  const stepX = fontSize + paddingX;
  const stepY = fontSize + paddingY;

  for (let y = paddingY; y < height; y += stepY) {
    for (let x = paddingX; x < width; x += stepX) {
      svgContent += `<text class="watermark" x="${x}" y="${y}">${text}</text>`;
    }
  }

  return svgContent;
}

ipcMain.handle('select-folder', async () => {
  logger.info('Opening folder selection dialog.');
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });

  if (result.canceled) {
    logger.warn('Folder selection dialog canceled by user.');
    return null; // User canceled the dialog
  }

  logger.info(`Folder selected: ${result.filePaths[0]}`);
  return result.filePaths[0];
});
