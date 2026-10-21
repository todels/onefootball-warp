#!/usr/bin/env node
// Builds the app for GitHub Pages and publishes dist/ to the gh-pages branch.
// Post-processes the BUILT index.html only (the source file is Toolcraft-signed):
// strips the scaffold's Toolcraft social-preview og/twitter image tags.
import { execSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (command, cwd) =>
  execSync(command, { cwd, stdio: "inherit" });

run("npx vite build --base=/onefootball-warp/");

const indexPath = "dist/index.html";
let html = readFileSync(indexPath, "utf8");
html = html.replace(
  /[ \t]*<meta (?:property="og:image[^"]*"|name="twitter:(?:card|image[^"]*)")[^>]*>\r?\n?/gu,
  "",
);
writeFileSync(indexPath, html);
console.log("Stripped social-preview meta from built index.html");

const worktree = mkdtempSync(join(tmpdir(), "ghpages-"));
run(`git worktree add ${worktree} gh-pages`);
try {
  run("git rm -rq .", worktree);
  cpSync("dist", worktree, { recursive: true });
  writeFileSync(join(worktree, ".nojekyll"), "");
  run("git add -A", worktree);
  run('git commit -m "Deploy Onefootball Warp build" --allow-empty', worktree);
  run("git push origin gh-pages", worktree);
} finally {
  run(`git worktree remove ${worktree} --force`);
  rmSync(worktree, { force: true, recursive: true });
}
console.log("Deployed to gh-pages.");
