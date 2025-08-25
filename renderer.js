// Function to log messages by sending them to the main process
function logMessage(level, message) {
  window.electronAPI.logMessage({ level, message });
}

// Function to validate form inputs
function validateInputs() {
  const errors = [];

  // Get form values
  const inputDir = document.getElementById('input-folder').value.trim();
  const watermarkText = document.getElementById('watermarkText').value.trim();
  const fontSize = document.getElementById('fontSize').value;
  const opacity = document.getElementById('opacity').value;
  const paddingTopBottom = document.getElementById('paddingTopBottom').value;
  const paddingLeftRight = document.getElementById('paddingLeftRight').value;

  // Validate required fields
  if (!inputDir) {
    errors.push('Input folder is required');
  }

  if (!watermarkText) {
    errors.push('Watermark text is required');
  }

  // Validate numeric inputs
  const fontSizeNum = parseInt(fontSize, 10);
  if (isNaN(fontSizeNum) || fontSizeNum < 1 || fontSizeNum > 200) {
    errors.push('Font size must be a number between 1 and 200');
  }

  const opacityNum = parseInt(opacity, 10);
  if (isNaN(opacityNum) || opacityNum < 0 || opacityNum > 100) {
    errors.push('Opacity must be a number between 0 and 100');
  }

  const paddingTBNum = parseInt(paddingTopBottom, 10);
  if (isNaN(paddingTBNum) || paddingTBNum < 0 || paddingTBNum > 1000) {
    errors.push('Padding Top/Bottom must be a number between 0 and 1000');
  }

  const paddingLRNum = parseInt(paddingLeftRight, 10);
  if (isNaN(paddingLRNum) || paddingLRNum < 0 || paddingLRNum > 1000) {
    errors.push('Padding Left/Right must be a number between 0 and 1000');
  }

  return errors;
}

// Function to display validation errors
function displayValidationErrors(errors) {
  const statusMessage = document.getElementById('statusMessage');
  if (errors.length > 0) {
    statusMessage.style.color = 'red';
    statusMessage.innerHTML = '<strong>Validation Errors:</strong><br>' + errors.join('<br>');
    return false;
  }
  return true;
}

document.getElementById('startButton').addEventListener('click', async () => {
  logMessage('info', 'Start button clicked');
  console.log("Console: Start button clicked");

  // Validate inputs before processing
  const validationErrors = validateInputs();
  if (!displayValidationErrors(validationErrors)) {
    logMessage('warn', 'Form validation failed');
    return; // Stop processing if validation fails
  }

  const config = {
    inputDir: document.getElementById('input-folder').value.trim(),
    outputDir: document.getElementById('output-folder').value,
    watermarkText: document.getElementById('watermarkText').value.trim(),
    fontSize: parseInt(document.getElementById('fontSize').value, 10),
    opacity: parseInt(document.getElementById('opacity').value, 10),
    paddingTopBottom: parseInt(document.getElementById('paddingTopBottom').value, 10),
    paddingLeftRight: parseInt(document.getElementById('paddingLeftRight').value, 10),
    crop: document.getElementById('crop').checked,
  };

  logMessage('info', `Configuration to be sent: ${JSON.stringify(config)}`);
  console.log("Console: Configuration to be sent to main process:", config);

  const statusMessage = document.getElementById('statusMessage');
  statusMessage.style.color = 'blue';
  statusMessage.textContent = 'Processing images...';

  // Set up progress listener
  window.electronAPI.onProcessingProgress((event, progressData) => {
    const { processed, total, percentage, currentBatch } = progressData;
    statusMessage.style.color = 'blue';
    statusMessage.innerHTML = `Processing images... ${processed}/${total} (${percentage}%)<br>Current batch: ${currentBatch.join(', ')}`;
  });

  try {
    const result = await window.electronAPI.startProcess(config);
    logMessage('info', `Result received from main process: ${JSON.stringify(result)}`);
    console.log("Console: Result from main process:", result);

    // Clean up progress listener
    window.electronAPI.removeProgressListener();

    if (result.success) {
      statusMessage.style.color = 'green';
      statusMessage.textContent = result.message;
    } else {
      statusMessage.style.color = 'red';
      statusMessage.textContent = `Error: ${result.message}`;
    }
  } catch (error) {
    // Clean up progress listener on error
    window.electronAPI.removeProgressListener();

    logMessage('error', `Error invoking apply-watermark: ${error.message}`);
    console.error("Console: Error invoking apply-watermark:", error);
    statusMessage.style.color = 'red';
    statusMessage.textContent = `Error: ${error.message}`;
  }
});

document.getElementById('browse-input').addEventListener('click', async (event) => {
  event.preventDefault(); // Prevent form submission
  logMessage('info', 'Browse input folder button clicked');
  
  const result = await window.electronAPI.selectFolder();
  if (result) {
    document.getElementById('input-folder').value = result;
    logMessage('info', `Input folder selected: ${result}`);
  } else {
    logMessage('warn', 'Input folder selection was canceled.');
  }
});

document.getElementById('aboutButton').addEventListener('click', () => {
  window.electronAPI.openAboutWindow();
});
