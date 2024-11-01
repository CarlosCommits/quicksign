// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

let pdfDoc = null;
let pdfBytes = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
let scale = 1.5;
let pdfCanvas = document.getElementById('pdfCanvas');
let ctx = pdfCanvas.getContext('2d');

// Elements
const prevButton = document.getElementById('prevPage');
const nextButton = document.getElementById('nextPage');
const pageNumSpan = document.getElementById('pageNum');
const pageCountSpan = document.getElementById('pageCount');
const imageInput = document.getElementById('imageInput');
const pdfContainer = document.getElementById('pdfContainer');
const loadingOverlay = document.getElementById('loadingOverlay');
const saveBtn = document.getElementById('saveBtn');
const signatureGuide = document.querySelector('.signature-guide');

// Adjust for device pixel ratio
const pixelRatio = window.devicePixelRatio || 1;
scale *= pixelRatio;

// State variables
let isDragging = false;
let isResizing = false;
let startX, startY, initialX, initialY;
let aspectRatio = 1;
let savedImagePosition = null;

// Position signature guide
function positionSignatureGuide() {
    const containerWidth = pdfCanvas.width / pixelRatio;
    const containerHeight = pdfCanvas.height / pixelRatio;
    
    // Position the guide line at approximately 25.7% down the page
    // and extending from 5% to 60% of the page width
    const topOffset = containerHeight * 0.257; 
    const leftOffset = containerWidth * 0.60;
    const rightOffset = containerWidth * 0.05; // 5% from right edge
    
    signatureGuide.style.top = topOffset + 'px';
    signatureGuide.style.right = rightOffset + 'px';
    signatureGuide.style.width = (containerWidth - leftOffset - rightOffset) + 'px';
}

// Load PDF from URL parameter
async function loadPDF() {
    const urlParams = new URLSearchParams(window.location.search);
    const pdfUrl = urlParams.get('pdf');
    
    if (!pdfUrl) {
        alert('No PDF URL provided');
        return;
    }

    try {
        // Fetch the PDF bytes
        const response = await fetch(pdfUrl);
        pdfBytes = await response.arrayBuffer();
        
        // Load with PDF.js for display
        const loadingTask = pdfjsLib.getDocument({
            data: pdfBytes,
            useWorkerFetch: true,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.12.313/cmaps/',
            cMapPacked: true,
        });
        
        pdfDoc = await loadingTask.promise;
        pageCountSpan.textContent = pdfDoc.numPages;
        renderPage(pageNum);
    } catch (error) {
        console.error('Error loading PDF:', error);
        alert('Error loading PDF. Please try again.');
    }
}

// Render the current page
async function renderPage(num) {
    pageRendering = true;
    try {
        const page = await pdfDoc.getPage(num);
        const viewport = page.getViewport({ scale: scale / pixelRatio });

        // Set canvas size adjusted for pixel ratio
        pdfCanvas.width = viewport.width * pixelRatio;
        pdfCanvas.height = viewport.height * pixelRatio;
        
        // Set display size
        pdfCanvas.style.width = viewport.width + 'px';
        pdfCanvas.style.height = viewport.height + 'px';
        
        pdfContainer.style.width = viewport.width + 'px';
        pdfContainer.style.height = viewport.height + 'px';

        // Scale context for retina display
        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        const renderContext = {
            canvasContext: ctx,
            viewport: viewport,
            enableWebGL: true,
            renderInteractiveForms: true
        };

        await page.render(renderContext).promise;
        pageRendering = false;
        pageNumSpan.textContent = num;

        // Position the signature guide
        positionSignatureGuide();

        // If we have saved position and switching pages, apply the overlay
        if (savedImagePosition) {
            applyOverlayToCurrentPosition();
        }

        if (pageNumPending !== null) {
            renderPage(pageNumPending);
            pageNumPending = null;
        }
    } catch (error) {
        console.error('Error rendering page:', error);
        pageRendering = false;
    }
}

// Queue rendering of the next page
function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

// Navigation buttons
prevButton.addEventListener('click', () => {
    if (pageNum <= 1) return;
    pageNum--;
    queueRenderPage(pageNum);
});

nextButton.addEventListener('click', () => {
    if (pageNum >= pdfDoc.numPages) return;
    pageNum++;
    queueRenderPage(pageNum);
});

// Apply overlay to current position
function applyOverlayToCurrentPosition() {
    if (!savedImagePosition) return;

    // Remove existing overlay if any
    const existingOverlay = document.querySelector('.overlay-container');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    // Create overlay container
    const overlayContainer = document.createElement('div');
    overlayContainer.className = 'overlay-container active';
    
    // Create overlay image
    const overlayImage = document.createElement('img');
    overlayImage.src = savedImagePosition.imageSrc;
    overlayImage.id = 'overlayImage';
    overlayImage.draggable = false;
    
    // Create resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    
    // Add elements to container
    overlayContainer.appendChild(overlayImage);
    overlayContainer.appendChild(resizeHandle);
    
    // Set position and size
    overlayContainer.style.left = savedImagePosition.left;
    overlayContainer.style.top = savedImagePosition.top;
    overlayContainer.style.width = savedImagePosition.width;
    overlayContainer.style.height = savedImagePosition.height;
    
    // Add container to PDF container
    pdfContainer.appendChild(overlayContainer);
    
    // Setup drag and resize handlers
    setupDragAndResize(overlayContainer);
}

// Image overlay handling
imageInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                aspectRatio = img.width / img.height;
                
                // Remove existing overlay if any
                const existingOverlay = document.querySelector('.overlay-container');
                if (existingOverlay) {
                    existingOverlay.remove();
                }
                
                // Create overlay container
                const overlayContainer = document.createElement('div');
                overlayContainer.className = 'overlay-container';
                
                // Create overlay image
                const overlayImage = document.createElement('img');
                overlayImage.src = event.target.result;
                overlayImage.id = 'overlayImage';
                overlayImage.draggable = false;
                
                // Create resize handle
                const resizeHandle = document.createElement('div');
                resizeHandle.className = 'resize-handle';
                
                // Add elements to container
                overlayContainer.appendChild(overlayImage);
                overlayContainer.appendChild(resizeHandle);
                
                // Add container to PDF container
                pdfContainer.appendChild(overlayContainer);
                
                // Set initial size (20% of PDF width)
                const initialWidth = pdfCanvas.width * 0.2 / pixelRatio;
                const initialHeight = initialWidth / aspectRatio;
                
                // Position near the signature guide
                const containerWidth = pdfCanvas.width / pixelRatio;
                const containerHeight = pdfCanvas.height / pixelRatio;
                
                overlayContainer.style.width = initialWidth + 'px';
                overlayContainer.style.height = initialHeight + 'px';
                overlayContainer.style.left = (containerWidth * 0.65) + 'px';
                overlayContainer.style.top = (containerHeight * 0.42) + 'px';
                
                overlayContainer.classList.add('active');
                
                // Setup drag and resize handlers
                setupDragAndResize(overlayContainer);

                // Save position for all pages
                savedImagePosition = {
                    left: overlayContainer.style.left,
                    top: overlayContainer.style.top,
                    width: overlayContainer.style.width,
                    height: overlayContainer.style.height,
                    imageSrc: event.target.result
                };
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(e.target.files[0]);
    }
});

// Setup drag and resize handlers
function setupDragAndResize(container) {
    let isDragging = false;
    let isResizing = false;
    let startX, startY, initialLeft, initialTop, initialWidth, initialHeight;

    // Drag handling
    container.addEventListener('mousedown', (e) => {
        if (e.target === container || e.target.id === 'overlayImage') {
            isDragging = true;
            initialLeft = container.offsetLeft;
            initialTop = container.offsetTop;
            startX = e.clientX;
            startY = e.clientY;
            container.classList.add('dragging');
        }
    });

    // Resize handling
    const resizeHandle = container.querySelector('.resize-handle');
    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        initialWidth = container.offsetWidth;
        initialHeight = container.offsetHeight;
        startX = e.clientX;
        startY = e.clientY;
        container.classList.add('resizing');
        e.stopPropagation();
    });

    // Mouse move handling
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            const newLeft = initialLeft + dx;
            const newTop = initialTop + dy;
            
            // Boundary checking
            const maxX = pdfCanvas.width / pixelRatio - container.offsetWidth;
            const maxY = pdfCanvas.height / pixelRatio - container.offsetHeight;
            
            container.style.left = Math.min(Math.max(0, newLeft), maxX) + 'px';
            container.style.top = Math.min(Math.max(0, newTop), maxY) + 'px';

            // Update saved position
            savedImagePosition.left = container.style.left;
            savedImagePosition.top = container.style.top;
        } else if (isResizing) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            // Use the larger of dx or dy to maintain aspect ratio
            const delta = Math.max(dx, dy);
            const newWidth = Math.max(50, initialWidth + delta);
            const newHeight = newWidth / aspectRatio;
            
            // Boundary checking
            const maxWidth = pdfCanvas.width / pixelRatio - container.offsetLeft;
            const maxHeight = pdfCanvas.height / pixelRatio - container.offsetTop;
            
            if (newWidth <= maxWidth && newHeight <= maxHeight) {
                container.style.width = newWidth + 'px';
                container.style.height = newHeight + 'px';
                
                // Update saved position
                savedImagePosition.width = container.style.width;
                savedImagePosition.height = container.style.height;
            }
        }
    });

    // Mouse up handling
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            container.classList.remove('dragging');
        }
        if (isResizing) {
            container.classList.remove('resizing');
        }
        isDragging = false;
        isResizing = false;
    });
}

// Save functionality
saveBtn.addEventListener('click', async () => {
    try {
        loadingOverlay.style.display = 'flex';
        
        if (typeof PDFLib === 'undefined') {
            throw new Error('PDF-lib is not loaded. Please refresh the page and try again.');
        }
        
        // Load the PDF document
        const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
        
        // If we have an overlay image
        const overlayContainer = document.querySelector('.overlay-container');
        if (overlayContainer) {
            const overlayImage = overlayContainer.querySelector('#overlayImage');
            const imageBytes = await dataURLToBytes(overlayImage.src);
            const image = await pdfDoc.embedPng(imageBytes);

            // Calculate positions and dimensions for the current page
            const { width, height } = pdfDoc.getPage(pageNum - 1).getSize();
            const scaleX = width / (pdfCanvas.width / pixelRatio);
            const scaleY = height / (pdfCanvas.height / pixelRatio);
            
            const imageX = parseFloat(overlayContainer.style.left) * scaleX;
            const imageY = height - (parseFloat(overlayContainer.style.top) * scaleY) - (parseFloat(overlayContainer.style.height) * scaleY);
            const imageWidth = parseFloat(overlayContainer.style.width) * scaleX;
            const imageHeight = parseFloat(overlayContainer.style.height) * scaleY;

            // Apply to all pages
            const pageCount = pdfDoc.getPageCount();
            for (let i = 0; i < pageCount; i++) {
                const page = pdfDoc.getPage(i);
                page.drawImage(image, {
                    x: imageX,
                    y: imageY,
                    width: imageWidth,
                    height: imageHeight,
                });
            }
        }
        
        // Save the PDF
        const modifiedPdfBytes = await pdfDoc.save();
        
        // Create blob and open in current tab
        const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        window.location.href = url;
        
        loadingOverlay.style.display = 'none';
    } catch (error) {
        console.error('Error saving PDF:', error);
        alert('Error saving PDF: ' + error.message);
        loadingOverlay.style.display = 'none';
    }
});

// Convert data URL to Uint8Array
async function dataURLToBytes(dataURL) {
    const base64 = dataURL.split(',')[1];
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

// Initialize
loadPDF();
