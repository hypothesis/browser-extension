#!groovy

node {
    checkout scm

    workspace = pwd()

    // Git branch which releases are deployed from.
    releaseFromBranch = "master"

    sh "docker build -t hypothesis-browser-extension-tests ."
    nodeEnv = docker.image("hypothesis-browser-extension-tests")

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
          sh "make SETTINGS_FILE=settings/chrome-stage.json dist/chrome-stage.zip"
          sh "make SETTINGS_FILE=settings/chrome-prod.json dist/chrome-prod.zip"
          sh "make SETTINGS_FILE=settings/firefox-stage.json dist/firefox-stage.xpi"
          sh "make SETTINGS_FILE=settings/firefox-prod.json dist/firefox-prod.xpi"
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
            // TODO -  Add credentials for Chrome Web Store and addons.mozilla.org uploads
            // using `withCredentials`. The following env vars need to be set:
            //
            // - CHROME_WEBSTORE_CLIENT_ID
            // - CHROME_WEBSTORE_CLIENT_SECRET
            // - CHROME_WEBSTORE_REFRESH_TOKEN
            // - FIREFOX_AMO_KEY
            // - FIREFOX_AMO_SECRET

            echo "Deployment step not implemented"

            // TODO - Upload the QA + prod build packages to the Chrome Web Store
            // and sign the Firefox builds. Publish the QA packages.

            // sh "tools/deploy"
        }
    }
}

// TODO: Add a final step here which publishes the production package, saving
// the need to login to the Chrome dashboard to do this.
