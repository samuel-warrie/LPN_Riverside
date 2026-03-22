require("dotenv").config();
// const BoxSDK = require("box-node-sdk");
const axios = require("axios");
const express = require("express");
const fs = require("fs");
const rawBox = require("box-node-sdk");
console.log("box-node-sdk export:", rawBox);
console.log("type:", typeof rawBox);
console.log("keys:", Object.keys(rawBox || {}));

const BoxSDK = rawBox.default || rawBox;
console.log("BoxSDK resolved:", BoxSDK);
const app = express();
app.use(express.json());

const configPath = process.env.BOX_CONFIG_FILE || "config.json";
const configFile = fs.readFileSync(configPath, "utf8");
const config = JSON.parse(configFile);

const sdk = BoxSDK.getPreconfiguredInstance(config);
const client = sdk.getAppAuthClient("user", process.env.BOX_USER_ID);

app.post("/transfer", async (req, res) => {
  const { riversideUrl, folderId, fileName } = req.body;

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
    const response = await axios({
      method: "get",
      url: riversideUrl,
      responseType: "stream",
      headers: {
        Authorization: `Bearer ${process.env.RIVERSIDE_API_KEY}`,
      },
    });

    // 5. Chunked Upload to Box
    console.log("Streaming chunks directly to Box...");

    // FIX: Box Chunked Upload returns the file object directly in 'entries'
    const boxFile = await client.files.uploadChunked(
      folderId,
      null,
      fileName,
      response.data,
    );

    // FIX: Adjusted the path to the ID for chunked uploads
    const newFileId = boxFile.entries[0].id;
    console.log(`Successfully uploaded! Box File ID: ${newFileId}`);

    res.status(200).send({
      status: "Success",
      fileId: newFileId,
      message: `Uploaded as User ${process.env.BOX_USER_ID}`,
    });
  } catch (error) {
    console.error("Transfer failed:", error.message);

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Middle-man server is live on port ${PORT}`);
  console.log(`Impersonating Box User: ${process.env.BOX_USER_ID}`);
});
