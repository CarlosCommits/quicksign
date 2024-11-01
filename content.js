// Initialize PDF.js
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.js');
}

let pdfDoc = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
let scale = 1.5;
let canvas = null;
let ctx = null;
let overlay = null;
let overlayImage = null;
let isDragging = false;
let startX, startY;

function createOverlay(imageUrl) {
  console.log('Creating overlay with image:', imageUrl);

  // Remove existing overlay if it exists
  if (overlay) {
    overlay.remove();
  }

  // Create overlay directly in the document body
  overlay = document.createElement('div');
  overlay.id = 'pdf-image-overlay';
  overlay.style.position = 'fixed';
  overlay.style.zIndex = '9999';
  overlay.style.cursor = 'move';
  overlay.style.pointerEvents = 'auto';

  overlayImage = document.createElement('img');
  overlayImage.src = imageUrl;
  overlayImage.style.width = '200px';
  overlayImage.style.height = 'auto';
  overlayImage.style.display = 'block';

  overlayImage.onload = function() {
    console.log('Image loaded successfully');
    const viewportWidth = window.innerWidth;
    const imageWidth = 200;
    const topMargin = 100;
    
    // Position in the center of the viewport
    overlay.style.left = ((viewportWidth - imageWidth) / 2) + 'px';
    overlay.style.top = topMargin + 'px';

    chrome.runtime.sendMessage({action: 'overlayAdded'});
  };

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  resizeHandle.style.position = 'absolute';
  resizeHandle.style.bottom = '0';
  resizeHandle.style.right = '0';
  resizeHandle.style.width = '10px';
  resizeHandle.style.height = '10px';
  resizeHandle.style.background = '#007bff';
  resizeHandle.style.cursor = 'se-resize';

  overlay.appendChild(overlayImage);
  overlay.appendChild(resizeHandle);
  document.body.appendChild(overlay);

  overlay.addEventListener('mousedown', startDragging);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', stopDragging);

  resizeHandle.addEventListener('mousedown', startResizing);
}

function startDragging(e) {
  if (e.target === overlay || e.target === overlayImage) {
    isDragging = true;
    startX = e.clientX - overlay.offsetLeft;
    startY = e.clientY - overlay.offsetTop;
    e.preventDefault();
  }
}

function drag(e) {
  if (isDragging) {
    overlay.style.left = (e.clientX - startX) + 'px';
    overlay.style.top = (e.clientY - startY) + 'px';
    e.preventDefault();
  }
}

function stopDragging() {
  isDragging = false;
}

function startResizing(e) {
  e.stopPropagation();
  const startWidth = overlayImage.offsetWidth;
  const startHeight = overlayImage.offsetHeight;
  const startX = e.clientX;
  const startY = e.clientY;

  function resize(e) {
    const width = startWidth + (e.clientX - startX);
    const height = startHeight + (e.clientY - startY);
    overlayImage.style.width = width + 'px';
    overlayImage.style.height = height + 'px';
    e.preventDefault();
  }

  function stopResizing() {
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResizing);
  }

  document.addEventListener('mousemove', resize);
  document.addEventListener('mouseup', stopResizing);
}

function searchInFrame(frame, selectors) {
  try {
    const doc = frame.contentDocument || frame.contentWindow?.document;
    if (!doc) return null;

    console.log('Searching in frame:', {
      url: frame.src,
      documentReady: doc.readyState
    });

    for (const selector of selectors) {
      const elements = doc.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`Found element with selector "${selector}" in frame`);
        return { element: elements[0], document: doc };
      }
    }

    // Recursively search in nested frames
    const frames = doc.getElementsByTagName('iframe');
    for (const nestedFrame of frames) {
      const result = searchInFrame(nestedFrame, selectors);
      if (result) return result;
    }
  } catch (e) {
    console.log('Error accessing frame:', e);
  }
  return null;
}

function findPDFCanvas() {
  const selectors = [
    'canvas#page-canvas',          // Common PDF.js canvas ID
    'canvas.page',                 // Chrome PDF Viewer
    '#viewer canvas',              // PDF.js
    '.pdfViewer canvas',           // PDF.js alternative
    '#pdf-canvas',                 // Generic PDF canvas ID
    'canvas[data-pdf-page]'        // Custom PDF viewer
  ];

  console.log('Starting PDF canvas search...');
  console.log('Document state:', document.readyState);
  console.log('URL:', window.location.href);

  // First try direct canvas in main document
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`Found canvas with selector "${selector}" in main document`);
      return {
        canvas: elements[0],
        container: elements[0].parentElement,
        document: document
      };
    }
  }

  // Search in all frames
  const frames = document.getElementsByTagName('iframe');
  console.log(`Searching in ${frames.length} frames`);
  
  for (const frame of frames) {
    const result = searchInFrame(frame, selectors);
    if (result) {
      return {
        canvas: result.element,
        container: result.element.parentElement,
        document: result.document
      };
    }
  }

  // If no canvas found, check for PDF object/embed
  const pdfElements = document.querySelectorAll('embed[type="application/pdf"], object[type="application/pdf"]');
  if (pdfElements.length > 0) {
    const pdfElement = pdfElements[0];
    try {
      const doc = pdfElement.contentDocument || pdfElement.contentWindow?.document;
      if (doc) {
        for (const selector of selectors) {
          const elements = doc.querySelectorAll(selector);
          if (elements.length > 0) {
            console.log(`Found canvas in PDF element with selector "${selector}"`);
            return {
              canvas: elements[0],
              container: pdfElement,
              document: doc
            };
          }
        }
      }
    } catch (e) {
      console.log('Error accessing PDF element:', e);
    }
  }

  // Log detailed page structure if canvas not found
  console.log('PDF canvas not found. Page structure:', {
    'body children': Array.from(document.body.children).map(el => ({
      tag: el.tagName,
      id: el.id,
      class: el.className
    })),
    'frames': Array.from(frames).map(f => ({
      src: f.src,
      id: f.id,
      class: f.className
    })),
    'pdf elements': Array.from(pdfElements).map(el => ({
      type: el.type,
      src: el.src,
      id: el.id
    }))
  });

  return null;
}

function applyOverlayAndDownload() {
  console.log('Starting PDF generation');
  if (!overlay) {
    console.error('No overlay found');
    return;
  }

  try {
    // Find the PDF canvas
    const result = findPDFCanvas();
    if (!result) {
      console.error('PDF canvas not found');
      return;
    }

    const { canvas: pdfCanvas, container, document: targetDoc } = result;

    console.log('Found PDF canvas:', {
      width: pdfCanvas.width,
      height: pdfCanvas.height,
      style: pdfCanvas.getAttribute('style'),
      container: {
        tag: container.tagName,
        id: container.id,
        class: container.className
      }
    });

    // Create a temporary canvas
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    // Set size to match the PDF canvas
    tempCanvas.width = pdfCanvas.width;
    tempCanvas.height = pdfCanvas.height;

    // Copy the PDF content
    tempCtx.drawImage(pdfCanvas, 0, 0);

    // Get overlay position relative to viewport
    const overlayRect = overlay.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Calculate position relative to PDF canvas
    const scaleX = pdfCanvas.width / containerRect.width;
    const scaleY = pdfCanvas.height / containerRect.height;
    
    const x = (overlayRect.left - containerRect.left) * scaleX;
    const y = (overlayRect.top - containerRect.top) * scaleY;
    const width = overlayRect.width * scaleX;
    const height = overlayRect.height * scaleY;

    // Create a temporary image to ensure the overlay image is fully loaded
    const tempImage = new Image();
    tempImage.src = overlayImage.src;

    tempImage.onload = () => {
      // Draw the overlay image
      tempCtx.drawImage(tempImage, x, y, width, height);

      // Create PDF
      const pdf = new jspdf.jsPDF({
        orientation: tempCanvas.width > tempCanvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [tempCanvas.width, tempCanvas.height]
      });

      // Add the combined image to the PDF
      const imgData = tempCanvas.toDataURL('image/jpeg', 1.0);
      pdf.addImage(imgData, 'JPEG', 0, 0, tempCanvas.width, tempCanvas.height);

      // Save the PDF
      pdf.save('modified_pdf.pdf');
      console.log('PDF generated and saved');
    };
  } catch (error) {
    console.error('Error generating PDF:', error, error.stack);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request.action);
  if (request.action === 'addOverlay') {
    createOverlay(request.imageUrl);
  } else if (request.action === 'applyAndDownload') {
    applyOverlayAndDownload();
  } else if (request.action === 'checkOverlay') {
    sendResponse({hasOverlay: overlay !== null});
  }
});

// Initialize when the page loads
console.log('Content script loaded');

// Add listener for when the document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('Document ready');
  });
} else {
  console.log('Document already ready');
}
