#!groovy

properties([
    parameters([
        choice(
          name: 'BUILD_TYPE',

          // Build types. The first value in this list is the default, per
          // https://stackoverflow.com/questions/47873401/.
          choices: ['build', 'update-hypothesis-client'],

          description: 'Build task to execute'
        )
    ])
])

node {
    deleteDir()
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

    if (params.BUILD_TYPE == 'update-hypothesis-client') {
        stage('Update Hypothesis Client') {
            nodeEnv.inside("-e HOME=${workspace}") {
                // Update Hypothesis client and set the version of the extension
                // to match the client release.
                sh "npm install --save-dev hypothesis@latest"
                newClientVersion = sh(
                    script: """node -p 'require("./package.json").devDependencies.hypothesis.match(/[0-9.]+/)[0]'""",
                    returnStdout: true
                ).trim()

                // nb. Any additional steps to test the new client release with
                // the extension can go here.

                sh "npm --no-git-tag-version version ${newClientVersion}"
            }

            withCredentials([
              usernamePassword(
                  credentialsId: 'github-jenkins-user',
                  usernameVariable: 'GIT_USERNAME',
                  passwordVariable: 'GIT_PASSWORD'
              )
            ]) {
                tagAuthor = "${GIT_USERNAME} <${GIT_USERNAME}@hypothes.is>"
                repoUrl = "https://${GIT_USERNAME}:${GIT_PASSWORD}@github.com/hypothesis/browser-extension"
                sh "git config user.email ${GIT_USERNAME}@hypothes.is"
                sh "git config user.name ${GIT_USERNAME}"
                sh "git commit -a -m 'Update Hypothesis client to ${newClientVersion}'"
                tagName = "v${newClientVersion}"
                sh "git tag ${tagName}"

                // Push the new commit to the source branch as well as the tag.
                // Make the push atomic so that both will fail if the source
                // branch has been updated since the build started.
                sh "git push --atomic ${repoUrl} HEAD:${env.BRANCH_NAME} ${tagName}"
            }
        }

        // Skip remaining pre-deploy steps.
        //
        // The `git push` to the source branch above will trigger a regular build which will in
        // turn deploy an extension release with the new client version.
        return
    }

    stage('Test') {
        nodeEnv.inside("-e HOME=${workspace}") {
          sh "make checkformatting lint test"
        }
    }

    stage('Build Packages') {
        nodeEnv.inside("-e HOME=${workspace}") {
          sh "make SETTINGS_FILE=settings/chrome-qa.json dist/${gitVersion}-chrome-qa.zip"
          sh "make SETTINGS_FILE=settings/chrome-prod.json dist/${gitVersion}-chrome-prod.zip"
          sh "make SETTINGS_FILE=settings/firefox-qa.json dist/${gitVersion}-firefox-qa.xpi"
          sh "make SETTINGS_FILE=settings/firefox-prod.json dist/${gitVersion}-firefox-prod.xpi"
        }
    }
}

if (params.BUILD_TYPE != "build") {
    echo "Skipping deployment because this is not a regular build"
    return
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
