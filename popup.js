console.log("popup.js loaded");

// Check interval status when popup opens
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const data = await chrome.storage.local.get(['intervalMode', 'intervalStartTime', 'intervalDelayMinutes', 'intervalSearchActive']);
        const statusDiv = document.getElementById('status');

        if (data.intervalMode && data.intervalSearchActive) {
            if (data.intervalStartTime && data.intervalDelayMinutes) {
                const elapsedMinutes = (Date.now() - data.intervalStartTime) / (1000 * 60);
                const remainingMinutes = Math.max(0, data.intervalDelayMinutes - elapsedMinutes);
                
                if (remainingMinutes > 0) {
                    statusDiv.textContent = `Interval mode: ${Math.ceil(remainingMinutes)} minutes left`;
                    statusDiv.style.color = "#ffc107";
                } else {
                    statusDiv.textContent = "Interval mode: about to search...";
                    statusDiv.style.color = "#28a745";
                }
            } else {
                statusDiv.textContent = "Interval mode running...";
                statusDiv.style.color = "#28a745";
            }
        }
    } catch (error) {
        console.error("Error checking status:", error);
    }
});

function startSearch(mode) {
    console.log(`Search button clicked for ${mode} mode`);
    const searchCountInput = document.getElementById("searchCount").value;
    let searchCount = parseInt(searchCountInput) || 90; // Default 90
    if (searchCount < 1 || searchCount > 100) {
        console.log("Invalid search count, using default: 90");
        searchCount = 90;
    }
    const apiCount = searchCount + 1; // Get N + 1 topics
    console.log(`Requesting ${apiCount} topics from API for ${mode} mode`);

    const url = 'https://en.wikipedia.org/w/api.php';
    const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        list: 'random',
        rnlimit: apiCount.toString(),
        rnnamespace: '0',
        origin: '*'
    });

    const statusDiv = document.getElementById('status');
    statusDiv.textContent = "Loading topics...";
    statusDiv.style.color = "#007bff";

    fetch(`${url}?${params}`)
        .then(response => response.json())
        .then(data => {
            let queries = data.query.random.map(item => item.title);
            console.log(`Loaded ${queries.length} topics from API for ${mode} mode:`, queries);
            while (queries.length < apiCount) {
                queries.push('fail');
            }
            queries = queries.slice(0, apiCount);
            chrome.runtime.sendMessage({ action: "startSearch", queries: queries, mode: mode }, (response) => {
                console.log(`Message sent to background for ${mode} mode, response:`, response);

                if (mode === "interval") {
                    statusDiv.textContent = "Interval mode started!";
                    statusDiv.style.color = "#28a745";
                } else {
                    statusDiv.textContent = "Search started!";
                    statusDiv.style.color = "#28a745";
                }
            });
        })
        .catch(error => {
            console.error(`Error fetching Wikipedia API for ${mode} mode:`, error);
            const queries = Array(apiCount).fill('fail');
            chrome.runtime.sendMessage({ action: "startSearch", queries: queries, mode: mode }, (response) => {
                console.log(`Message sent with backup topics for ${mode} mode, response:`, response);

                statusDiv.textContent = "Search started (backup topics)!";
                statusDiv.style.color = "#ffc107";
            });
        });
}

function stopAll() {
    chrome.runtime.sendMessage({ action: "stopAll" }, (response) => {
        console.log("Stop all response:", response);

        const statusDiv = document.getElementById('status');
        statusDiv.textContent = "All searches stopped!";
        statusDiv.style.color = "#dc3545";
    });
}

function downloadLogs() {
    console.log("downloadLogs() function called by user");
    chrome.runtime.sendMessage({ action: "downloadLogs" }, async (response) => {
        console.log("Download logs response:", response);
        
        try {
            // Get prepared log data from storage
            const data = await chrome.storage.local.get(['downloadReady']);
            
            if (data.downloadReady && data.downloadReady.ready) {
                const logContent = data.downloadReady.content;
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const filename = `app-${timestamp}.log`;
                
                // Create download blob
                const blob = new Blob([logContent], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                
                // Create temporary download link
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                // Clear download ready flag
                await chrome.storage.local.remove(['downloadReady']);
                
                const statusDiv = document.getElementById('status');
                statusDiv.textContent = "Logs downloaded!";
                statusDiv.style.color = "#28a745";
                
                console.log(`Log file downloaded: ${filename}`);
            } else {
                const statusDiv = document.getElementById('status');
                statusDiv.textContent = "No logs available!";
                statusDiv.style.color = "#dc3545";
            }
        } catch (error) {
            console.error("Download error:", error);
            const statusDiv = document.getElementById('status');
            statusDiv.textContent = "Download failed!";
            statusDiv.style.color = "#dc3545";
        }
        
        // Reset status after 3 seconds
        setTimeout(() => {
            const statusDiv = document.getElementById('status');
            statusDiv.textContent = "";
        }, 3000);
    });
}

document.getElementById("searchButton").addEventListener("click", () => startSearch("continuous"));
document.getElementById("searchIntervalButton").addEventListener("click", () => startSearch("interval"));
document.getElementById("stopButton").addEventListener("click", stopAll);
document.getElementById("downloadLogsButton").addEventListener("click", downloadLogs);