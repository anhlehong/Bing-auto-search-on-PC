// Import logger
importScripts("logger.js");

console.log("background.js loaded");
logger.info("Background script loaded successfully");

let queries = [];
let searchIndex = 0;
let activeTabId = null;
let mode = "continuous";
let queryQueue = [];
let isProcessing = false;
let intervalSearchActive = false;
let intervalCount = 0; // Count number of searches in interval mode
let searchStopped = false; // Global flag to stop all searches

// Function to create random delay
function getRandomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  logger.debug(`Random delay generated: ${delay / 1000}s (${delay}ms)`);
  return delay;
}

// Function to create alarm with delayInMinutes for stable operation
function createIntervalAlarm() {
  const randomSeconds = Math.floor(Math.random() * 61); // 0-60 seconds
  const totalMinutes = 15 + randomSeconds / 60; // 15-16 minutes
  const alarmName = "intervalSearch";

  // Clear all old alarms
  chrome.alarms.clearAll();

  // Create alarm with delayInMinutes instead of when
  chrome.alarms.create(alarmName, { delayInMinutes: totalMinutes });

  // Save information to storage for recovery
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local
      .set({
        intervalAlarmName: alarmName,
        intervalStartTime: Date.now(),
        intervalDelayMinutes: totalMinutes,
        intervalMode: true,
        currentQueries: queries,
        currentIndex: searchIndex,
        intervalCount: intervalCount,
        intervalSearchActive: true,
      })
      .catch((err) => logger.error("Cannot save alarm info", err));
  }

  logger.info(
    `Created interval alarm with delay ${totalMinutes.toFixed(1)} minutes`,
    {
      alarmName,
      delayMinutes: totalMinutes,
      intervalCount,
      searchIndex,
    }
  );

  // Create backup alarm every 5 minutes instead of 1 minute to reduce spam
  chrome.alarms.create("backupCheck", {
    delayInMinutes: 5,
    periodInMinutes: 5,
  });
}

// Function to check alarm status and restore if needed
function ensureAlarmExists() {
  if (mode !== "interval" || !intervalSearchActive) {
    // If not interval mode, stop backup check
    chrome.alarms.clear("backupCheck");
    return;
  }

  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local
      .get([
        "intervalAlarmName",
        "intervalStartTime",
        "intervalDelayMinutes",
        "intervalSearchActive",
      ])
      .then((data) => {
        if (
          data.intervalStartTime &&
          data.intervalDelayMinutes &&
          data.intervalSearchActive
        ) {
          const elapsedMinutes =
            (Date.now() - data.intervalStartTime) / (1000 * 60);
          const remainingMinutes = data.intervalDelayMinutes - elapsedMinutes;

          // Only log every 10 minutes to reduce spam significantly
          const now = Date.now();
          if (
            !chrome.lastEnsureLog ||
            now - chrome.lastEnsureLog > 10 * 60 * 1000
          ) {
            logger.info(
              `Alarm status check - Elapsed: ${elapsedMinutes.toFixed(
                1
              )}min, Remaining: ${remainingMinutes.toFixed(1)}min`
            );
            chrome.lastEnsureLog = now;
          }

          if (remainingMinutes <= 0) {
            // Time is up, trigger search immediately
            logger.info(
              "Interval time expired (backup check), triggering search immediately"
            );
            chrome.alarms.clear("backupCheck"); // Stop backup check
            handleIntervalTrigger();
          } else {
            // Check if alarm still exists
            chrome.alarms.get(data.intervalAlarmName, (alarm) => {
              if (!alarm) {
                logger.warn("Main alarm lost, recreating with remaining time", {
                  remainingMinutes,
                });
                chrome.alarms.create(data.intervalAlarmName, {
                  delayInMinutes: remainingMinutes,
                });
              }
            });
          }
        }
      })
      .catch((err) => logger.error("Error checking alarm", err));
  }
}

// Function to handle interval trigger
function handleIntervalTrigger() {
  logger.info("Interval trigger activated - continuing search cycle", {
    previousIntervalCount: intervalCount,
    currentSearchIndex: searchIndex,
  });
  intervalCount = 0; // Reset counter

  // DO NOT reset activeTabId - reuse current tab

  startSearch();
}

// Main function to start searching
async function startSearch() {
  // Check if search is stopped globally
  if (searchStopped || (mode === "interval" && !intervalSearchActive)) {
    logger.info("Search stopped, not starting search");
    console.log("Search stopped, not starting search");
    return;
  }

  if (isProcessing) {
    logger.debug("Processing already in progress, skipping startSearch");
    return;
  }

  if (searchIndex >= queries.length && queryQueue.length === 0) {
    logger.info("All searches completed, redirecting to rewards.bing.com", {
      totalSearches: searchIndex,
      mode: mode,
    });
    if (activeTabId) {
      chrome.tabs.update(activeTabId, { url: "https://rewards.bing.com" });
    }

    // If interval mode, reset to continue
    if (mode === "interval" && intervalSearchActive) {
      logger.info(
        "Interval mode: Completed all queries, resetting for next cycle"
      );
      searchIndex = 0;
      intervalCount = 0;
    }
    return;
  }

  if (searchIndex < queries.length) {
    queryQueue.push(queries[searchIndex]);
    logger.info(
      `Added query ${searchIndex + 1}/${queries.length} to queue: "${
        queries[searchIndex]
      }"`,
      {
        queryIndex: searchIndex + 1,
        totalQueries: queries.length,
        currentIntervalCount: intervalCount,
      }
    );
    searchIndex++;
    intervalCount++; // Increase counter for interval mode
  }

  await processQueue();
}

// Function to simulate typing
function simulateTyping(query) {
  return new Promise((resolve) => {
    console.log(`Starting to type query: ${query}`);
    const searchInput = document.querySelector(
      'textarea#sb_form_q, textarea[name="q"], input#sb_form_q, input[name="q"]'
    );
    if (!searchInput) {
      console.log("Search input not found");
      resolve("error");
      return;
    }
    searchInput.focus();
    searchInput.value = "";
    let charIndex = 0;
    function typeNextChar() {
      if (charIndex < query.length) {
        searchInput.value = query.substring(0, charIndex + 1);
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        charIndex++;
        setTimeout(typeNextChar, 150);
      } else {
        const form = searchInput.closest("form");
        if (form) {
          form.submit();
        } else {
          const enterEvent = new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            bubbles: true,
          });
          searchInput.dispatchEvent(enterEvent);
        }
        resolve("success");
      }
    }
    typeNextChar();
  });
}

// Function to perform random scrolling after search completion
function performPostSearchScrolling() {
  return new Promise((resolve) => {
    // Check if we're on pages where we should NOT scroll
    const currentUrl = window.location.href;
    if (
      currentUrl.includes("rewards.bing.com") ||
      (currentUrl.includes("bing.com") && !currentUrl.includes("/search?q="))
    ) {
      // Don't scroll on rewards.bing.com or bing.com homepage
      console.log("On rewards.bing.com or bing.com homepage, skipping scroll");
      resolve();
      return;
    }

    let scrollActive = true;

    // Store the scroll control in window object so it can be stopped by next search
    window.stopScrolling = () => {
      scrollActive = false;
    };

    function performSingleScroll() {
      if (!scrollActive) return;

      // Random scroll duration between 3-6 seconds
      const scrollDuration = Math.random() * 1000 + 1000; // 3000-6000ms (3-6 seconds)
      // Random scroll direction for this session (up or down)
      const sessionScrollDirection = Math.random() > 0.5 ? 1 : -1; // 1 = down, -1 = up
      const scrollInterval = 110; // Scroll every 110ms
      const scrollSteps = Math.floor(scrollDuration / scrollInterval);
      let currentStep = 0;

      console.log(
        `Starting ${
          sessionScrollDirection > 0 ? "DOWN" : "UP"
        } scroll session for ${scrollDuration / 1000}s on ${currentUrl}`
      );

      const scrollTimer = setInterval(() => {
        if (!scrollActive) {
          clearInterval(scrollTimer);
          return;
        }

        // Use the same direction for this entire session, random amount
        const scrollAmount = Math.random() * 200 + 50; // 50-250 pixels
        window.scrollBy(0, sessionScrollDirection * scrollAmount);

        currentStep++;
        if (currentStep >= scrollSteps) {
          clearInterval(scrollTimer);
          console.log(
            `Scroll session completed, starting next session immediately`
          );

          // No pause - immediately start next scroll session with new random direction
          if (scrollActive) {
            performSingleScroll(); // Start next scroll session immediately
          }
        }
      }, scrollInterval);
    }

    // Start the scrolling immediately
    performSingleScroll();

    // Resolve immediately to not block the process, but keep scrolling active
    resolve();
  });
}
// Function to process queue - USE CURRENT TAB WITH STRONGER APPROACH
async function processQueue() {
  // Check if search is stopped globally
  if (searchStopped || (mode === "interval" && !intervalSearchActive)) {
    logger.info("Search stopped, not processing queue");
    console.log("Search stopped, clearing queue");
    queryQueue = [];
    isProcessing = false;
    return;
  }

  console.log("Starting queue processing, query count:", queryQueue.length);
  logger.info("Starting queue processing", { queueLength: queryQueue.length });

  if (queryQueue.length === 0) {
    logger.debug("Queue is empty, scheduling next search");
    scheduleNextSearch();
    return;
  }

  isProcessing = true;
  const query = queryQueue.shift();
  logger.info("Processing query from queue", {
    query,
    remainingInQueue: queryQueue.length,
  });

  try {
    let tabExists = false;
    if (activeTabId) {
      try {
        const tab = await chrome.tabs.get(activeTabId);
        tabExists = tab && !tab.discarded;
        logger.debug("Checking existing tab", {
          tabId: activeTabId,
          exists: tabExists,
          discarded: tab?.discarded,
        });
      } catch (e) {
        console.log("Tab does not exist, will create new tab");
        logger.warn("Active tab no longer exists", {
          tabId: activeTabId,
          error: e.message,
        });
      }
    }

    if (!tabExists) {
      // Only create new tab when really necessary
      logger.info("Creating new tab for search", { query });
      const tab = await new Promise((resolve) => {
        chrome.tabs.create(
          { url: `https://www.bing.com/search?q=${encodeURIComponent(query)}` },
          resolve
        );
      });
      activeTabId = tab.id;
      logger.info("Created new tab", { tabId: activeTabId, url: tab.url });
      await waitForTabLoad(tab.id);
    } else {
      // STRONGER APPROACH: ACTIVATE TAB BEFORE INJECTING
      console.log(`Using current tab ${activeTabId} for query: ${query}`);
      logger.info("Using existing tab for search", {
        tabId: activeTabId,
        query,
      });

      // Step 1: Activate tab to ensure it's not "sleeping"
      await chrome.tabs.update(activeTabId, { active: true });
      logger.debug("Tab activated", { tabId: activeTabId });

      // Step 2: Wait a bit for tab to be fully activated
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 2.5: Stop any previous scrolling before navigation
      try {
        await new Promise((resolve) => {
          chrome.scripting.executeScript(
            {
              target: { tabId: activeTabId },
              func: () => {
                if (window.stopScrolling) {
                  window.stopScrolling();
                  console.log("Previous scrolling stopped");
                }
              },
            },
            () => {
              resolve();
            }
          );
        });
      } catch (error) {
        logger.debug("Failed to stop previous scrolling", {
          error: error.message,
        });
      }

      // Step 3: Navigate to bing.com instead of reloading
      await chrome.tabs.update(activeTabId, { url: "https://www.bing.com" });
      logger.debug("Tab navigated to bing.com", { tabId: activeTabId });
      await waitForTabLoad(activeTabId);

      // Step 4: Wait a bit more after navigation
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Step 5: Inject script with retry mechanism
      let attempt = 0;
      let result = "error";

      while (attempt < 3 && result === "error") {
        attempt++;
        console.log(
          `Trying script injection attempt ${attempt} for query: ${query}`
        );
        logger.debug("Attempting script injection", {
          attempt,
          query,
          tabId: activeTabId,
        });

        try {
          const results = await new Promise((resolve, reject) => {
            chrome.scripting.executeScript(
              {
                target: { tabId: activeTabId },
                func: simulateTyping,
                args: [query],
              },
              (results) => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                } else {
                  resolve(results);
                }
              }
            );
          });

          result = results[0].result;
          logger.debug("Script injection result", { attempt, result, query });

          if (result === "success") {
            console.log(`Query input successful ${searchIndex}: ${query}`);
            logger.info("Query executed successfully", {
              searchIndex,
              query,
              attempt,
            });

            // Wait for search results to load, then start scrolling
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Perform post-search scrolling
            try {
              await new Promise((resolve) => {
                chrome.scripting.executeScript(
                  {
                    target: { tabId: activeTabId },
                    func: performPostSearchScrolling,
                  },
                  () => {
                    if (chrome.runtime.lastError) {
                      logger.debug("Post-search scrolling script failed", {
                        error: chrome.runtime.lastError.message,
                      });
                    }
                    resolve();
                  }
                );
              });
            } catch (error) {
              logger.debug("Post-search scrolling failed", {
                error: error.message,
              });
            }

            break;
          } else {
            console.log(`Query input failed attempt ${attempt}: ${query}`);
            logger.warn("Query execution failed", { attempt, query, result });
            if (attempt < 3) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        } catch (error) {
          console.error(`Script injection error attempt ${attempt}:`, error);
          logger.error("Script injection error", {
            attempt,
            query,
            error: error.message,
          });
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }

      // If all attempts failed, create new tab as backup
      if (result === "error") {
        console.log("All attempts failed, creating new tab as backup");
        logger.error(
          "All script injection attempts failed, creating backup tab",
          { query, attempts: attempt }
        );
        const tab = await new Promise((resolve) => {
          chrome.tabs.create(
            {
              url: `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
            },
            resolve
          );
        });
        activeTabId = tab.id;
        logger.info("Created backup tab", { tabId: activeTabId });
        await waitForTabLoad(tab.id);
      }
    }
  } catch (error) {
    console.error("Error processing query:", query, error);
    logger.error("Error processing query", { query, error: error.message });
  }

  isProcessing = false;
  console.log("Finished queue processing");
  logger.debug("Finished queue processing");

  // Delay before processing next query with random scrolling
  setTimeout(async () => {
    // Check if search is still active before continuing
    if (searchStopped || (mode === "interval" && !intervalSearchActive)) {
      logger.info("Search stopped, not continuing queue processing");
      console.log("Search stopped, not continuing queue processing");
      queryQueue = [];
      return;
    }

    processQueue();
  }, 2000);
}

// Function to wait for tab load
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(tabIdUpdated, info) {
      if (tabIdUpdated === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

// Function to schedule next search - PRECISE LOGIC
function scheduleNextSearch() {
  // Check if search is stopped globally
  if (searchStopped || (mode === "interval" && !intervalSearchActive)) {
    logger.info("Search stopped, not scheduling next search");
    console.log("Search stopped, not scheduling next search");
    return;
  }

  if (mode === "interval") {
    // Interval mode: after every 5 searches wait 15 minutes + random(0-60s)
    if (intervalCount % 5 === 0 && intervalCount > 0) {
      // Searched 5 times, create alarm to wait 15 minutes
      logger.info(
        `Interval mode: Searched ${intervalCount} times (total: ${
          searchIndex - 1
        }), creating alarm to wait 15 minutes`,
        {
          intervalCount,
          totalSearches: searchIndex - 1,
          mode: "interval",
        }
      );
      createIntervalAlarm();
    } else {
      // Not enough 5 times, short delay with random scrolling
      const delay = getRandomDelay(3000, 8000);
      logger.debug(
        `Interval mode: Continue search (${intervalCount % 5}/5), delay ${
          delay / 1000
        }s`
      );
      setTimeout(async () => {
        // Check again before starting search
        if (searchStopped || (mode === "interval" && !intervalSearchActive)) {
          logger.info("Search stopped during delay, not starting search");
          console.log("Search stopped during delay, not starting search");
          return;
        }

        startSearch();
      }, delay);
    }
  } else {
    // Continuous mode: continuous short delay with random scrolling
    const delay = getRandomDelay(3000, 15000);
    logger.debug(
      `Continuous mode: Schedule next search after ${delay / 1000}s`
    );
    setTimeout(async () => {
      // Check if search is stopped before continuing
      if (searchStopped) {
        logger.info("Search stopped during delay, not starting search");
        console.log("Search stopped during delay, not starting search");
        return;
      }

      startSearch();
    }, delay);
  }
}

// Handle alarms - USE ALARM API CORRECTLY AND STOP BACKUP WHEN NOT NEEDED
chrome.alarms.onAlarm.addListener((alarm) => {
  logger.debug(`Alarm activated: ${alarm.name}`);

  if (alarm.name === "intervalSearch") {
    logger.info("Interval alarm triggered - official trigger", {
      alarmName: alarm.name,
    });

    // Stop backup check alarm because it triggered successfully
    chrome.alarms.clear("backupCheck");

    handleIntervalTrigger();

    // Remove alarm info from storage
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local
        .remove([
          "intervalAlarmName",
          "intervalStartTime",
          "intervalDelayMinutes",
        ])
        .catch((err) => logger.error("Error removing alarm info", err));
    }
  } else if (alarm.name === "backupCheck") {
    // Only log backup check every 10 minutes to reduce spam significantly
    const now = Date.now();
    if (!chrome.lastBackupLog || now - chrome.lastBackupLog > 10 * 60 * 1000) {
      logger.debug("Backup check alarm triggered - checking status");
      chrome.lastBackupLog = now;
    }
    ensureAlarmExists();
  }
});

// Periodic alarm check - NOT NEEDED ANYMORE BECAUSE WE HAVE BACKUP ALARM
// setInterval(ensureAlarmExists, 30000);

// Restore state when extension restarts
chrome.runtime.onStartup.addListener(() => {
  console.log("Extension startup - checking interval state");
  restoreIntervalState();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed/updated - checking interval state");
  restoreIntervalState();
});

// Function to restore interval state - COMPATIBLE WITH NEW ALARM API
async function restoreIntervalState() {
  try {
    // Check if chrome.storage exists
    if (!chrome.storage || !chrome.storage.local) {
      console.log("chrome.storage.local not available");
      return;
    }

    const data = await chrome.storage.local.get([
      "intervalMode",
      "currentQueries",
      "currentIndex",
      "intervalCount",
      "intervalStartTime",
      "intervalDelayMinutes",
      "intervalSearchActive",
    ]);

    if (data.intervalMode && data.currentQueries && data.intervalSearchActive) {
      console.log("Restoring interval state");

      // Restore variables
      queries = data.currentQueries;
      searchIndex = data.currentIndex || 0;
      intervalCount = data.intervalCount || 0;
      mode = "interval";
      intervalSearchActive = true;

      // Check remaining time
      if (data.intervalStartTime && data.intervalDelayMinutes) {
        const elapsedMinutes =
          (Date.now() - data.intervalStartTime) / (1000 * 60);
        const remainingMinutes = data.intervalDelayMinutes - elapsedMinutes;

        console.log(
          `Restore: Elapsed ${elapsedMinutes.toFixed(
            1
          )}min, Remaining ${remainingMinutes.toFixed(1)}min`
        );

        if (remainingMinutes <= 0) {
          // Time is up, run immediately
          console.log("Interval time expired during restore, run immediately");
          handleIntervalTrigger();
        } else {
          // Time remaining, recreate alarm
          console.log("Recreating alarm with remaining time");
          chrome.alarms.create("intervalSearch", {
            delayInMinutes: remainingMinutes,
          });
          chrome.alarms.create("backupCheck", {
            delayInMinutes: 5,
            periodInMinutes: 5,
          });
        }
      } else {
        // No time information, might be in normal search cycle
        console.log("No time information, continue normal search");
        startSearch();
      }
    }
  } catch (error) {
    console.error("Error restoring state:", error);
  }
}

// Receive messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startSearch") {
    queries = message.queries;
    mode = message.mode;
    searchIndex = 0;
    queryQueue = [];
    isProcessing = false;
    activeTabId = null;
    intervalCount = 0;
    searchStopped = false; // Reset stop flag when starting

    // Clear old alarms
    chrome.alarms.clearAll();

    if (mode === "interval") {
      intervalSearchActive = true;
      console.log("Starting interval mode");
      // Save interval state with complete information
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local
          .set({
            intervalMode: true,
            currentQueries: queries,
            currentIndex: 0,
            intervalCount: 0,
            intervalSearchActive: true,
          })
          .catch((err) => console.log("Cannot save to storage:", err));
      }
    } else {
      intervalSearchActive = false;
      // Clear interval state if possible
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local
          .clear()
          .catch((err) => console.log("Cannot clear storage:", err));
      }
    }

    // Start search immediately
    console.log("Starting first search cycle");
    startSearch();
    sendResponse({ status: "Search started" });
  } else if (message.action === "stopInterval") {
    // Stop interval - CLEAR ALL ALARMS AND RESET STATE
    searchStopped = true; // Set global stop flag
    intervalSearchActive = false;
    isProcessing = false; // Stop any ongoing processing
    queryQueue = []; // Clear the query queue
    chrome.alarms.clearAll();
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local
        .clear()
        .catch((err) => console.log("Cannot clear storage:", err));
    }
    console.log("Stopped interval mode, cleared all alarms and reset state");
    logger.info("Interval mode stopped - all operations halted", {
      clearedAlarms: true,
      clearedQueue: true,
      resetProcessing: true,
    });
    sendResponse({ status: "Interval stopped" });
  } else if (message.action === "stopAll") {
    // Stop all searches - both continuous and interval
    searchStopped = true; // Set global stop flag
    intervalSearchActive = false;
    isProcessing = false; // Stop any ongoing processing
    queryQueue = []; // Clear the query queue
    chrome.alarms.clearAll();

    // Immediately stop scrolling on active tab if exists
    if (activeTabId) {
      try {
        chrome.scripting.executeScript(
          {
            target: { tabId: activeTabId },
            func: () => {
              if (window.stopScrolling) {
                window.stopScrolling();
                console.log("All scrolling stopped immediately by stopAll");
              }
            },
          },
          () => {
            if (chrome.runtime.lastError) {
              console.log(
                "Could not stop scrolling:",
                chrome.runtime.lastError.message
              );
            }
          }
        );
      } catch (error) {
        console.log("Failed to stop scrolling:", error.message);
      }
    }

    // Stop scrolling on all tabs (in case there are multiple)
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        try {
          chrome.scripting.executeScript(
            {
              target: { tabId: tab.id },
              func: () => {
                if (window.stopScrolling) {
                  window.stopScrolling();
                  console.log(
                    "Scrolling stopped on tab:",
                    window.location.href
                  );
                }
              },
            },
            () => {
              // Ignore errors for tabs that can't execute scripts
            }
          );
        } catch (error) {
          // Ignore errors for tabs that can't execute scripts
        }
      });
    });

    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local
        .clear()
        .catch((err) => console.log("Cannot clear storage:", err));
    }
    console.log("Stopped all searches, cleared all alarms and reset state");
    logger.info("All searches stopped - all operations halted", {
      clearedAlarms: true,
      clearedQueue: true,
      resetProcessing: true,
      stoppedScrolling: true,
    });
    sendResponse({ status: "All searches stopped" });
  } else if (message.action === "downloadLogs") {
    // Download app.log file
    logger.info("Download logs request received from popup");
    downloadLogFile();
    sendResponse({ status: "Logs download initiated" });
  }
});

// Debounce variables for download
let lastDownloadTime = 0;
const DOWNLOAD_DEBOUNCE_MS = 1000; // 1 second (reduced from 5 seconds)

// Function to download log file
async function downloadLogFile() {
  try {
    // Debounce to prevent spam downloads
    const now = Date.now();
    if (now - lastDownloadTime < DOWNLOAD_DEBOUNCE_MS) {
      console.log("Download request ignored - too frequent");
      logger.warn("Download request too frequent", {
        timeSinceLastDownload: now - lastDownloadTime,
        debounceTime: DOWNLOAD_DEBOUNCE_MS,
      });
      return;
    }
    lastDownloadTime = now;

    logger.info("Starting log file download process");
    await logger.loadFromStorage();
    const logContent = logger.getLogContent();

    if (!logContent || logContent.trim() === "") {
      logger.warn("No logs available for download");
      // Store empty download ready state
      await chrome.storage.local.set({
        downloadReady: {
          content: "No logs available",
          timestamp: new Date().toISOString(),
          ready: false,
          error: "No logs available",
        },
      });
      return;
    }

    // Store logs in storage for popup to download
    await chrome.storage.local.set({
      downloadReady: {
        content: logContent,
        timestamp: new Date().toISOString(),
        ready: true,
      },
    });

    logger.info("Log file prepared for download", { size: logContent.length });
  } catch (error) {
    logger.error("Failed to prepare log file for download", error);
    // Store error state
    try {
      await chrome.storage.local.set({
        downloadReady: {
          content: "",
          timestamp: new Date().toISOString(),
          ready: false,
          error: error.message,
        },
      });
    } catch (storageError) {
      console.error("Failed to store download error state:", storageError);
    }
  }
}
