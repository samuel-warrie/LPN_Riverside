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
  if (fs.existsSync("config.json")) {
    console.log("📦 Loading Box config from config.json file...");
    config = JSON.parse(fs.readFileSync("config.json", "utf8"));
  } else {
    console.log("📦 Loading Box config from individual env vars...");
    config = {
      boxAppSettings: {
        clientID: process.env.BOX_CLIENT_ID,
        clientSecret: process.env.BOX_CLIENT_SECRET,
        appAuth: {
          publicKeyID: process.env.BOX_PUBLIC_KEY_ID,
          privateKey: process.env.BOX_PRIVATE_KEY.replace(/\\n/g, "\n"),
          passphrase: process.env.BOX_PASSPHRASE,
        },
      },
      enterpriseID: process.env.BOX_ENTERPRISE_ID,
    };
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

  // ✅ Respond immediately so Render doesn't timeout
  res.status(202).json({
    status: "Transfer started",
    message: `Transferring ${fileName} to Box folder ${folderId}`,
  });

  // ✅ Run the actual transfer in the background
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
    console.log("✅ Upload complete:", boxFile.id);
  } catch (error) {
    console.error("❌ Transfer failed:", error.message);
    if (error.response?.data) {
      console.error("API error:", JSON.stringify(error.response.data));
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server live on port ${PORT}`);
});
