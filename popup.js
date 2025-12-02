console.log("popup.js loaded");

// Check interval status when popup opens
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const data = await chrome.storage.local.get([
      "intervalMode",
      "intervalStartTime",
      "intervalDelayMinutes",
      "intervalSearchActive",
    ]);
    const statusDiv = document.getElementById("status");

    if (data.intervalMode && data.intervalSearchActive) {
      if (data.intervalStartTime && data.intervalDelayMinutes) {
        const elapsedMinutes =
          (Date.now() - data.intervalStartTime) / (1000 * 60);
        const remainingMinutes = Math.max(
          0,
          data.intervalDelayMinutes - elapsedMinutes
        );

        if (remainingMinutes > 0) {
          statusDiv.textContent = `Interval mode: ${Math.ceil(
            remainingMinutes
          )} minutes left`;
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

function testWikipediaAPI() {
  console.log("Testing Wikipedia API directly...");
  const url = "https://en.wikipedia.org/w/api.php";
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    list: "random",
    rnlimit: "5",
    rnnamespace: "0",
    origin: "*",
  });

  const statusDiv = document.getElementById("status");
  statusDiv.textContent = "Testing Wikipedia API...";
  statusDiv.style.color = "#007bff";

  // First test basic connectivity
  fetch("https://www.google.com", { mode: "no-cors" })
    .then(() => {
      console.log("Basic internet connectivity OK");
      // Now test Wikipedia API
      return fetch(`${url}?${params}`);
    })
    .catch(() => {
      throw new Error("No internet connection");
    })
    .then((response) => {
      console.log(
        `API Test - Status: ${response.status} ${response.statusText}`
      );
      console.log("API Test - Response headers:", [
        ...response.headers.entries(),
      ]);

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} ${response.statusText}`
        );
      }
      return response.json();
    })
    .then((data) => {
      console.log("API Test - Success! Data:", data);
      if (data.query && data.query.random && data.query.random.length > 0) {
        const topics = data.query.random.map((item) => item.title);
        statusDiv.textContent = `API OK! Got ${topics.length} topics`;
        statusDiv.style.color = "#28a745";
        console.log("API Test - Topics:", topics);
      } else {
        statusDiv.textContent = "API returned empty data";
        statusDiv.style.color = "#ffc107";
      }
    })
    .catch((error) => {
      console.error("API Test - Error:", error);
      if (error.message.includes("No internet connection")) {
        statusDiv.textContent = "No internet connection";
      } else if (error.message.includes("Failed to fetch")) {
        statusDiv.textContent = "Network error - check CORS/permissions";
      } else {
        statusDiv.textContent = `API Test Failed: ${error.message}`;
      }
      statusDiv.style.color = "#dc3545";
    });
}

function startSearch(mode) {
  console.log(`Search button clicked for ${mode} mode`);

  // Disable buttons to prevent double-click
  const searchButton = document.getElementById("searchButton");
  const intervalButton = document.getElementById("searchIntervalButton");
  searchButton.disabled = true;
  intervalButton.disabled = true;

  const searchCountInput = document.getElementById("searchCount").value;
  let searchCount = parseInt(searchCountInput) || 90; // Default 90
  if (searchCount < 1 || searchCount > 100) {
    console.log("Invalid search count, using default: 90");
    searchCount = 90;
  }
  // Fetch a few extra in case of API dupes/fails, but we will slice exact amount later
  const apiRequestCount = searchCount + 5;
  console.log(`Requesting ${apiRequestCount} topics from API for ${mode} mode`);

  const url = "https://en.wikipedia.org/w/api.php";
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    list: "random",
    rnlimit: apiRequestCount.toString(),
    rnnamespace: "0",
    origin: "*",
  });

  const statusDiv = document.getElementById("status");
  statusDiv.textContent = "Loading topics...";
  statusDiv.style.color = "#007bff";

  fetch(`${url}?${params}`)
    .then((response) => {
      console.log(
        `Wikipedia API response status: ${response.status} ${response.statusText}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      console.log("Wikipedia API response data:", data);

      if (!data.query || !data.query.random) {
        throw new Error("Invalid API response structure");
      }

      let queries = data.query.random.map((item) => item.title);
      console.log(
        `Loaded ${queries.length} topics from API for ${mode} mode:`,
        queries
      );

      // Ensure we have enough queries (fill with 'fail' if API returned less)
      const targetCount = searchCount + 1;
      while (queries.length < targetCount) {
        queries.push("fail");
      }
      // SLICE TO USER REQUESTED NUMBER + 1
      queries = queries.slice(0, targetCount);

      chrome.runtime.sendMessage(
        { action: "startSearch", queries: queries, mode: mode },
        (response) => {
          console.log(
            `Message sent to background for ${mode} mode, response:`,
            response
          );

          if (mode === "interval") {
            statusDiv.textContent = `Interval mode started! (${queries.length} searches)`;
            statusDiv.style.color = "#28a745";
          } else {
            statusDiv.textContent = `Search started! (${queries.length} searches)`;
            statusDiv.style.color = "#28a745";
          }

          // Re-enable buttons after successful start
          setTimeout(() => {
            searchButton.disabled = false;
            intervalButton.disabled = false;
          }, 2000);
        }
      );
    })
    .catch((error) => {
      console.error(`Error fetching Wikipedia API for ${mode} mode:`, error);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        url: `${url}?${params}`,
      });

      statusDiv.textContent = `API Error: ${error.message}`;
      statusDiv.style.color = "#dc3545";

      // Use backup topics after showing error
      setTimeout(() => {
        // Create exact number of backup queries (N + 1)
        const queries = Array(searchCount + 1).fill("fail");
        chrome.runtime.sendMessage(
          { action: "startSearch", queries: queries, mode: mode },
          (response) => {
            console.log(
              `Message sent with backup topics for ${mode} mode, response:`,
              response
            );

            statusDiv.textContent = "Search started (backup topics)!";
            statusDiv.style.color = "#ffc107";

            // Re-enable buttons
            searchButton.disabled = false;
            intervalButton.disabled = false;
          }
        );
      }, 2000);
    });
}

function stopAll() {
  chrome.runtime.sendMessage({ action: "stopAll" }, (response) => {
    console.log("Stop all response:", response);

    const statusDiv = document.getElementById("status");
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
      const data = await chrome.storage.local.get(["downloadReady"]);

      if (data.downloadReady && data.downloadReady.ready) {
        const logContent = data.downloadReady.content;
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19);
        const filename = `app-${timestamp}.log`;

        // Create download blob
        const blob = new Blob([logContent], { type: "text/plain" });
        const url = URL.createObjectURL(blob);

        // Create temporary download link
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Clear download ready flag
        await chrome.storage.local.remove(["downloadReady"]);

        const statusDiv = document.getElementById("status");
        statusDiv.textContent = "Logs downloaded!";
        statusDiv.style.color = "#28a745";

        console.log(`Log file downloaded: ${filename}`);
      } else {
        const statusDiv = document.getElementById("status");
        statusDiv.textContent = "No logs available!";
        statusDiv.style.color = "#dc3545";
      }
    } catch (error) {
      console.error("Download error:", error);
      const statusDiv = document.getElementById("status");
      statusDiv.textContent = "Download failed!";
      statusDiv.style.color = "#dc3545";
    }

    // Reset status after 3 seconds
    setTimeout(() => {
      const statusDiv = document.getElementById("status");
      statusDiv.textContent = "";
    }, 3000);
  });
}

document
  .getElementById("searchButton")
  .addEventListener("click", () => startSearch("continuous"));
document
  .getElementById("searchIntervalButton")
  .addEventListener("click", () => startSearch("interval"));
document.getElementById("stopButton").addEventListener("click", stopAll);
document
  .getElementById("downloadLogsButton")
  .addEventListener("click", downloadLogs);
document
  .getElementById("testAPIButton")
  .addEventListener("click", testWikipediaAPI);
