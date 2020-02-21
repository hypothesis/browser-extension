#!groovy

node {
    checkout scm

    workspace = pwd()

    // Git branch which releases are deployed from.
    releaseFromBranch = "master"

    sh "docker build -t hypothesis-browser-extension-tests ."
    nodeEnv = docker.image("hypothesis-browser-extension-tests")
    gitVersion = sh(
        script: "git rev-parse --short HEAD",
        returnStdout: true
    ).trim()

    // Fetch tags because `git describe` uses them and the output from `git describe`
    // is in turn used to produce the extension version number in `build/manifest.json`.
    sh "git fetch --quiet --tags"

    // Show version information in the build logs. This version string is used by
    // `tools/settings.js` to generate the extension version.
    sh "git describe"

    stage('Setup') {
      nodeEnv.inside("-e HOME=${workspace}") {
        sh "npm ci"
      }
    }

    stage('Test') {
        nodeEnv.inside("-e HOME=${workspace}") {
          sh "make checkformatting lint test"
        }
    }

    stage('Build Packages') {
        nodeEnv.inside("-e HOME=${workspace}") {
          // FIXME - We should ensure that each build runs in a fresh workspace
          // so old files don't need to be cleared out manually.
          sh "rm -rf dist/*"

          sh "make SETTINGS_FILE=settings/chrome-stage.json dist/${gitVersion}-chrome-stage.zip"
          sh "make SETTINGS_FILE=settings/chrome-prod.json dist/${gitVersion}-chrome-prod.zip"
          sh "make SETTINGS_FILE=settings/firefox-stage.json dist/${gitVersion}-firefox-stage.xpi"
          sh "make SETTINGS_FILE=settings/firefox-prod.json dist/${gitVersion}-firefox-prod.xpi"
        }
    }
}

if (env.BRANCH_NAME != releaseFromBranch) {
    echo "Skipping deployment because ${env.BRANCH_NAME} is not the ${releaseFromBranch} branch"
    return
}

milestone()
stage('Upload Packages') {
    node {
        nodeEnv.inside("-e HOME=${workspace}") {
            withCredentials([
                // Credentials for Chrome Web Store API calls.
                // These are managed under the "Client Chrome Extension" project under the
                // "Hypothes.is" organization in the Google Developers Console
                // (https://console.developers.google.com/apis/credentials?project=client-chrome-extension)
                usernamePassword(
                    credentialsId: 'chrome-webstore-client',
                    usernameVariable: 'CHROME_WEBSTORE_CLIENT_ID',
                    passwordVariable: 'CHROME_WEBSTORE_CLIENT_SECRET'),

                // Refresh token for Chrome Web Store API calls.
                // This is generated using the `tools/chrome-webstore-refresh-token` script.
                string(
                    credentialsId: 'chrome-webstore-refresh-token',
                    variable: 'CHROME_WEBSTORE_REFRESH_TOKEN'),

                // Credentials for addons.mozilla.org API calls.
                // These are accessible/managed from https://addons.mozilla.org/en-GB/developers/addon/api/key/
                // when logged into our shared Firefox account.
                usernamePassword(
                    credentialsId: 'firefox-amo-key',
                    usernameVariable: 'FIREFOX_AMO_KEY',
                    passwordVariable: 'FIREFOX_AMO_SECRET'),
            ]) {
                sh "tools/deploy"
            }
        }
    }
}
