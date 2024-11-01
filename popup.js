document.addEventListener('DOMContentLoaded', function() {
  console.log('Popup loaded');
  const addOverlayButton = document.getElementById('addOverlay');
  const applyAndDownloadButton = document.getElementById('applyAndDownload');
  const imageInput = document.getElementById('imageInput');

  // Check if we're on a PDF page and if there's an existing overlay
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'checkOverlay'}, function(response) {
        if (chrome.runtime.lastError) {
          console.error('Error checking overlay:', chrome.runtime.lastError);
          return;
        }
        if (response && response.hasOverlay) {
          applyAndDownloadButton.style.display = 'block';
        }
      });
    }
  });

  addOverlayButton.addEventListener('click', function() {
    console.log('Add overlay button clicked');
    if (imageInput.files.length > 0) {
      const file = imageInput.files[0];
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
      }

      const reader = new FileReader();
      reader.onload = function(e) {
        console.log('Image loaded, sending to content script');
        const imageUrl = e.target.result;
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'addOverlay',
              imageUrl: imageUrl
            }, function(response) {
              if (chrome.runtime.lastError) {
                console.error('Error sending message:', chrome.runtime.lastError);
                return;
              }
              console.log('Overlay added successfully');
              applyAndDownloadButton.style.display = 'block';
            });
          }
        });
      };

      reader.onerror = function(error) {
        console.error('Error reading file:', error);
        alert('Error reading the image file. Please try again.');
      };

      reader.readAsDataURL(file);
    } else {
      alert('Please select an image file first.');
    }
  });

  applyAndDownloadButton.addEventListener('click', function() {
    console.log('Apply and download button clicked');
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'applyAndDownload'
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.error('Error sending message:', chrome.runtime.lastError);
            return;
          }
          console.log('PDF generation initiated');
        });
      }
    });
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Received message in popup:', request.action);
  if (request.action === 'overlayAdded') {
    const applyAndDownloadButton = document.getElementById('applyAndDownload');
    if (applyAndDownloadButton) {
      applyAndDownloadButton.style.display = 'block';
    }
  }
});
