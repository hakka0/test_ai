// Publish only the built, serverless edition. Never reset or force-push source branches.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (command, args, cwd = root) => execFileSync(command, args, {cwd, encoding: "utf8"}).trim();
const git = (...args) => run("git", args);
if (git("status", "--porcelain", "--untracked-files=all"))
  throw new Error("Commit source changes before publishing Pages.");
const source = git("rev-parse", "HEAD");
if (!process.env.npm_execpath) throw new Error("Run this script with npm run publish:pages.");
execFileSync(process.execPath, [process.env.npm_execpath, "run", "build:pages"], {cwd: root, stdio: "inherit"});
const remote = git("remote", "get-url", "origin");
const ref = "refs/heads/gh-pages";
const existing = spawnSync("git", ["ls-remote", "--exit-code", "origin", ref], {cwd: root, encoding: "utf8"});
if (![0, 2].includes(existing.status)) throw new Error("Could not inspect the Pages branch; nothing was published.");
const site = mkdtempSync(join(tmpdir(), "autochess-pages-"));
try {
  const siteGit = (...args) => run("git", args, site);
  siteGit("init", "--quiet");
  siteGit("remote", "add", "origin", remote);
  for (const key of ["user.name", "user.email"]) siteGit("config", key, git("config", "--get", key));
  if (existing.status === 0) {
    siteGit("fetch", "--depth=1", "origin", "gh-pages");
    siteGit("checkout", "-b", "gh-pages", "FETCH_HEAD");
  } else siteGit("checkout", "--orphan", "gh-pages");
  for (const entry of readdirSync(site)) if (entry !== ".git") rmSync(join(site, entry), {recursive: true, force: true});
  cpSync(join(root, "dist-pages"), site, {recursive: true});
  writeFileSync(join(site, ".nojekyll"), "");
  writeFileSync(join(site, "source-version.json"), JSON.stringify({commit: source, mode: "pages"}, null, 2) + "\n");
  siteGit("add", "--all");
  siteGit("commit", "--quiet", "-m", `Publish serverless practice from ${source.slice(0, 12)}`);
  execFileSync("git", ["push", "origin", `HEAD:${ref}`], {cwd: site, stdio: "inherit"});
  console.log(`Published gh-pages ${siteGit("rev-parse", "HEAD")} from source ${source}`);
} finally { rmSync(site, {recursive: true, force: true}); }
