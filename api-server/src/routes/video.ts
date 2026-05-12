import { Router, type IRouter, type Request, type Response } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { statsStore } from "../stats-store.js";

const router: IRouter = Router();

const YT_DLP_PATH = "/home/runner/workspace/.pythonlibs/bin/yt-dlp";

const cookieDir = path.join(os.tmpdir(), "video-downloader-cookies");
if (!fs.existsSync(cookieDir)) {
  fs.mkdirSync(cookieDir, { recursive: true });
}

const downloadDir = path.join(os.tmpdir(), "video-downloader");
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
}


function runYtDlp(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YT_DLP_PATH, args, {
      env: { ...process.env, PATH: `/home/runner/workspace/.pythonlibs/bin:${process.env.PATH}` },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

// Get video stream metadata using ffprobe
function probeVideoHeight(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      filePath,
    ]);
    let out = "";
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", () => {
      try {
        const data = JSON.parse(out);
        const video = data.streams?.find((s: any) => s.codec_type === "video");
        resolve(video?.height || 0);
      } catch {
        resolve(0);
      }
    });
    proc.on("error", () => resolve(0));
  });
}

// Re-encode/scale a video to target height using ffmpeg with H.264
function scaleVideoToHeight(inputPath: string, outputPath: string, targetHeight: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-i", inputPath,
      "-vf", `scale=-2:${targetHeight}`,
      "-c:v", "libx264",
      "-crf", "26",
      "-preset", "fast",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg scale failed: ${stderr.slice(-300)}`));
    });
    proc.on("error", (err) => reject(new Error(`ffmpeg error: ${err.message}`)));
  });
}

function detectPlatform(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "YouTube";
  if (lower.includes("tiktok.com")) return "TikTok";
  if (lower.includes("instagram.com")) return "Instagram";
  if (lower.includes("facebook.com") || lower.includes("fb.watch")) return "Facebook";
  if (lower.includes("pinterest.com") || lower.includes("pin.it")) return "Pinterest";
  if (lower.includes("twitter.com") || lower.includes("x.com")) return "Twitter/X";
  if (lower.includes("reddit.com")) return "Reddit";
  if (lower.includes("vimeo.com")) return "Vimeo";
  if (lower.includes("twitch.tv")) return "Twitch";
  if (lower.includes("dailymotion.com")) return "Dailymotion";
  if (lower.includes("soundcloud.com")) return "SoundCloud";
  if (lower.includes("linkedin.com")) return "LinkedIn";
  if (lower.includes("snapchat.com")) return "Snapchat";
  return "Other";
}

/**
 * Build a Netscape-format cookie file from a raw cookie string like:
 *   "sessionid=abc123; csrftoken=xyz; ..."
 * Writes to the given filePath.
 */
function writeCookieFile(cookieStr: string, domain: string, filePath: string): void {
  const pairs = cookieStr.split(";").map((s) => s.trim()).filter(Boolean);
  const lines = [
    "# Netscape HTTP Cookie File",
    "# Generated automatically.",
    "",
  ];

  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx < 0) continue;
    const name = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    lines.push(`.${domain}\tTRUE\t/\tFALSE\t9999999999\t${name}\t${value}`);
  }

  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

function getInstagramCookieFile(): string | null {
  // Use INSTAGRAM_COOKIES environment secret (set in Replit Secrets).
  // Value can be a full cookie string like "sessionid=abc; csrftoken=xyz"
  // or just a raw sessionid token value.
  const raw = process.env.INSTAGRAM_COOKIES;
  if (!raw || !raw.trim()) return null;

  let cookieStr = raw.trim();
  // URL-decode if needed (e.g. %3A → :)
  if (cookieStr.includes("%3A") || cookieStr.includes("%3D") || cookieStr.includes("%3d")) {
    cookieStr = decodeURIComponent(cookieStr);
  }
  // Wrap bare token in sessionid= key
  if (!cookieStr.includes("=")) {
    cookieStr = `sessionid=${cookieStr}`;
  }

  const tmpFile = path.join(cookieDir, "instagram-env.txt");
  writeCookieFile(cookieStr, "instagram.com", tmpFile);
  return tmpFile;
}

function addBaseArgs(args: string[], url: string): void {
  const lower = url.toLowerCase();
  const isInstagram = lower.includes("instagram.com");
  const isTikTok = lower.includes("tiktok.com");

  if (isInstagram) {
    const cookieFile = getInstagramCookieFile();
    if (cookieFile) {
      args.push("--cookies", cookieFile);
    }
  }

  if (isTikTok) {
    args.push(
      "--extractor-args",
      "tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com"
    );
  }
}

// ── Instagram status (kept for backwards compat) ──────────────────────────────

router.get("/instagram-status", (_req: Request, res: Response) => {
  res.json({ configured: true });
});

// ── Video info ────────────────────────────────────────────────────────────────

router.post("/info", async (req: Request, res: Response) => {
  const { url } = req.body as { url?: string };

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "URL is required" });
    return;
  }

  const platform = detectPlatform(url);

  try {
    const infoArgs = ["--dump-json", "--no-playlist"];
    addBaseArgs(infoArgs, url);
    infoArgs.push(url);

    const { stdout } = await runYtDlp(infoArgs);

    // Find the first valid JSON line (yt-dlp may print warnings before JSON)
    const jsonLine = stdout.trim().split("\n").find(l => l.trim().startsWith("{"));
    if (!jsonLine) throw new Error("No JSON output from yt-dlp");
    const info = JSON.parse(jsonLine);

    const allFormats: Array<{
      formatId: string;
      ext: string;
      quality: string;
      resolution: string;
      filesize: number | null;
      hasVideo: boolean;
      hasAudio: boolean;
    }> = [];

    // Standard quality tiers — shown on ALL platforms
    const QUALITY_TIERS = [
      { label: "4K (2160p)", tag: "2160p", height: 2160 },
      { label: "1440p",      tag: "1440p", height: 1440 },
      { label: "1080p",      tag: "1080p", height: 1080 },
      { label: "720p",       tag: "720p",  height: 720  },
      { label: "480p",       tag: "480p",  height: 480  },
      { label: "360p",       tag: "360p",  height: 360  },
      { label: "240p",       tag: "240p",  height: 240  },
      { label: "144p",       tag: "144p",  height: 144  },
    ];

    const rawFormats: any[] = info.formats || [];

    // Get the maximum available height across all streams
    const availableHeights: number[] = rawFormats
      .map((f: any) => f.height || 0)
      .filter((h: number) => h > 0);
    // Default to 720 if no height info (safeguard — e.g. audio-only sources)
    const maxHeight = availableHeights.length > 0 ? Math.max(...availableHeights) : 720;

    // Add quality tiers from maxHeight down to 144p for ALL platforms.
    // The download handler will use yt-dlp format selection (DASH platforms) and
    // ffmpeg downscaling (combined-stream platforms) as needed.
    for (const tier of QUALITY_TIERS) {
      if (maxHeight >= tier.height) {
        allFormats.push({
          formatId: `__q_${tier.height}__`,
          ext: "mp4",
          quality: tier.label,
          resolution: tier.tag,
          filesize: null,
          hasVideo: true,
          hasAudio: true,
        });
      }
    }

    // MP3 audio — works for all platforms
    allFormats.push({
      formatId: "__mp3__",
      ext: "mp3",
      quality: "MP3 Audio",
      resolution: "audio",
      filesize: null,
      hasVideo: false,
      hasAudio: true,
    });

    res.json({
      title: info.title || "Unknown",
      thumbnail: info.thumbnail || null,
      duration: info.duration || null,
      uploader: info.uploader || info.channel || info.creator || null,
      platform,
      formats: allFormats,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching video info:", message);
    res.status(500).json({
      error: "Failed to fetch video information",
      details: message.substring(0, 500),
    });
  }
});

// ── Download ──────────────────────────────────────────────────────────────────

router.post("/download", async (req: Request, res: Response) => {
  const { url, formatId } = req.body as { url?: string; formatId?: string };

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "URL is required" });
    return;
  }
  if (!formatId || typeof formatId !== "string") {
    res.status(400).json({ error: "formatId is required" });
    return;
  }

  const fileId = crypto.randomBytes(16).toString("hex");
  const platform = detectPlatform(url);
  statsStore.startDownload(fileId);

  try {
    let dlArgs: string[];
    const outputTemplate = path.join(downloadDir, `${fileId}.%(ext)s`);

    // Parse synthetic quality ID: __q_<height>__  (e.g. __q_480__)
    const qMatch = formatId.match(/^__q_(\d+)__$/);

    if (formatId === "__mp3__") {
      // ── Audio: extract and convert to MP3 ────────────────────────────────
      dlArgs = [
        "--format", "bestaudio/best",
        "--extract-audio",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--no-playlist",
        "--output", outputTemplate,
      ];
      addBaseArgs(dlArgs, url);
      dlArgs.push(url);
      await runYtDlp(dlArgs);

    } else if (qMatch) {
      const targetHeight = parseInt(qMatch[1], 10);

      // ── Video: prefer DASH H.264 at target height, fall back to best ─────
      // For DASH platforms (YouTube) the first few alternatives succeed directly.
      // For combined-stream platforms (TikTok, Instagram, etc.) the best[ext=mp4]/best
      // fallbacks download the original quality, then we scale with ffmpeg.
      const fmtStr =
        `bestvideo[height<=${targetHeight}][vcodec^=avc][ext=mp4]+bestaudio[ext=m4a]` +
        `/bestvideo[height<=${targetHeight}][vcodec^=avc]+bestaudio` +
        `/bestvideo[height<=${targetHeight}][ext=mp4]+bestaudio[ext=m4a]` +
        `/bestvideo[height<=${targetHeight}]+bestaudio` +
        `/best[height<=${targetHeight}][ext=mp4]` +
        `/best[height<=${targetHeight}]` +
        `/best[ext=mp4]/best`;

      dlArgs = [
        "--format", fmtStr,
        "--merge-output-format", "mp4",
        "--no-playlist",
        "--output", outputTemplate,
      ];
      addBaseArgs(dlArgs, url);
      dlArgs.push(url);
      await runYtDlp(dlArgs);

      // Check if the downloaded file needs to be scaled down via ffmpeg.
      // This happens for combined-stream platforms where only a higher resolution
      // was available (e.g. user requests 480p from a TikTok 720p video).
      const dlFiles = fs.readdirSync(downloadDir).filter(f => f.startsWith(fileId));
      if (dlFiles.length > 0) {
        const dlPath = path.join(downloadDir, dlFiles[0]);
        const actualHeight = await probeVideoHeight(dlPath);

        if (actualHeight > 0 && actualHeight > targetHeight) {
          const scaledName = `${fileId}_s.mp4`;
          const scaledPath = path.join(downloadDir, scaledName);
          await scaleVideoToHeight(dlPath, scaledPath, targetHeight);
          fs.unlinkSync(dlPath);
        }
      }

    } else {
      // ── Legacy/raw format string (backwards compat) ──────────────────────
      dlArgs = [
        "--format", formatId,
        "--merge-output-format", "mp4",
        "--no-playlist",
        "--output", outputTemplate,
      ];
      addBaseArgs(dlArgs, url);
      dlArgs.push(url);
      await runYtDlp(dlArgs);
    }

    const files = fs.readdirSync(downloadDir).filter((f) => f.startsWith(fileId));
    if (files.length === 0) throw new Error("Download produced no output file");

    const filename = files[0];
    const ext = path.extname(filename).replace(".", "");

    // Record successful download in stats store
    statsStore.endDownload(fileId, { title: filename, platform });

    res.json({ downloadUrl: `/api/video/file/${filename}`, filename, ext });
  } catch (error: unknown) {
    statsStore.endDownload(fileId); // clear active download counter on failure too
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Download error:", message);
    res.status(500).json({ error: "Failed to download video", details: message.substring(0, 500) });
  }
});

// ── File serve ────────────────────────────────────────────────────────────────

router.get("/file/:filename", (req: Request, res: Response) => {
  const { filename } = req.params;

  if (!filename || filename.includes("..") || filename.includes("/")) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }

  const filePath = path.join(downloadDir, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const ext = path.extname(filename).replace(".", "").toLowerCase();
  const contentTypeMap: Record<string, string> = {
    mp4: "video/mp4", webm: "video/webm", mkv: "video/x-matroska",
    mp3: "audio/mpeg", m4a: "audio/mp4", opus: "audio/ogg",
  };

  res.setHeader("Content-Type", contentTypeMap[ext] || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on("close", () => {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });
});

export default router;
