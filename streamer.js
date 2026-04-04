require("dotenv").config();

const rawBox = require("box-node-sdk");
const BoxSDK = rawBox.default || rawBox;
const axios = require("axios");
const express = require("express");
const fs = require("fs");

const app = express();
app.use(express.json());

// ✅ Works locally (reads config.json file) AND on Render (reads env var)
let config;
try {
  if (process.env.BOX_CONFIG_JSON) {
    // Render: read from environment variable
    console.log("📦 Loading Box config from environment variable...");
    config = JSON.parse(process.env.BOX_CONFIG_JSON.replace(/\\n/g, "\n"));
  } else if (fs.existsSync("config.json")) {
    // Local: read from config.json file
    console.log("📦 Loading Box config from config.json file...");
    config = JSON.parse(fs.readFileSync("config.json", "utf8"));
  } else {
    throw new Error("No Box config found! Set BOX_CONFIG_JSON env var or add config.json file.");
  }
} catch (e) {
  console.error("❌ Failed to load Box config:", e.message);
  process.exit(1);
}

const sdk = BoxSDK.getPreconfiguredInstance(config);
const client = sdk.getAppAuthClient("enterprise");

// ✅ Test auth on startup
client.users
  .get("me")
  .then((u) => console.log("✅ Box auth working:", u.login))
  .catch((e) => console.error("❌ Box auth failed:", e.message));

app.post("/transfer", async (req, res) => {
  const { riversideUrl, folderId, fileName } = req.body;

  if (!riversideUrl || !folderId || !fileName) {
    return res.status(400).json({
      error: "Missing riversideUrl, folderId, or fileName",
    });
  }

  try {
    console.log(`\n--- Starting Transfer ---`);
    console.log(`File: ${fileName}`);
    console.log(`Target Folder: ${folderId}`);

    const response = await axios({
      method: "get",
      url: riversideUrl,
      responseType: "stream",
      headers: {
        Authorization: `Bearer ${process.env.RIVERSIDE_API_KEY}`,
      },
      maxRedirects: 5,
    });

    const fileSize = Number(response.headers["content-length"]);
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      throw new Error("Could not determine file size from Riverside headers");
    }

    console.log(`File size: ${fileSize} bytes`);

    const uploader = await client.files.getChunkedUploader(
      folderId,
      fileSize,
      fileName,
      response.data,
    );

    const boxFile = await uploader.start();
    console.log("✅ Upload complete:", boxFile);

    res.status(200).json({ status: "Success", file: boxFile });

  } catch (error) {
    console.error("❌ Transfer failed:", error.message);
    if (error.response?.data) {
      console.error("API error:", JSON.stringify(error.response.data));
    }
    res.status(500).json({ error: "Transfer failed", details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server live on port ${PORT}`);
});
