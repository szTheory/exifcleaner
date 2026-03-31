# Code Signing & Release Setup

This guide covers how to configure macOS code signing, notarization, and the release workflow for ExifCleaner.

## 1. Overview

ExifCleaner releases require macOS code signing and notarization so users can install the app without Gatekeeper warnings. The release workflow (GitHub Actions) handles signing and notarization automatically when the required secrets are configured.

**Windows signing is intentionally deferred.** Windows builds ship unsigned. SmartScreen will show a warning for the first few downloads, but builds reputation over time as more users install the app. Windows signing can be added later if it becomes a significant user complaint.

### Required GitHub Secrets

| Secret | Purpose |
|--------|---------|
| `MACOS_CERTIFICATE_BASE64` | Base64-encoded .p12 signing certificate |
| `MACOS_CERTIFICATE_PASSWORD` | Password for the .p12 file |
| `APPLE_API_KEY_BASE64` | Base64-encoded .p8 App Store Connect API key |
| `APPLE_API_KEY_ID` | 10-character alphanumeric Key ID |
| `APPLE_API_ISSUER` | UUID Issuer ID from App Store Connect |
| `HOMEBREW_TOKEN` | GitHub PAT for Homebrew cask updates (optional) |

## 2. Apple Developer Program Enrollment

1. Go to <https://developer.apple.com/programs/>
2. Enroll as an **Individual** ($99/year)
3. Wait for approval (usually same day for individuals)

You need this membership to create Developer ID certificates and use the notary service.

## 3. Create Developer ID Application Certificate

### Generate a Certificate Signing Request (CSR)

1. Open **Keychain Access** on macOS
2. Go to **Keychain Access > Certificate Assistant > Request a Certificate from a Certificate Authority**
3. Enter your email address
4. Select **Saved to disk** (email is not needed)
5. Save the `.certSigningRequest` file

### Create the Certificate

1. Go to <https://developer.apple.com/account/resources/certificates/list>
2. Click **+** to create a new certificate
3. Select **Developer ID Application** (NOT "Developer ID Installer")
4. Upload the CSR file you saved
5. Download the `.cer` file
6. Double-click the `.cer` file to install it in Keychain Access

### Export as .p12

1. Open **Keychain Access**
2. Go to **My Certificates** (in the sidebar)
3. Find and expand **Developer ID Application: Your Name**
4. Right-click on the certificate (not the private key) and select **Export**
5. Choose **.p12** format
6. Set a strong password (you will need this for `MACOS_CERTIFICATE_PASSWORD`)
7. Save the file

### Base64-encode the .p12

```bash
base64 -i certificate.p12 | pbcopy
```

This copies the base64 string to your clipboard. Use it for the `MACOS_CERTIFICATE_BASE64` secret.

## 4. Create App Store Connect API Key

1. Go to <https://appstoreconnect.apple.com/access/integrations/api>
2. Click **+** to generate a new API key
3. Name: **ExifCleaner Notarization**
4. Access: **Developer**
5. Click **Generate**
6. **Download the .p8 file immediately** -- it is only available for download once
7. Note the **Key ID** (10-character alphanumeric string shown in the table)
8. Note the **Issuer ID** (UUID shown at the top of the API keys page)

### Base64-encode the .p8 key

```bash
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
```

Replace `XXXXXXXXXX` with your actual Key ID. This copies the base64 string to your clipboard. Use it for the `APPLE_API_KEY_BASE64` secret.

## 5. Configure GitHub Secrets

1. Go to your repository on GitHub
2. Navigate to **Settings > Secrets and variables > Actions**
3. Add the following **repository secrets**:

| Secret Name | Value |
|-------------|-------|
| `MACOS_CERTIFICATE_BASE64` | Base64 of the .p12 file (from step 3) |
| `MACOS_CERTIFICATE_PASSWORD` | Password you set during .p12 export |
| `APPLE_API_KEY_BASE64` | Base64 of the .p8 file (from step 4) |
| `APPLE_API_KEY_ID` | 10-character Key ID from App Store Connect |
| `APPLE_API_ISSUER` | UUID Issuer ID from App Store Connect |

## 6. Homebrew Cask (Optional)

This is only needed if you want the Homebrew cask to update automatically when a new release is published.

1. Create a **GitHub Personal Access Token** (classic) with the `public_repo` scope
2. Go to **Settings > Secrets and variables > Actions**
3. Add the secret:

| Secret Name | Value |
|-------------|-------|
| `HOMEBREW_TOKEN` | GitHub PAT with `public_repo` scope |

If this secret is not configured, the Homebrew cask update workflow simply does not run. Releases still work normally.

## 7. Triggering a Release

1. Bump the version in `package.json` (e.g., `"version": "4.0.0"`)
2. Commit and push the version bump to the repository
3. Go to **Actions > Release** in the GitHub repository (workflow_dispatch trigger)
4. Click **Run workflow** and select the branch
5. Wait for the build to complete (~15-20 minutes)
6. The workflow creates a **draft release** on the GitHub Releases page
7. Review the release notes and edit if needed
8. Click **Publish release** when ready

The workflow will:
- Run the full test suite (lint, typecheck, unit tests, E2E tests)
- Build signed + notarized macOS universal binary (.dmg)
- Build Windows installer (.exe) + portable (unsigned)
- Build Linux packages (.AppImage, .deb, .rpm)
- Generate SHASUMS256.txt for all artifacts
- Create a git tag matching the version
- Create a draft GitHub release with all artifacts attached

## 8. Verifying the Signed Build

After downloading the macOS .dmg from the release:

1. Mount the .dmg by double-clicking it

2. Verify the code signature:

```bash
codesign --verify --deep --strict /Volumes/ExifCleaner*/ExifCleaner.app
```

Expected output: no errors (silent success).

3. Verify Gatekeeper acceptance:

```bash
spctl --assess --type execute --verbose /Volumes/ExifCleaner*/ExifCleaner.app
```

Expected output should contain `accepted` and `Developer ID`.

4. Check notarization stapling:

```bash
stapler validate /Volumes/ExifCleaner*/ExifCleaner.app
```

Expected output: `The validate action worked!`

## 9. Windows Signing (Deferred)

Windows code signing is currently deferred per project decision. Windows builds ship unsigned.

**Why deferred:**
- EV code signing certificates cost $200-600/year
- Requires a hardware security module (HSM) or cloud signing service
- SmartScreen reputation builds organically over time as more users download
- Can be added later without changing the application code

**To add Windows signing in the future:**

1. Obtain an EV code signing certificate from a CA (e.g., DigiCert, Sectigo)
2. Add these GitHub Secrets:
   - `CSC_LINK` -- Base64-encoded .pfx certificate file
   - `CSC_KEY_PASSWORD` -- Certificate password
3. Update `release.yml` to set these environment variables in the Windows build job
4. electron-builder will automatically sign the Windows build when these are present
