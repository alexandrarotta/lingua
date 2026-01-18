import fs from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import https from "node:https";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const MIN_NODE_VERSION = "24.12.0";

function parseSemver(v) {
  const m = String(v).trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function semverGte(a, b) {
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch >= b.patch;
}

function platformTriple() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "linux") {
    if (arch === "x64") return { triple: "linux-x64", ext: "tar.xz", tarFlag: "-xJf" };
    if (arch === "arm64") return { triple: "linux-arm64", ext: "tar.xz", tarFlag: "-xJf" };
  }
  if (platform === "darwin") {
    if (arch === "x64") return { triple: "darwin-x64", ext: "tar.gz", tarFlag: "-xzf" };
    if (arch === "arm64") return { triple: "darwin-arm64", ext: "tar.gz", tarFlag: "-xzf" };
  }
  return null;
}

async function readPinnedVersion(cwd) {
  try {
    const raw = await fs.readFile(path.join(cwd, ".nvmrc"), "utf8");
    const v = raw.trim().replace(/^v/, "");
    return v || MIN_NODE_VERSION;
  } catch {
    return MIN_NODE_VERSION;
  }
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        void fs.rm(destPath, { force: true });
        resolve(download(res.headers.location, destPath));
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        void fs.rm(destPath, { force: true });
        reject(new Error(`Download failed (${res.statusCode}): ${url}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    });
    req.on("error", (err) => {
      file.close();
      void fs.rm(destPath, { force: true });
      reject(err);
    });
  });
}

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function ensureNode24(cwd) {
  const current = parseSemver(process.version);
  const min = parseSemver(MIN_NODE_VERSION);
  if (current && min && semverGte(current, min)) return { nodeBinDir: null };

  const triple = platformTriple();
  if (!triple) {
    throw new Error(
      `Unsupported platform for auto Node install: ${process.platform}/${process.arch}. Install Node ${MIN_NODE_VERSION}+ manually.`
    );
  }

  const pinned = await readPinnedVersion(cwd);
  const nodeHome = path.join(cwd, ".node");
  const installDir = path.join(nodeHome, `node-v${pinned}-${triple.triple}`);
  const nodeBinDir = path.join(installDir, "bin");
  const nodePath = path.join(nodeBinDir, "node");

  if (existsSync(nodePath)) return { nodeBinDir };

  await fs.mkdir(nodeHome, { recursive: true });

  const lockPath = path.join(nodeHome, `.install-lock-${pinned}-${triple.triple}`);
  let lockHandle;
  try {
    lockHandle = await fs.open(lockPath, "wx");
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "EEXIST") {
      const start = Date.now();
      while (Date.now() - start < 180_000) {
        if (existsSync(nodePath)) return { nodeBinDir };
        await new Promise((r) => setTimeout(r, 400));
      }
      throw new Error("Timed out waiting for Node 24 auto-install lock.");
    }
    throw err;
  }

  try {
    if (existsSync(nodePath)) return { nodeBinDir };

    const archiveName = `node-v${pinned}-${triple.triple}.${triple.ext}`;
    const url = `https://nodejs.org/dist/v${pinned}/${archiveName}`;

    const downloadsDir = path.join(nodeHome, "downloads");
    await fs.mkdir(downloadsDir, { recursive: true });
    const tmpArchive = path.join(downloadsDir, `${archiveName}.tmp-${process.pid}-${Date.now()}`);
    const archivePath = path.join(downloadsDir, archiveName);

    if (!existsSync(archivePath)) {
      await download(url, tmpArchive);
      await fs.rename(tmpArchive, archivePath).catch(async () => {
        // Another process might have completed first; clean up tmp.
        await fs.rm(tmpArchive, { force: true });
      });
    } else {
      await fs.rm(tmpArchive, { force: true });
    }

    const tmpExtract = path.join(nodeHome, `tmp-extract-${process.pid}-${Date.now()}`);
    await fs.mkdir(tmpExtract, { recursive: true });
    await run("tar", [triple.tarFlag, archivePath, "-C", tmpExtract], { cwd });

    const extractedDir = path.join(tmpExtract, `node-v${pinned}-${triple.triple}`);
    if (!existsSync(extractedDir)) {
      throw new Error(`Unexpected archive layout (missing ${extractedDir}).`);
    }

    await fs.rm(installDir, { recursive: true, force: true });
    await fs.rename(extractedDir, installDir);
    await fs.rm(tmpExtract, { recursive: true, force: true });
  } finally {
    await lockHandle?.close().catch(() => undefined);
    await fs.rm(lockPath, { force: true }).catch(() => undefined);
  }

  if (!existsSync(nodePath)) throw new Error("Node 24 auto-install completed but node binary is missing.");
  return { nodeBinDir };
}

async function main() {
  const args = process.argv.slice(2);
  const sepIdx = args.indexOf("--");
  const cmdArgs = sepIdx >= 0 ? args.slice(sepIdx + 1) : args;
  if (cmdArgs.length === 0) {
    const scriptPath = fileURLToPath(import.meta.url);
    console.error(`Usage: node ${scriptPath} -- <command> [args...]`);
    process.exit(2);
  }

  const cwd = process.cwd();
  const { nodeBinDir } = await ensureNode24(cwd);

  const cmd = cmdArgs[0];
  const cmdRest = cmdArgs.slice(1);

  const env = { ...process.env };
  delete env.npm_config_metrics_registry;
  delete env.npm_config_globalignorefile;
  delete env.NPM_CONFIG_METRICS_REGISTRY;
  delete env.NPM_CONFIG_GLOBALIGNOREFILE;
  if (nodeBinDir) {
    env.PATH = `${nodeBinDir}${path.delimiter}${env.PATH ?? ""}`;
  }

  const child = spawn(cmd, cmdRest, {
    stdio: "inherit",
    cwd,
    env
  });

  child.on("exit", (code) => process.exit(code ?? 1));
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
