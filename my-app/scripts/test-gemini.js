const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

// Load environment variables manually since we might not have dotenv installed as dev dep
try {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, "utf8");
    envConfig.split("\n").forEach((line) => {
      const parts = line.split("=");
      if (parts.length >= 2 && !line.trim().startsWith("#")) {
        const key = parts[0].trim();
        const value = parts
          .slice(1)
          .join("=")
          .trim()
          .replace(/^"(.*)"$/, "$1");
        process.env[key] = value;
      }
    });
  }
} catch (e) {
  console.error("Error loading .env.local", e);
}

const key = process.env.GEMINI_API_KEY;

if (!key) {
  console.error("No API Key found!");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(key);

async function listModels() {
  try {
    // There isn't a direct listModels yet in all SDK versions, but we can try to instantiate a model and catch error
    // Alternatively, try to run a simple completion with 'gemini-pro' to see if it works.

    // Actually, newer SDKs might expose it via getGenerativeModel or separate manager.
    // Let's just try running a prompt on a few candidates.

    const candidates = [
      "gemini-1.5-flash",
      "gemini-1.5-flash-latest",
      "gemini-1.5-flash-001",
      "gemini-1.5-pro",
      "gemini-1.5-pro-latest",
      "gemini-pro",
      "gemini-1.0-pro",
    ];

    console.log("Testing models...");

    for (const m of candidates) {
      process.stdout.write(`Testing ${m}... `);
      try {
        const model = genAI.getGenerativeModel({ model: m });
        const result = await model.generateContent("Hello");
        const response = await result.response;
        console.log("SUCCESS");
      } catch (e) {
        console.log(`FAILED: ${e.message.split("\n")[0]}`);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

listModels();
