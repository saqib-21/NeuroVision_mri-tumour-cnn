import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";
import { platform } from "os";

export async function POST(req) {
  try {
    const data = await req.formData();
    const file = data.get("file");

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    // Get the absolute path to the Python script
    const scriptPath = join(process.cwd(), "python", "predict.py");

    // Use 'python' on Windows, 'python3' on Unix systems
    const pythonCommand = platform() === "win32" ? "python" : "python3";

    return new Promise((resolve) => {
      const py = spawn(pythonCommand, [scriptPath]);
      let output = "";
      let errorOutput = "";

      py.stdout.on("data", (data) => {
        output += data.toString();
      });

      py.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      py.stdin.write(base64);
      py.stdin.end();

      py.on("close", (code) => {
        if (code !== 0) {
          console.error("Python script error:", errorOutput);
          resolve(
            NextResponse.json(
              {
                error: "Prediction failed",
                details: errorOutput || "Unknown error",
                rawOutput: output,
                rawError: errorOutput,
              },
              { status: 500 }
            )
          );
          return;
        }

        try {
          const trimmedOutput = output.trim();
          if (!trimmedOutput) {
            throw new Error("Empty output from Python script");
          }
          const result = JSON.parse(trimmedOutput);

          // Include raw output in response for debugging
          resolve(
            NextResponse.json({
              ...result,
              _debug: {
                rawOutput: trimmedOutput,
                rawError: errorOutput || null,
              },
            })
          );
        } catch (e) {
          console.error("Parse error:", e.message);
          console.error("Output received:", output);
          resolve(
            NextResponse.json(
              {
                error: "Failed to parse prediction result",
                details: e.message,
                rawOutput: output,
                rawError: errorOutput || null,
              },
              { status: 500 }
            )
          );
        }
      });

      py.on("error", (error) => {
        console.error("Spawn error:", error);
        resolve(
          NextResponse.json(
            {
              error: "Failed to start Python process",
              details: error.message,
            },
            { status: 500 }
          )
        );
      });
    });
  } catch (error) {
    console.error("Route error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
