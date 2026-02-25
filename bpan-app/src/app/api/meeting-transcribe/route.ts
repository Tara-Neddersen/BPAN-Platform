import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

type LocalTranscriber =
  | { kind: "whisper-cli"; bin: string; modelPath: string }
  | { kind: "whisper-python"; bin: string };

async function commandExists(cmd: string) {
  try {
    const { stdout } = await execFileAsync("/bin/zsh", ["-lc", `command -v ${cmd}`]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function detectLocalTranscriber(): Promise<LocalTranscriber | null> {
  const whisperCli = (await commandExists("whisper-cli")) || (await commandExists("main"));
  if (whisperCli) {
    const configuredModel = process.env.WHISPER_CPP_MODEL_PATH;
    const commonModels = [
      configuredModel,
      path.join(process.env.HOME || "", "whisper.cpp/models/ggml-base.en.bin"),
      path.join(process.env.HOME || "", "whisper.cpp/models/ggml-base.bin"),
      path.join(process.cwd(), "models/ggml-base.en.bin"),
      path.join(process.cwd(), "models/ggml-base.bin"),
    ].filter(Boolean) as string[];

    for (const modelPath of commonModels) {
      try {
        await readFile(modelPath);
        return { kind: "whisper-cli", bin: whisperCli, modelPath };
      } catch {
        continue;
      }
    }
  }

  const whisperPy = await commandExists("whisper");
  if (whisperPy) return { kind: "whisper-python", bin: whisperPy };

  return null;
}

async function convertToWav(inputPath: string, wavPath: string) {
  const ffmpeg = (await commandExists("ffmpeg")) || "/opt/homebrew/bin/ffmpeg";
  await execFileAsync(ffmpeg, [
    "-y",
    "-i", inputPath,
    "-ac", "1",
    "-ar", "16000",
    wavPath,
  ]);
}

async function transcribeWithWhisperCli(bin: string, modelPath: string, wavPath: string, outBase: string) {
  await execFileAsync(bin, [
    "-m", modelPath,
    "-f", wavPath,
    "-otxt",
    "-of", outBase,
    "-l", "en",
  ]);

  const txtPath = `${outBase}.txt`;
  const transcript = (await readFile(txtPath, "utf8")).trim();
  return transcript;
}

async function transcribeWithWhisperPy(bin: string, wavPath: string, outputDir: string) {
  await execFileAsync(bin, [
    wavPath,
    "--task", "transcribe",
    "--language", "en",
    "--model", process.env.WHISPER_MODEL || "base",
    "--output_format", "txt",
    "--output_dir", outputDir,
  ]);

  const txtPath = path.join(outputDir, `${path.parse(wavPath).name}.txt`);
  const transcript = (await readFile(txtPath, "utf8")).trim();
  return transcript;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let tempDir: string | null = null;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const maxBytes = 200 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json({ error: "File too large (max 200MB)" }, { status: 400 });
    }

    const transcriber = await detectLocalTranscriber();
    if (!transcriber) {
      return NextResponse.json(
        {
          error:
            "Free local transcription is not configured yet. Install whisper.cpp (or python whisper) and try again. ffmpeg is already installed.",
        },
        { status: 503 }
      );
    }

    tempDir = await mkdtemp(path.join(tmpdir(), "meeting-transcribe-"));
    const ext = path.extname(file.name || "") || ".bin";
    const inputPath = path.join(tempDir, `input${ext}`);
    const wavPath = path.join(tempDir, "audio.wav");
    const outBase = path.join(tempDir, "transcript");

    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(inputPath, bytes);
    await convertToWav(inputPath, wavPath);

    let transcript = "";
    if (transcriber.kind === "whisper-cli") {
      transcript = await transcribeWithWhisperCli(transcriber.bin, transcriber.modelPath, wavPath, outBase);
    } else {
      transcript = await transcribeWithWhisperPy(transcriber.bin, wavPath, tempDir);
    }

    if (!transcript) {
      return NextResponse.json({ error: "No speech detected in recording." }, { status: 422 });
    }

    return NextResponse.json({ transcript, engine: transcriber.kind });
  } catch (err) {
    console.error("meeting-transcribe error", err);
    const message = err instanceof Error ? err.message : "Failed to transcribe recording";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

