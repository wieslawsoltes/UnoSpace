# Releasing Uno Space apps and packages

Every Uno Space repository ships the same way from a single workflow,
`.github/workflows/release.yml`:

| Trigger | What happens |
| --- | --- |
| Push a tag `v<version>` | Runs the repo's QA gates, builds the browser app, **six self-contained single-file desktop executables** (Windows, macOS, Linux × x64/arm64), packs every reusable library with symbols, creates a **GitHub Release** with all assets + `SHA256SUMS`, then publishes the packages to **NuGet.org via Trusted Publishing** (OIDC — no API key stored anywhere). |
| Run it manually (Actions → Release → Run workflow) | **Dry run.** Builds and uploads every asset as workflow artifacts (`desktop-<rid>`, `nuget-packages`, …). Nothing is released or published. |

Release assets per app:

```
<App>-<version>-win-x64.zip        <App>-<version>-win-arm64.zip
<App>-<version>-osx-x64.tar.gz     <App>-<version>-osx-arm64.tar.gz
<App>-<version>-linux-x64.tar.gz   <App>-<version>-linux-arm64.tar.gz
<App>-browser-<version>.zip (where the repo ships one)   *.nupkg   SHA256SUMS
```

Each archive contains exactly one executable (`<App>` / `<App>.exe`) with the .NET runtime,
native Skia/HarfBuzz libraries and app content bundled in. macOS binaries are ad-hoc signed
(required on Apple Silicon) but not notarized; Windows binaries are not Authenticode signed.

## Repository status

All 17 repositories were converted and each passed a full dry run of `release.yml` on GitHub
(six desktop executables + all packages built; nothing published). Tag the current source
version to make the first release:

| Repository | Source version → tag | NuGet packages |
| --- | --- | --- |
| VectorSpace | `0.7.0-alpha.1` → `v0.7.0-alpha.1` | 10 (`VectorSpace.Model` replaces the taken `VectorSpace.Core` ID) |
| ArtSpace | `0.4.1-alpha.1` → `v0.4.1-alpha.1` | 9 |
| TextSpace | `0.5.1-alpha.1` → `v0.5.1-alpha.1` | 10 |
| GridSpace | `0.3.0-alpha.1` → `v0.3.0-alpha.1` | 8 |
| PdfSpace | `0.5.4-alpha.1` → `v0.5.4-alpha.1` | 12 |
| PresentationSpace | `0.6.0` → `v0.6.0` | 6 |
| ImageSpace | `0.3.2-alpha.1` → `v0.3.2-alpha.1` | 11 |
| LightSpace | `0.4.1-alpha.1` → `v0.4.1-alpha.1` | 8 |
| VideoSpace | `0.3.0-alpha.1` → `v0.3.0-alpha.1` | 10 |
| EffectsSpace | `0.1.0-alpha.1` → `v0.1.0-alpha.1` | 11 |
| CadSpace | `0.1.0` → `v0.1.0` | 6 |
| LabSpace | `0.3.0-alpha.1` → `v0.3.0-alpha.1` | 9 |
| ControlSpace | `0.1.0` → `v0.1.0` | 8 |
| CodeSpace | `0.1.0` → `v0.1.0` | 8 |
| GitSpace | `0.1.0` → `v0.1.0` | 7 |
| DataSpace | `0.2.0-preview.3` → `v0.2.0-preview.3` | 5 |
| NoteSpace | `0.1.0` → `v0.1.0` | 5 |
| **Total** | | **143** (+ 143 symbol packages) |

Repository-specific notes:

- **TextSpace** only releases a commit that has already passed the Build workflow on `main`.
- **PdfSpace.Rendering.Skia** keeps its Apache-2.0 licence and upstream authors because it is a
  derivative work; every other package is MIT.
- **ImageSpace** also publishes its `packages/webgpu` npm package on tags (existing `NPM_TOKEN`,
  now tag-only). The CodeSpace extension host and GitSpace browser-git npm packages are attached
  to releases as archives but are not pushed to npm.
- Several old workflows could create real GitHub releases from manual runs (CadSpace,
  EffectsSpace, GridSpace, LightSpace); manual runs are now always dry runs.

---

## One-time setup: NuGet Trusted Publishing

You need to do this once per repository (17 policies). It takes about a minute each.

### 1. Create a Trusted Publishing policy on nuget.org

1. Sign in at <https://www.nuget.org>, click your user name (top right) → **Trusted Publishing**.
2. **Add policy** and fill in (values are case-insensitive):

   | Field | Value |
   | --- | --- |
   | Policy name | e.g. `VectorSpace release` |
   | Package owner | your nuget.org account |
   | Repository owner | `wieslawsoltes` |
   | Repository | the repo name, e.g. `VectorSpace` |
   | Workflow file | `release.yml` *(file name only — not `.github/workflows/…`)* |
   | Environment | `nuget` |

3. Save. Repeat for every repository:

   `VectorSpace`, `ArtSpace`, `TextSpace`, `GridSpace`, `PdfSpace`, `PresentationSpace`,
   `ImageSpace`, `LightSpace`, `VideoSpace`, `EffectsSpace`, `CadSpace`, `LabSpace`,
   `ControlSpace`, `CodeSpace`, `GitSpace`, `DataSpace`, `NoteSpace`.

A policy applies to all packages owned by the selected package owner, including package IDs
that don't exist yet, so the first release can create them. All repositories are public, so
policies become permanently active after their first successful publish (policies for private
repositories start as "temporarily active" for 7 days until a publish succeeds).

### 2. Tell the workflows your nuget.org user name

`NuGet/login` needs your nuget.org **profile name** (not your e-mail). Set it as a repository
variable in every repo with the GitHub CLI:

```bash
NUGET_USER="<your-nuget-profile-name>"
for r in VectorSpace ArtSpace TextSpace GridSpace PdfSpace PresentationSpace ImageSpace \
         LightSpace VideoSpace EffectsSpace CadSpace LabSpace ControlSpace CodeSpace \
         GitSpace DataSpace NoteSpace; do
  gh variable set NUGET_USER --repo "wieslawsoltes/$r" --body "$NUGET_USER"
done
```

(A secret named `NUGET_USER` works too; the workflow reads `vars.NUGET_USER || secrets.NUGET_USER`.)

### 3. (Recommended) Lock down the `nuget` environment

The publish job runs in the GitHub environment `nuget` (created automatically on first use).
Restrict it to version tags, and optionally require your approval before anything is pushed:

```bash
for r in VectorSpace ArtSpace TextSpace GridSpace PdfSpace PresentationSpace ImageSpace \
         LightSpace VideoSpace EffectsSpace CadSpace LabSpace ControlSpace CodeSpace \
         GitSpace DataSpace NoteSpace; do
  gh api -X PUT "repos/wieslawsoltes/$r/environments/nuget" \
    -F "deployment_branch_policy[protected_branches]=false" \
    -F "deployment_branch_policy[custom_branch_policies]=true" >/dev/null
  gh api -X POST "repos/wieslawsoltes/$r/environments/nuget/deployment-branch-policies" \
    -f name='v*' -f type=tag >/dev/null
done
```

To require manual approval, add yourself under **Settings → Environments → nuget → Required
reviewers** (or pass `reviewers` in the `PUT` call above).

### 4. Remove old API keys

Six repositories (ArtSpace, EffectsSpace, GridSpace, ImageSpace, PdfSpace, TextSpace) previously
pushed with a long-lived `NUGET_API_KEY`. The workflows no longer use it. Delete the secret and
revoke the key on nuget.org (**API Keys** page):

```bash
for r in ArtSpace EffectsSpace GridSpace ImageSpace PdfSpace TextSpace; do
  gh secret delete NUGET_API_KEY --repo "wieslawsoltes/$r" 2>/dev/null
  gh secret delete NUGET_API_KEY --repo "wieslawsoltes/$r" --env nuget 2>/dev/null
done
```

### 5. (Optional) Reserve your ID prefixes

Ask nuget.org to reserve the prefixes (e.g. `NoteSpace.*`, `GridSpace.*`, …) by e-mailing
<account@nuget.org> from your account address. Reserved prefixes show a verified check mark and
stop others from publishing look-alike IDs. Note `VectorSpace.Core` is already owned by another
user, so that library ships as **`VectorSpace.Model`** (namespaces and assembly names unchanged).

---

## Cutting a release

1. Update `<Version>` in the repo's `Directory.Build.props` (several repos refuse a tag that
   doesn't match it), commit and push to `main`.
2. Optionally do a dry run first: **Actions → Release → Run workflow** (or
   `gh workflow run release.yml -R wieslawsoltes/<Repo>`), and inspect the artifacts.
3. Tag and push:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

   Versions with a suffix (`v0.2.0-alpha.1`) are marked as pre-releases on GitHub and NuGet.
4. Watch the run (`gh run watch -R wieslawsoltes/<Repo>`). If the `nuget` environment requires
   approval, approve the **Publish to NuGet.org** job. New packages appear on nuget.org after
   validation and indexing (usually a few minutes).

A failed publish can be retried by re-running just the failed job; `--skip-duplicate` makes
pushes idempotent. NuGet packages cannot be deleted, only unlisted — use dry runs to check
package contents before tagging.

## Running the downloaded apps

- **Windows:** unzip and run `<App>.exe`. SmartScreen may warn about an unsigned app —
  **More info → Run anyway**.
- **macOS:** `tar -xzf <App>-<version>-osx-arm64.tar.gz`, then
  `xattr -d com.apple.quarantine <App>` (browser downloads are quarantined because the app isn't
  notarized) and run `./<App>`.
- **Linux:** `tar -xzf …linux-x64.tar.gz && ./<App>` (X11 or XWayland; needs fontconfig and
  the usual desktop libraries).

On first launch the single-file host extracts its bundled native libraries and content to a
per-user cache (`DOTNET_BUNDLE_EXTRACT_BASE_DIR` overrides the location).
