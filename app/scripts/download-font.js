import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create fonts directory if it doesn't exist
const fontsDir = path.join(__dirname, "../public/fonts");
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

// Download the font file
const fontUrl =
  "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/fonts/helvetiker_regular.typeface.json";
const fontPath = path.join(fontsDir, "helvetiker_regular.typeface.json");

https
  .get(fontUrl, (response) => {
    const file = fs.createWriteStream(fontPath);
    response.pipe(file);
    file.on("finish", () => {
      file.close();
      console.log("Font file downloaded successfully");
    });
  })
  .on("error", (err) => {
    console.error("Error downloading font:", err);
  });
