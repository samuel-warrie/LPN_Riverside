require("dotenv").config();

const rawBox = require("box-node-sdk");
const BoxSDK = rawBox.default || rawBox;
const axios = require("axios");
const express = require("express");
const fs = require("fs");

const app = express();
app.use(express.json());

const configPath = process.env.BOX_CONFIG_FILE || "config.json";
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const sdk = BoxSDK.getPreconfiguredInstance(config);
const client = sdk.getAppAuthClient("user", process.env.BOX_USER_ID);

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

    const fileSizeHeader = response.headers["content-length"];
    const fileSize = Number(fileSizeHeader);

    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      throw new Error(
        "Could not determine file size from Riverside response headers",
      );
    }

    console.log(`Riverside file size: ${fileSize} bytes`);

    const uploader = await client.files.getChunkedUploader(
      folderId,
      fileSize,
      fileName,
      response.data,
    );

    const boxFile = await uploader.start();

    console.log("Upload complete:", boxFile);

    res.status(200).json({
      status: "Success",
      file: boxFile,
    });
  } catch (error) {
    console.error("Transfer failed:", error.message);

    if (error.response?.data) {
      console.error("API error data:", error.response.data);
    }

    res.status(500).json({
      error: "Transfer failed",
      details: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Middle-man server is live on port ${PORT}`);
  console.log(`Impersonating Box User: ${process.env.BOX_USER_ID}`);
});
