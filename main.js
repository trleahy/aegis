const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

// Configuration constants
const CONFIG = {
  // Image processing constants
  CROP_ASPECT_RATIO: 5 / 4,

  // Watermark styling constants
  WATERMARK_COLOR: 'rgba(255, 255, 255, {opacity})', // {opacity} will be replaced
  WATERMARK_FONT_FAMILY: 'Arial, sans-serif',
  WATERMARK_TEXT_ANCHOR: 'middle',
  WATERMARK_DOMINANT_BASELINE: 'middle',

  // Processing constants
  MAX_CONCURRENT_IMAGES: 4,

  // Logging constants
  LOG_MAX_SIZE: '20m',
  LOG_MAX_FILES: '14d',
  LOG_DATE_PATTERN: 'YYYY-MM-DD',

  // Window constants
  MAIN_WINDOW: {
    WIDTH: 700,
    HEIGHT: 600,
    MIN_HEIGHT: 500,
    MAX_HEIGHT: 800,
    MIN_WIDTH: 600,
    MAX_WIDTH: 900
  },

  ABOUT_WINDOW: {
    WIDTH: 500,
    HEIGHT: 500
  }
};

// Define folder structure
const documentsPath = app.getPath('documents'); // Get user's Documents folder
const appFolder = path.join(documentsPath, 'Aegis'); // Root folder for the app
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
      datePattern: CONFIG.LOG_DATE_PATTERN,
      maxSize: CONFIG.LOG_MAX_SIZE,
      maxFiles: CONFIG.LOG_MAX_FILES,
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
    width: CONFIG.MAIN_WINDOW.WIDTH,
    height: CONFIG.MAIN_WINDOW.HEIGHT,
    minHeight: CONFIG.MAIN_WINDOW.MIN_HEIGHT,
    maxHeight: CONFIG.MAIN_WINDOW.MAX_HEIGHT,
    minWidth: CONFIG.MAIN_WINDOW.MIN_WIDTH,
    maxWidth: CONFIG.MAIN_WINDOW.MAX_WIDTH,
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
  const outputDir = path.join(app.getPath('documents'), 'Aegis', 'output');

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

    // Process images in parallel with controlled concurrency
    const maxConcurrency = Math.min(CONFIG.MAX_CONCURRENT_IMAGES, files.length);
    const processedFiles = [];

    logger.info(`Starting parallel processing of ${files.length} images with max concurrency: ${maxConcurrency}`);
    logMemoryUsage('before processing');

    // Process files in batches to control memory usage
    for (let i = 0; i < files.length; i += maxConcurrency) {
      const batch = files.slice(i, i + maxConcurrency);
      logger.info(`Processing batch ${Math.floor(i / maxConcurrency) + 1}: ${batch.join(', ')}`);

      try {
        const batchPromises = batch.map(file =>
          processImage(file, inputDir, outputDir, config)
            .catch(error => {
              logger.error(`Error processing ${file}: ${error.message}`);
              throw new Error(`Failed to process ${file}: ${error.message}`);
            })
        );

        const batchResults = await Promise.all(batchPromises);
        processedFiles.push(...batchResults);

        // Send progress update to renderer
        const progress = Math.round((processedFiles.length / files.length) * 100);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('processing-progress', {
            processed: processedFiles.length,
            total: files.length,
            percentage: progress,
            currentBatch: batch
          });
        }

        logger.info(`Batch completed. Progress: ${processedFiles.length}/${files.length} (${progress}%)`);

        // Force garbage collection after each batch to manage memory
        if (global.gc) {
          global.gc();
          logger.debug(`Garbage collection triggered after batch ${Math.floor(i / maxConcurrency) + 1}`);
        }

        // Log memory usage after each batch
        logMemoryUsage(`after batch ${Math.floor(i / maxConcurrency) + 1}`);

      } catch (error) {
        logger.error(`Batch processing failed: ${error.message}`);
        throw error; // Re-throw to be caught by outer try-catch
      }
    }

    logger.info(`Watermark processing completed successfully. Processed ${processedFiles.length} images.`);
    return { success: true, message: `Processed ${processedFiles.length} images successfully using parallel processing.` };
  } catch (error) {
    logger.error(`Error during watermarking: ${error.message}`);
    return { success: false, message: error.message };
  }
});

// Function to log memory usage
function logMemoryUsage(context = '') {
  const memUsage = process.memoryUsage();
  const formatBytes = (bytes) => Math.round(bytes / 1024 / 1024 * 100) / 100;

  logger.debug(`Memory usage ${context}: RSS: ${formatBytes(memUsage.rss)}MB, Heap Used: ${formatBytes(memUsage.heapUsed)}MB, Heap Total: ${formatBytes(memUsage.heapTotal)}MB, External: ${formatBytes(memUsage.external)}MB`);
}

function generateTiledText(width, height, text, fontSize, paddingX, paddingY) {
  const stepX = fontSize + paddingX;
  const stepY = fontSize + paddingY;

  // Pre-calculate the number of elements to optimize memory allocation
  const numCols = Math.floor((width - paddingX) / stepX) + 1;
  const numRows = Math.floor((height - paddingY) / stepY) + 1;
  const totalElements = numCols * numRows;

  // Use array with pre-allocated size for better performance
  const svgElements = new Array(totalElements);
  let elementIndex = 0;

  for (let y = paddingY; y < height; y += stepY) {
    for (let x = paddingX; x < width; x += stepX) {
      svgElements[elementIndex++] = `<text class="watermark" x="${x}" y="${y}">${text}</text>`;
    }
  }

  // Use array.join() which is more efficient than string concatenation
  return svgElements.slice(0, elementIndex).join('');
}

// Function to process a single image
async function processImage(file, inputDir, outputDir, config) {
  const { watermarkText, fontSize, opacity, paddingTopBottom, paddingLeftRight, crop } = config;

  logger.info(`Processing file: ${file}`);
  const inputFile = path.join(inputDir, file);
  const outputFile = path.join(outputDir, file);

  let image = null;
  let svgBuffer = null;

  try {
    image = sharp(inputFile);

    // Get metadata once and cache it
    let metadata = await image.metadata();
    let { width, height } = metadata;

    if (crop) {
      logger.info(`Original dimensions for ${file}: ${width}x${height}`);

      const aspectRatio = CONFIG.CROP_ASPECT_RATIO;

      if (width / height > aspectRatio) {
        const newWidth = Math.floor(height * aspectRatio);
        logger.info(`Cropping ${file} to width: ${newWidth}`);
        image = image.extract({ left: (width - newWidth) / 2, top: 0, width: newWidth, height });
        // Update dimensions after cropping
        width = newWidth;
      } else {
        const newHeight = Math.floor(width / aspectRatio);
        logger.info(`Cropping ${file} to height: ${newHeight}`);
        image = image.extract({ left: 0, top: (height - newHeight) / 2, width, height: newHeight });
        // Update dimensions after cropping
        height = newHeight;
      }
    }

    logger.info(`Tiling watermark text over image dimensions: ${width}x${height}`);

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .watermark {
            fill: ${CONFIG.WATERMARK_COLOR.replace('{opacity}', opacity / 100)};
            font-size: ${fontSize}px;
            font-family: ${CONFIG.WATERMARK_FONT_FAMILY};
            text-anchor: ${CONFIG.WATERMARK_TEXT_ANCHOR};
            dominant-baseline: ${CONFIG.WATERMARK_DOMINANT_BASELINE};
          }
        </style>
        ${generateTiledText(width, height, watermarkText, fontSize, paddingLeftRight, paddingTopBottom)}
      </svg>
    `;

    // Create buffer once and reuse
    svgBuffer = Buffer.from(svg);

    await image
      .composite([{ input: svgBuffer, top: 0, left: 0 }])
      .toFile(outputFile);

    logger.info(`File processed and saved to: ${outputFile}`);
    return file; // Return the filename for progress tracking

  } catch (error) {
    logger.error(`Error processing ${file}: ${error.message}`);
    throw error;
  } finally {
    // Explicit cleanup to free memory
    if (image) {
      try {
        // Force garbage collection of Sharp instance
        image = null;
      } catch (cleanupError) {
        logger.warn(`Cleanup warning for ${file}: ${cleanupError.message}`);
      }
    }

    // Clear buffer reference
    svgBuffer = null;

    // Suggest garbage collection for large batches
    if (global.gc && Math.random() < 0.1) { // 10% chance to trigger GC
      global.gc();
    }
  }
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

ipcMain.on('open-about-window', () => {
  const aboutWindow = new BrowserWindow({
    width: CONFIG.ABOUT_WINDOW.WIDTH,
    height: CONFIG.ABOUT_WINDOW.HEIGHT,
    title: 'About Aegis',
    resizable: false,
    minimizable: false,
    maximizable: false,
    // modal: true,
    parent: mainWindow,
    webPreferences: {
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  aboutWindow.loadFile('about.html');
  logger.info('About window loaded.');
});

// Handle log messages from renderer process
ipcMain.on('log-message', (event, logData) => {
  const { level, message } = logData;

  // Use the appropriate logger method based on the level
  switch (level.toLowerCase()) {
    case 'error':
      logger.error(`[Renderer] ${message}`);
      break;
    case 'warn':
      logger.warn(`[Renderer] ${message}`);
      break;
    case 'info':
      logger.info(`[Renderer] ${message}`);
      break;
    case 'debug':
      logger.debug(`[Renderer] ${message}`);
      break;
    default:
      logger.info(`[Renderer] ${message}`);
  }
});
