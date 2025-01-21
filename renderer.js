// Function to log messages by sending them to the main process
function logMessage(level, message) {
  window.electronAPI.logMessage({ level, message });
}

document.getElementById('startButton').addEventListener('click', async () => {
  logMessage('info', 'Start button clicked');
  console.log("Console: Start button clicked");

  const config = {
    inputDir: document.getElementById('input-folder').value,
    outputDir: document.getElementById('output-folder').value,
    watermarkText: document.getElementById('watermarkText').value,
    fontSize: parseInt(document.getElementById('fontSize').value, 10),
    opacity: parseInt(document.getElementById('opacity').value, 10),
    paddingTopBottom: parseInt(document.getElementById('paddingTopBottom').value, 10),
    paddingLeftRight: parseInt(document.getElementById('paddingLeftRight').value, 10),
    crop: document.getElementById('crop').checked,
  };

  logMessage('info', `Configuration to be sent: ${JSON.stringify(config)}`);
  console.log("Console: Configuration to be sent to main process:", config);

  const statusMessage = document.getElementById('statusMessage');
  statusMessage.textContent = 'Processing images...';

  try {
    const result = await window.electronAPI.startProcess(config);
    logMessage('info', `Result received from main process: ${JSON.stringify(result)}`);
    console.log("Console: Result from main process:", result);

    if (result.success) {
      statusMessage.style.color = 'green';
      statusMessage.textContent = result.message;
    } else {
      statusMessage.style.color = 'red';
      statusMessage.textContent = `Error: ${result.message}`;
    }
  } catch (error) {
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