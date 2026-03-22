require("dotenv").config();
const BoxSDK = require("box-node-sdk");
const axios = require("axios");
const express = require("express");
const fs = require("fs");
const app = express();

app.use(express.json());

// 1. Load the Box Config JSON (Ensure this file is in your folder)
const configPath = process.env.BOX_CONFIG_FILE || "1244329352__config.json";
const configFile = fs.readFileSync(configPath);
const config = JSON.parse(configFile);

// 2. Initialize Box SDK with JWT
if (BoxSDK.getPreconfiguredInstance) {
  const sdk = BoxSDK.getPreconfiguredInstance(config);
  var client = sdk.getAppAuthClient("user", process.env.BOX_USER_ID);
} else {
  console.error(
    "Critical Error: BoxSDK.getPreconfiguredInstance is missing. Reinstall the SDK.",
  );
}

/**
 * 3. AS-USER IMPERSONATION
 * Using your Account ID (38085490952) to act as your Admin account.
 * This bypasses the need to "invite" the service account to folders.
 */


app.post("/transfer", async (req, res) => {
  const { riversideUrl, folderId, fileName } = req.body;

  // Basic validation
  if (!riversideUrl || !folderId || !fileName) {
    return res
      .status(400)
      .send({ error: "Missing riversideUrl, folderId, or fileName" });
  }

  try {
    console.log(`\n--- Starting Transfer ---`);
    console.log(`File: ${fileName}`);
    console.log(`Target Folder: ${folderId}`);

    // 4. Authenticated Stream from Riverside
    // This handles the download without hitting Make.com's memory limits
    const response = await axios({
      method: "get",
      url: riversideUrl,
      responseType: "stream",
      headers: {
        Authorization: `Bearer ${process.env.RIVERSIDE_API_KEY}`,
      },
    });

    /**
     * 5. Chunked Upload to Box
     * Essential for 1GB+ files. The SDK handles the heavy lifting
     * of splitting the file into parts for a stable upload.
     */
    console.log("Streaming chunks directly to Box...");
    const boxFile = await client.files.uploadChunked(
      folderId,
      null, // null because we are creating a NEW file
      fileName,
      response.data,
    );

    console.log(`Successfully uploaded! Box File ID: ${boxFile.entries[0].id}`);

    res.status(200).send({
      status: "Success",
      fileId: boxFile.entries[0].id,
      message: `Uploaded as User ${process.env.BOX_USER_ID}`,
    });
  } catch (error) {
    console.error("Transfer failed:", error.message);

    // Detailed error logging for Box API issues
    if (error.response && error.response.data) {
      console.error(
        "Box Error Details:",
        JSON.stringify(error.response.data, null, 2),
      );
    }

    res.status(500).send({
      error: "Transfer failed",
      details: error.message,
    });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Middle-man server is live on port ${PORT}`);
  console.log(`Impersonating Box User: ${process.env.BOX_USER_ID}`);
  console.log(`Listening for Riverside transfers...`);
});
