// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  // Check if current page is a PDF
  if (tab.url.toLowerCase().endsWith('.pdf') || 
      tab.url.toLowerCase().includes('.pdf?') ||
      tab.url.includes('content-type=application/pdf') ||
      (tab.url.includes('qbo.intuit.com') && tab.url.includes('/printchecks/print'))) {
    
    // Open our custom viewer in a new tab
    const viewerUrl = chrome.runtime.getURL('viewer.html') + '?pdf=' + encodeURIComponent(tab.url);
    chrome.tabs.create({ url: viewerUrl });
  } else {
    // Not a PDF page
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        alert('This is not a PDF page. The image overlay feature is only available for PDFs.');
      }
    });
  }
});
