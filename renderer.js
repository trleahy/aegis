document.getElementById('startButton').addEventListener('click', async () => {
    console.log("Start button clicked");
  
    const config = {
      inputDir: document.getElementById('input-folder').value, // Corrected ID
      outputDir: document.getElementById('output-folder').value, // Corrected ID
      watermarkText: document.getElementById('watermarkText').value,
      fontSize: parseInt(document.getElementById('fontSize').value, 10),
      opacity: parseInt(document.getElementById('opacity').value, 10),
      paddingTopBottom: parseInt(document.getElementById('paddingTopBottom').value, 10),
      paddingLeftRight: parseInt(document.getElementById('paddingLeftRight').value, 10),
      crop: document.getElementById('crop').checked,
    };
  
    console.log("Configuration to be sent to main process:", config);
  
    const statusMessage = document.getElementById('statusMessage');
    statusMessage.textContent = 'Processing images...';
  
    try {
      const result = await window.electronAPI.startProcess(config);
      console.log("Result from main process:", result);
  
      if (result.success) {
        statusMessage.style.color = 'green';
        statusMessage.textContent = result.message;
      } else {
        statusMessage.style.color = 'red';
        statusMessage.textContent = `Error: ${result.message}`;
      }
    } catch (error) {
      console.error("Error invoking apply-watermark:", error);
      statusMessage.style.color = 'red';
      statusMessage.textContent = `Error: ${error.message}`;
    }
  });

document.getElementById('browse-input').addEventListener('click', async (event) => {
event.preventDefault(); // Prevent form submission
const result = await window.electronAPI.selectFolder();
if (result) {
    document.getElementById('input-folder').value = result;
}
});

document.getElementById('browse-output').addEventListener('click', async (event) => {
event.preventDefault(); // Prevent form submission
const result = await window.electronAPI.selectFolder();
if (result) {
    document.getElementById('output-folder').value = result;
}
});
