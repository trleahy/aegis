const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');

let mainWindow;

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 500,
    minHeight: 400,
    minWidth:400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });

  mainWindow.loadFile('index.html');
});

ipcMain.handle('apply-watermark', async (event, config) => {
  console.log("MAIN: Received 'apply-watermark' event with config:", config);

  const {
    inputDir,
    outputDir,
    watermarkText,
    fontSize,
    opacity,
    paddingTopBottom,
    paddingLeftRight,
    crop,
  } = config;

  try {
    if (!fs.existsSync(inputDir)) {
      console.error(`MAIN: Input directory does not exist: ${inputDir}`);
      throw new Error(`Input directory does not exist: ${inputDir}`);
    }

    if (!fs.existsSync(outputDir)) {
      console.log(`MAIN: Output directory does not exist. Creating: ${outputDir}`);
      fs.mkdirSync(outputDir);
    }

    const files = fs.readdirSync(inputDir).filter(file => /\.(jpg|jpeg|png)$/i.test(file));
    console.log(`MAIN: Found ${files.length} image(s) to process`);

    if (files.length === 0) {
      throw new Error('No images found in the input directory.');
    }

    for (const file of files) {
      console.log(`MAIN: Processing file: ${file}`);
      const inputFile = path.join(inputDir, file);
      const outputFile = path.join(outputDir, file);

      let image = sharp(inputFile);

      if (crop) {
        const { width, height } = await image.metadata();
        console.log(`MAIN: Original dimensions for ${file}: ${width}x${height}`);

        const aspectRatio = 5 / 4;

        if (width / height > aspectRatio) {
          const newWidth = Math.floor(height * aspectRatio);
          console.log(`MAIN: Cropping ${file} to width: ${newWidth}`);
          image = image.extract({ left: (width - newWidth) / 2, top: 0, width: newWidth, height });
        } else {
          const newHeight = Math.floor(width / aspectRatio);
          console.log(`MAIN: Cropping ${file} to height: ${newHeight}`);
          image = image.extract({ left: 0, top: (height - newHeight) / 2, width, height: newHeight });
        }
      }

      const { width, height } = await image.metadata();
      console.log(`MAIN: Tiling watermark text over image dimensions: ${width}x${height}`);

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

      console.log(`MAIN: File processed and saved to: ${outputFile}`);
    }

    return { success: true, message: `Processed ${files.length} images successfully.` };
  } catch (error) {
    console.error('MAIN: Error during watermarking:', error);
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
    console.log('MAIN: Opening folder dialog...');
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
  
    if (result.canceled) {
      console.log('MAIN: Folder dialog canceled');
      return null; // User canceled the dialog
    }

    console.log('MAIN: Folder selected:', result.filePaths[0]);
    return result.filePaths[0]; // Return the selected folder path
  });