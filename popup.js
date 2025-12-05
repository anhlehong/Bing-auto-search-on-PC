console.log("popup.js loaded");

const BACKUP_TOPICS = [
  "Technology", "Artificial Intelligence", "Machine Learning", "Python", "JavaScript",
  "Space Exploration", "Mars", "Moon", "Solar System", "Galaxy",
  "History", "Ancient Rome", "Ancient Egypt", "World War II", "Renaissance",
  "Nature", "Forests", "Oceans", "Mountains", "Wildlife", "Climate Change",
  "Health", "Nutrition", "Exercise", "Mental Health", "Meditation",
  "Science", "Physics", "Chemistry", "Biology", "Astronomy",
  "Art", "Painting", "Sculpture", "Photography", "Digital Art",
  "Music", "Classical Music", "Jazz", "Rock", "Pop Music",
  "Movies", "Cinema", "Hollywood", "Oscars", "Film Direction",
  "Travel", "Tourism", "Adventure", "Destinations", "Culture",
  "Food", "Cooking", "Recipes", "Restaurants", "Cuisines",
  "Sports", "Football", "Basketball", "Tennis", "Olympics",
  "Economics", "Finance", "Investing", "Stock Market", "Business",
  "Politics", "Democracy", "Government", "Law", "Human Rights",
  "Education", "University", "School", "Learning", "Online Courses",
  "Books", "Literature", "Novels", "Poetry", "Authors",
  "Gaming", "Video Games", "Esports", "Consoles", "PC Gaming"
];

function getBackupTopics(count) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const randomTopic = BACKUP_TOPICS[Math.floor(Math.random() * BACKUP_TOPICS.length)];
    // Add a random suffix to ensure uniqueness and variety in search results
    results.push(`${randomTopic} ${Math.floor(Math.random() * 1000)}`);
  }
  return results;
}

// Professional Helper to fetch topics using a Waterfall Redundancy Strategy
async function fetchWikipediaTopics(count) {
  console.group("🔍 Topic Fetching System Started");
  console.log(`Target: ${count} topics`);
  
  let results = [];

  // --- STRATEGY 1: Wikipedia Action API (The Gold Standard) ---
  try {
    console.time("Strategy 1 (Wiki)");
    console.log("👉 Attempting Strategy 1: Wikipedia Action API (Batched)...");
    
    const BATCH_SIZE = 10; // Safe batch size to avoid strict limits
    const batches = Math.ceil(count / BATCH_SIZE);
    const promises = [];

    for (let i = 0; i < batches; i++) {
      const currentBatchSize = Math.min(BATCH_SIZE, count - (i * BATCH_SIZE));
      const params = new URLSearchParams({
        action: "query",
        format: "json",
        list: "random",
        rnlimit: currentBatchSize.toString(),
        rnnamespace: "0",
        origin: "*",
      });

      promises.push(
        fetch(`https://en.wikipedia.org/w/api.php?${params}`)
          .then(res => {
             if (!res.ok) throw new Error(`HTTP ${res.status}`);
             return res.json();
          })
          .then(data => data.query?.random?.map(item => item.title) || [])
      );
    }

    const batchResults = await Promise.all(promises);
    batchResults.forEach(batch => results.push(...batch));
    
    if (results.length >= count * 0.8) { // Accept if we got at least 80% of requests
      console.log(`✅ Strategy 1 Success: Retrieved ${results.length} topics from Wikipedia.`);
      console.timeEnd("Strategy 1 (Wiki)");
      console.groupEnd();
      return { topics: results, source: "Wikipedia" };
    } else {
      throw new Error("Wikipedia returned insufficient results.");
    }
  } catch (error) {
    console.warn(`❌ Strategy 1 Failed: ${error.message}`);
    console.timeEnd("Strategy 1 (Wiki)");
    results = []; // Reset for next strategy
  }

  // --- STRATEGY 2: Datamuse API (Semantic Association) ---
  // Limit: 100,000 calls/day. Very reliable.
  try {
    console.time("Strategy 2 (Datamuse)");
    console.log("👉 Attempting Strategy 2: Datamuse API (Semantic Search)...");
    
    // Rotate seeds to keep searches fresh
    const seeds = ['technology', 'science', 'history', 'nature', 'business', 'art'];
    const seed = seeds[Math.floor(Math.random() * seeds.length)];
    
    // 'ml' means "means like" or related to.
    const response = await fetch(`https://api.datamuse.com/words?ml=${seed}&max=${count + 5}`);
    
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        results = data.map(item => item.word);
        console.log(`✅ Strategy 2 Success: Retrieved ${results.length} topics related to '${seed}'.`);
        console.timeEnd("Strategy 2 (Datamuse)");
        console.groupEnd();
        return { topics: results, source: "Datamuse" };
      }
    }
    throw new Error("Datamuse returned empty/invalid data");
  } catch (error) {
    console.warn(`❌ Strategy 2 Failed: ${error.message}`);
    console.timeEnd("Strategy 2 (Datamuse)");
  }

  // --- STRATEGY 3: Random Data API (Structured Data) ---
  // Limit: Flexible, good for batching.
  try {
    console.time("Strategy 3 (RandomData)");
    console.log("👉 Attempting Strategy 3: Random Data API (Structured)...");
    
    // Randomize between food and appliances for variety
    const types = ['food', 'appliance'];
    const type = types[Math.floor(Math.random() * types.length)];
    
    // This API supports a 'size' parameter
    const response = await fetch(`https://random-data-api.com/api/v2/${type}s?size=${count}`);
    
    if (response.ok) {
      const data = await response.json();
      // Data can be an array or single object if size=1 (unlikely here but safe to check)
      const dataArray = Array.isArray(data) ? data : [data];
      
      results = dataArray.map(item => {
        // Map fields based on type
        return item.dish || item.equipment || "Random Thing"; 
      }).filter(t => t !== "Random Thing");

      if (results.length > 0) {
        console.log(`✅ Strategy 3 Success: Retrieved ${results.length} items of type '${type}'.`);
        console.timeEnd("Strategy 3 (RandomData)");
        console.groupEnd();
        return { topics: results, source: "Random Data API" };
      }
    }
    throw new Error("Random Data API failed");
  } catch (error) {
    console.warn(`❌ Strategy 3 Failed: ${error.message}`);
    console.timeEnd("Strategy 3 (RandomData)");
  }

  // --- STRATEGY 4: Random Word API (Last Resort External) ---
  try {
    console.time("Strategy 4 (RandomWord)");
    console.log("👉 Attempting Strategy 4: Random Word API...");
    
    const response = await fetch(`https://random-word-api.herokuapp.com/word?number=${count}`);
    if (response.ok) {
      const words = await response.json();
      if (Array.isArray(words) && words.length > 0) {
        console.log(`✅ Strategy 4 Success: Retrieved ${words.length} random words.`);
        console.timeEnd("Strategy 4 (RandomWord)");
        console.groupEnd();
        return { topics: words, source: "Random Word API" };
      }
    }
    throw new Error("Random Word API failed");
  } catch (error) {
    console.warn(`❌ Strategy 4 Failed: ${error.message}`);
    console.timeEnd("Strategy 4 (RandomWord)");
  }

  // --- FINAL FAILURE ---
  console.error("⛔ All API Strategies Failed. Falling back to local hardcoded list.");
  console.groupEnd();
  return { topics: [], source: "Local Backup" }; // Returns empty to trigger getBackupTopics() in the caller but identifies source
}

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

async function testWikipediaAPI() {
  console.log("Testing APIs...");
  const statusDiv = document.getElementById("status");
  statusDiv.textContent = "Testing connectivity & APIs...";
  statusDiv.style.color = "#007bff";

  try {
    // 1. Test Connectivity
    await fetch("https://www.google.com", { mode: "no-cors" });
    console.log("Connectivity OK");

    // 2. Test Topics Fetcher
    const { topics, source } = await fetchWikipediaTopics(5);
    
    if (topics.length > 0) {
      statusDiv.textContent = `[${source}] API Success! Got ${topics.length} items. Sample: ${topics[0]}`;
      statusDiv.style.color = "#28a745";
      console.log("API Test Topics:", topics);
    } else {
      throw new Error("All APIs failed");
    }

  } catch (error) {
    console.error("API Test Error:", error);
    statusDiv.textContent = `API Error: ${error.message}. System will use local backups.`;
    statusDiv.style.color = "#dc3545";
  }
}

function startSearch(mode) {
  console.log(`Search button clicked for ${mode} mode`);

  const searchButton = document.getElementById("searchButton");
  const intervalButton = document.getElementById("searchIntervalButton");
  searchButton.disabled = true;
  intervalButton.disabled = true;

  const searchCountInput = document.getElementById("searchCount").value;
  let searchCount = parseInt(searchCountInput) || 90;
  if (searchCount < 1 || searchCount > 100) {
    searchCount = 90;
  }
  
  // Request slightly more to be safe
  const targetCount = searchCount + 5;
  const statusDiv = document.getElementById("status");
  statusDiv.textContent = "Fetching topics...";
  statusDiv.style.color = "#007bff";

  fetchWikipediaTopics(targetCount).then((result) => {
    let { topics: queries, source } = result;
    console.log(`Fetched ${queries.length} topics from ${source}`);
    
    // Fill with backups if needed
    if (queries.length < targetCount) {
      const needed = targetCount - queries.length;
      console.log(`API missing ${needed} topics, using backups...`);
      const backups = getBackupTopics(needed);
      queries.push(...backups);
    }

    // Slice to exact needed + a buffer
    queries = queries.slice(0, targetCount);

    // Add source name as the first search query
    queries.unshift(source);

    chrome.runtime.sendMessage(
      { action: "startSearch", queries: queries, mode: mode },
      (response) => {
        console.log(`Message sent to background for ${mode}, response:`, response);

        const msg = mode === "interval" ? "Interval mode started!" : "Search started!";
        statusDiv.textContent = `[${source}] ${msg} (${queries.length} topics)`;
        statusDiv.style.color = "#28a745";

        setTimeout(() => {
          searchButton.disabled = false;
          intervalButton.disabled = false;
        }, 2000);
      }
    );
  }).catch(err => {
    // This should rarely happen as fetchWikipediaTopics handles errors internally, 
    // but just in case of catastrophic failure:
    console.error("Critical error in startSearch:", err);
    const backups = getBackupTopics(targetCount);
    
    chrome.runtime.sendMessage(
        { action: "startSearch", queries: backups, mode: mode },
        (response) => {
            statusDiv.textContent = "Search started (Offline Mode)!";
            statusDiv.style.color = "#ffc107";
            searchButton.disabled = false;
            intervalButton.disabled = false;
        }
    );
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
